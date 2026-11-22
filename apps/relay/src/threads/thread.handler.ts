import { Hono } from 'hono';
import * as zod from 'zod';
import { type MemberVariables, require_member } from '../infrastructure/http/member-auth.middleware';
import { validate } from '../infrastructure/http/validate';
import { LATEST_PLUGIN_VERSION, plugin_update_notice } from '../setup/plugin-version';
import { team_room_of } from './team-room.durable-object';
import type { ConnectNotice } from './thread.schema';
import * as thread_service from './thread.service';

/**
 * Member endpoints used by the plugin scripts rather than by Claude:
 *
 * - `GET /api/events` — Server-Sent Events of `RelayEvent`s (no message text), read by the `pigeon-watch` monitor. A
 *   first connect also gets `ConnectNotice`s.
 * - `GET /api/unanswered` — how many questions wait for the member's answer, as plain text, read by the
 *   `pigeon-pending` prompt hook.
 * - `GET /api/threads/:thread_id/question` — the open question as plain text, read by `pigeon-draft` so the question
 *   goes straight to the drafting Claude. Only the member who was asked may read it.
 */
export const thread_routes = new Hono<{ Variables: MemberVariables }>()
	.use('/api/events', require_member)
	.use('/api/unanswered', require_member)
	.use('/api/threads/*', require_member)
	.get(
		'/api/events',
		// The last event id a reconnecting monitor saw. Missing or malformed: first connect, nothing to replay.
		validate(
			'header',
			zod.object({
				'last-event-id': zod.coerce.number().int().nonnegative().nullable().catch(null),
				// Plugins before 0.3.0 send no version.
				'x-pigeon-plugin-version': zod
					.string()
					.regex(/^\d+\.\d+\.\d+$/)
					.nullable()
					.catch(null),
			}),
		),
		async (context) => {
			const member = context.get('member');
			const headers = context.req.valid('header');
			const last_event_id = headers['last-event-id'];
			const notices: ConnectNotice[] = [];

			// A first connect is a new session: tell it what it missed while no session was listening.
			if (last_event_id === null) {
				const unanswered = await thread_service.count_unanswered(member);

				if (unanswered > 0) {
					notices.push({ type: 'unanswered_questions', count: unanswered });
				}

				if (plugin_update_notice(headers['x-pigeon-plugin-version'])) {
					notices.push({ type: 'plugin_outdated', latest: LATEST_PLUGIN_VERSION });
				}
			}

			console.log(JSON.stringify({ event: 'events_opened', first_connect: last_event_id === null, notices }));

			return team_room_of(member.team_id).events(member, last_event_id, notices);
		},
	)
	.get('/api/unanswered', async (context) => {
		const unanswered = await thread_service.count_unanswered(context.get('member'));

		return context.text(String(unanswered));
	})
	.get(
		'/api/threads/:thread_id/question',
		validate('param', zod.object({ thread_id: zod.string().min(1).max(64) })),
		async (context) => {
			const { thread_id } = context.req.valid('param');
			const question = await thread_service.open_question(context.get('member'), thread_id);

			return context.text(question);
		},
	);
