import { DurableObject } from 'cloudflare:workers';
import { not_yet_implemented } from '../infrastructure/defects';
import type { Member } from '../members/member.schema';
import type { RelayEvent } from './thread.schema';

/**
 * One Durable Object per team, for live delivery only: it holds members' open event streams and pending
 * `wait_for_answer` calls, and wakes them when the Worker reports a new message. Threads themselves are in D1.
 */
export class TeamRoom extends DurableObject<Cloudflare.Env> {
	/**
	 * Push an event to a member's open streams and waiting calls. Called by the Worker after a message is saved.
	 *
	 * @param _member_id - The recipient.
	 * @param _event - What happened.
	 */
	async notify(_member_id: string, _event: RelayEvent): Promise<void> {
		not_yet_implemented('TeamRoom.notify');
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
