import { Hono } from 'hono';
import * as zod from 'zod';
import { type MemberVariables, require_member } from '../infrastructure/http/member-auth.middleware';
import { validate } from '../infrastructure/http/validate';
import { team_room_of } from './team-room.durable-object';
import type { UnansweredSummary } from './thread.schema';
import { count_unanswered, open_question } from './thread.service';

/**
 * Member endpoints used by the plugin scripts rather than by Claude:
 *
 * - `GET /api/events` — Server-Sent Events of `RelayEvent`s (no message text), read by the `pigeon-watch` monitor. A
 *   first connect also gets an `UnansweredSummary`.
 * - `GET /api/threads/:thread_id/question` — the open question as plain text, read by `pigeon-draft` so the question
 *   goes straight to the drafting Claude. Only the member who was asked may read it.
 */
export const thread_routes = new Hono<{ Variables: MemberVariables }>()
	.use('/api/events', require_member)
	.use('/api/threads/*', require_member)
	.get(
		'/api/events',
		// The last event id a reconnecting monitor saw. Missing or malformed: first connect, nothing to replay.
		validate('header', zod.object({ 'last-event-id': zod.coerce.number().int().nonnegative().nullable().catch(null) })),
		async (context) => {
			const member = context.get('member');
			const last_event_id = context.req.valid('header')['last-event-id'];
			let summary: UnansweredSummary | null = null;

			// A first connect is a new session: tell it about questions that arrived while no session was listening.
			if (last_event_id === null) {
				summary = { type: 'unanswered_questions', count: await count_unanswered(member) };
			}

			console.log(JSON.stringify({ event: 'events_opened', first_connect: last_event_id === null, summary }));

			return team_room_of(member.team_id).events(member, last_event_id, summary);
		},
	)
	.get(
		'/api/threads/:thread_id/question',
		validate('param', zod.object({ thread_id: zod.string().min(1).max(64) })),
		async (context) => {
			const { thread_id } = context.req.valid('param');
			const question = await open_question(context.get('member'), thread_id);

			return context.text(question);
		},
	);
