import { DurableObject, env } from 'cloudflare:workers';
import type { Member } from '../members/member.schema';
import type { RelayEvent } from './thread.schema';

const HEARTBEAT_MS = 25_000;
const EVENT_RETENTION_MS = 7 * 24 * 60 * 60 * 1000;
const ENCODER = new TextEncoder();

type Waiter = {
	readonly member_id: string;
	readonly resolve: () => void;
};

/**
 * The Durable Object for one team.
 *
 * @param team_id - The team.
 * @returns A stub for that team's room.
 */
export function team_room_of(team_id: string): DurableObjectStub<TeamRoom> {
	return env.TEAM_ROOM.get(env.TEAM_ROOM.idFromName(team_id));
}

/**
 * One Durable Object per team, for live delivery only: it holds members' open event streams and pending
 * `wait_for_answer` calls, and wakes them when the Worker reports a new message. Threads themselves are in D1.
 *
 * Events are kept for a week with increasing ids, so a monitor that reconnects with `Last-Event-ID` gets what it
 * missed. An open stream keeps this object awake; if that cost ever matters, move the monitor to a hibernatable
 * WebSocket.
 */
export class TeamRoom extends DurableObject<Cloudflare.Env> {
	private readonly streams = new Map<string, Set<WritableStreamDefaultWriter<Uint8Array>>>();
	private readonly waiters = new Map<string, Set<Waiter>>();
	private heartbeat: ReturnType<typeof setInterval> | null = null;

	/**
	 * Create the room and its event log.
	 *
	 * @param ctx - Durable Object state.
	 * @param bindings - Worker bindings.
	 */
	constructor(ctx: DurableObjectState, bindings: Cloudflare.Env) {
		super(ctx, bindings);
		ctx.storage.sql.exec(
			`CREATE TABLE IF NOT EXISTS events (
				id INTEGER PRIMARY KEY AUTOINCREMENT,
				member_id TEXT NOT NULL,
				thread_id TEXT NOT NULL,
				type TEXT NOT NULL,
				data TEXT NOT NULL,
				created_at INTEGER NOT NULL
			)`,
		);
	}

	/**
	 * Record an event for a member and push it to their open streams and waiting calls.
	 *
	 * @param member_id - The recipient.
	 * @param event - What happened. Never contains message text.
	 */
	async notify(member_id: string, event: RelayEvent): Promise<void> {
		const now = Date.now();
		const data = JSON.stringify(event);
		const row = this.ctx.storage.sql
			.exec<{ id: number }>(
				'INSERT INTO events (member_id, thread_id, type, data, created_at) VALUES (?, ?, ?, ?, ?) RETURNING id',
				member_id,
				event.thread_id,
				event.type,
				data,
				now,
			)
			.one();

		this.ctx.storage.sql.exec('DELETE FROM events WHERE created_at < ?', now - EVENT_RETENTION_MS);

		for (const writer of this.streams.get(member_id) ?? []) {
			this.send(member_id, writer, `id: ${row.id}\ndata: ${data}\n\n`);
		}

		if (event.type === 'question_received') {
			return;
		}

		for (const waiter of this.waiters.get(event.thread_id) ?? []) {
			if (waiter.member_id === member_id) {
				waiter.resolve();
			}
		}
	}

	/**
	 * Open a member's event stream (`GET /api/events`). Called over RPC with the member the Worker authenticated,
	 * never by forwarding the HTTP request, so a client cannot spoof identity headers.
	 *
	 * @param member - The authenticated member.
	 * @param last_event_id - The last event id the client saw, to replay anything newer; null on first connect.
	 * @returns A `text/event-stream` response.
	 */
	async events(member: Member, last_event_id: number | null): Promise<Response> {
		const { readable, writable } = new TransformStream<Uint8Array, Uint8Array>();
		const writer = writable.getWriter();
		let writers = this.streams.get(member.member_id) ?? null;

		if (writers === null) {
			writers = new Set();
			this.streams.set(member.member_id, writers);
		}

		writers.add(writer);
		writer.closed.catch(() => this.remove(member.member_id, writer));
		this.send(member.member_id, writer, ': connected\n\n');

		this.replay(member.member_id, writer, last_event_id);
		this.start_heartbeat();

		return new Response(readable, {
			headers: { 'content-type': 'text/event-stream', 'cache-control': 'no-store' },
		});
	}

	/**
	 * Wait until the asker of a thread gets an answer or a decline, or until the timeout.
	 *
	 * @param member_id - The asker.
	 * @param thread_id - The thread.
	 * @param since - Epoch ms when the caller last saw the thread waiting; a reply recorded after it counts.
	 * @param timeout_ms - How long to wait at most.
	 */
	async wait_for_reply(member_id: string, thread_id: string, since: number, timeout_ms: number): Promise<void> {
		const already = this.ctx.storage.sql
			.exec<{ id: number }>(
				`SELECT id FROM events WHERE member_id = ? AND thread_id = ? AND created_at >= ?
				 AND type IN ('answer_received', 'question_declined') LIMIT 1`,
				member_id,
				thread_id,
				since,
			)
			.toArray();

		if (already.length > 0) {
			return;
		}

		await new Promise<void>((resolve) => {
			let waiters = this.waiters.get(thread_id) ?? null;

			if (waiters === null) {
				waiters = new Set();
				this.waiters.set(thread_id, waiters);
			}

			const waiter: Waiter = {
				member_id,
				resolve: () => {
					clearTimeout(timer);
					this.forget_waiter(thread_id, waiter);
					resolve();
				},
			};
			const timer = setTimeout(waiter.resolve, timeout_ms);

			waiters.add(waiter);
		});
	}

	private replay(
		member_id: string,
		writer: WritableStreamDefaultWriter<Uint8Array>,
		last_event_id: number | null,
	): void {
		if (last_event_id === null) {
			return;
		}

		const missed = this.ctx.storage.sql.exec<{ id: number; data: string }>(
			'SELECT id, data FROM events WHERE member_id = ? AND id > ? ORDER BY id',
			member_id,
			last_event_id,
		);

		for (const event of missed) {
			this.send(member_id, writer, `id: ${event.id}\ndata: ${event.data}\n\n`);
		}
	}

	private send(member_id: string, writer: WritableStreamDefaultWriter<Uint8Array>, frame: string): void {
		writer.write(ENCODER.encode(frame)).catch(() => this.remove(member_id, writer));
	}

	private remove(member_id: string, writer: WritableStreamDefaultWriter<Uint8Array>): void {
		const writers = this.streams.get(member_id) ?? null;

		if (writers === null) {
			return;
		}

		writers.delete(writer);

		if (writers.size === 0) {
			this.streams.delete(member_id);
		}

		if (this.streams.size === 0 && this.heartbeat) {
			clearInterval(this.heartbeat);
			this.heartbeat = null;
		}
	}

	private forget_waiter(thread_id: string, waiter: Waiter): void {
		const waiters = this.waiters.get(thread_id) ?? null;

		if (waiters === null) {
			return;
		}

		waiters.delete(waiter);

		if (waiters.size === 0) {
			this.waiters.delete(thread_id);
		}
	}

	private start_heartbeat(): void {
		if (this.heartbeat) {
			return;
		}

		this.heartbeat = setInterval(() => {
			for (const [member_id, writers] of this.streams) {
				for (const writer of writers) {
					this.send(member_id, writer, ': ping\n\n');
				}
			}
		}, HEARTBEAT_MS);
	}
}
