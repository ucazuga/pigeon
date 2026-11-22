import { DurableObject } from 'cloudflare:workers';
import { not_yet_implemented } from '../infrastructure/defects';
import type { Member } from '../members/member.schema';
import type { ThreadCommand } from './thread.schema';

/**
 * One Durable Object per team. Holds the team's threads in DO SQLite, enforces turn-taking with `thread.ts`,
 * and pushes events to members' open event streams. The Worker authenticates members before calling in,
 * so every call here comes from a known member of this team.
 */
export class TeamRoom extends DurableObject<Cloudflare.Env> {
	/**
	 * Open a thread by asking a teammate.
	 *
	 * @param _asker - The member asking.
	 * @param _to - The handle being asked; resolved to a member ID here, so threads never depend on handles.
	 * @param _question - The question.
	 * @returns The new thread and question IDs.
	 * @throws {PigeonError} `not_found` when no teammate has that handle.
	 */
	async ask(
		_asker: Member,
		_to: string,
		_question: string,
	): Promise<{ readonly thread_id: string; readonly question_id: string }> {
		return not_yet_implemented('TeamRoom.ask');
	}

	/**
	 * Continue a thread: follow up, answer or decline.
	 *
	 * @param _actor - The member acting.
	 * @param _thread_id - The thread.
	 * @param _command - What to do.
	 * @throws {PigeonError} `not_found` for an unknown thread; `forbidden` / `conflict` from the turn-taking rules.
	 */
	async post(_actor: Member, _thread_id: string, _command: ThreadCommand): Promise<void> {
		not_yet_implemented('TeamRoom.post');
	}

	/**
	 * The open question in a thread, for `pigeon-draft`.
	 *
	 * @param _member - The member asking for it; must be the thread's answerer.
	 * @param _thread_id - The thread.
	 * @returns The question text.
	 * @throws {PigeonError} `not_found` for an unknown thread; `forbidden` unless the member was asked;
	 *   `conflict` when no question is open.
	 */
	async open_question(_member: Member, _thread_id: string): Promise<string> {
		return not_yet_implemented('TeamRoom.open_question');
	}

	/**
	 * Open a member's event stream (`GET /api/events`). Called over RPC with the member the Worker authenticated,
	 * never by forwarding the HTTP request, so a client cannot spoof identity headers.
	 *
	 * Implementation notes:
	 * - send `: ping` heartbeats so idle connections survive proxies;
	 * - give events ids and honour `Last-Event-ID`, so nothing is lost while the monitor reconnects;
	 * - an open SSE stream keeps the Durable Object awake (only WebSockets hibernate); if that cost matters,
	 *   switch the monitor to a hibernatable WebSocket.
	 *
	 * @param _member - The authenticated member.
	 * @returns A `text/event-stream` response.
	 */
	async events(_member: Member): Promise<Response> {
		return not_yet_implemented('TeamRoom.events');
	}
}
