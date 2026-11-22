import { Hono } from 'hono';
import * as zod from 'zod';
import { type MemberVariables, require_member } from '../infrastructure/http/member-auth.middleware';
import { validate } from '../infrastructure/http/validate';
import { team_room_of } from './team-room.durable-object';
import { open_question } from './thread.service';

/**
 * Member endpoints used by the plugin scripts rather than by Claude:
 *
 * - `GET /api/events` — Server-Sent Events of `RelayEvent`s (no message text), read by the `pigeon-watch` monitor.
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

			return team_room_of(member.team_id).events(member, context.req.valid('header')['last-event-id']);
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
