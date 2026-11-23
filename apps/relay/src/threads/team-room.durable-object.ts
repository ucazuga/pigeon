import { DurableObject, env } from 'cloudflare:workers';
import type { Member } from '../teams/team.schema';
import type { ConnectNotice, RelayEvent } from './thread.schema';

const HEARTBEAT_MS = 25_000;
const EVENT_RETENTION_MS = 7 * 24 * 60 * 60 * 1000;
const ENCODER = new TextEncoder();

type Waiter = {
	readonly member_id: string;
	readonly resolve: () => void;
};

/** The room (Durable Object stub) of one team. */
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

	/** Create the room and its event log. */
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
	 * @param event - What happened. Never contains message text.
	 */
	async notify(member_id: string, event: RelayEvent): Promise<void> {
		const now = Date.now();
		const event_json = JSON.stringify(event);
		const stored_event = this.ctx.storage.sql
			.exec<{ id: number }>(
				'INSERT INTO events (member_id, thread_id, type, data, created_at) VALUES (?, ?, ?, ?, ?) RETURNING id',
				member_id,
				event.thread_id,
				event.type,
				event_json,
				now,
			)
			.one();

		this.ctx.storage.sql.exec('DELETE FROM events WHERE created_at < ?', now - EVENT_RETENTION_MS);

		for (const writer of this.streams.get(member_id) ?? []) {
			this.send(member_id, writer, `id: ${stored_event.id}\ndata: ${event_json}\n\n`);
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
	 * Open a member's event stream (`GET /api/events`). Called over RPC with the member the Worker authenticated, never by forwarding the HTTP request, so a client cannot spoof
	 * identity headers.
	 *
	 * @param last_event_id - The last event id the client saw, to replay anything newer; null on first connect.
	 * @param notices - Sent first, without event ids; empty unless this is a first connect.
	 */
	async events(member: Member, last_event_id: number | null, notices: ReadonlyArray<ConnectNotice>): Promise<Response> {
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

		for (const notice of notices) {
			this.send(member.member_id, writer, `data: ${JSON.stringify(notice)}\n\n`);
		}

		this.replay(member.member_id, writer, last_event_id);

		// The newest event id, even when it is someone else's: the client sends it back on reconnect, so a reconnect is never mistaken for a new session (which would repeat the
		// notices) and replays only what is newer. Sent after the replay, so it is the last id the client keeps.
		const newest_event = this.ctx.storage.sql.exec<{ id: number }>('SELECT COALESCE(MAX(id), 0) AS id FROM events').one();

		this.send(member.member_id, writer, `id: ${newest_event.id}\n\n`);
		this.start_heartbeat();

		return new Response(readable, {
			headers: { 'content-type': 'text/event-stream', 'cache-control': 'no-store' },
		});
	}

	/** Wait until the asker of a thread gets an answer to, or a decline of, `question_id`, or until the timeout. */
	async wait_for_reply(member_id: string, thread_id: string, question_id: string, timeout_ms: number): Promise<void> {
		// Matched by the question, not by time: the Worker's clock and this object's clock can differ.
		const earlier_replies = this.ctx.storage.sql
			.exec<{ id: number }>(
				`SELECT id FROM events WHERE member_id = ? AND thread_id = ? AND type IN ('answer_received', 'question_declined')
				 AND json_extract(data, '$.in_reply_to') = ? LIMIT 1`,
				member_id,
				thread_id,
				question_id,
			)
			.toArray();

		if (earlier_replies.length > 0) {
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

	/** A member was removed: close their event streams and let their pending waits return. */
	async disconnect(member_id: string): Promise<void> {
		for (const writer of [...(this.streams.get(member_id) ?? [])]) {
			this.remove(member_id, writer);
			writer.close().catch(() => this.remove(member_id, writer));
		}

		for (const waiters of this.waiters.values()) {
			for (const waiter of [...waiters]) {
				if (waiter.member_id === member_id) {
					waiter.resolve();
				}
			}
		}
	}

	private replay(member_id: string, writer: WritableStreamDefaultWriter<Uint8Array>, last_event_id: number | null): void {
		if (last_event_id === null) {
			return;
		}

		const missed_events = this.ctx.storage.sql.exec<{ id: number; data: string }>(
			'SELECT id, data FROM events WHERE member_id = ? AND id > ? ORDER BY id',
			member_id,
			last_event_id,
		);

		for (const event of missed_events) {
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
