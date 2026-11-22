import { Hono } from 'hono';
import { type MemberVariables, require_member } from '../infrastructure/http/member-auth.middleware';
import { team_room_of } from '../threads/team-room';
import { open_question } from '../threads/thread.service';

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
	.get('/api/events', async (context) => {
		const member = context.get('member');
		const last_event_id = Number.parseInt(context.req.header('Last-Event-ID') ?? '', 10);
		let replay_from: number | null = null;

		if (Number.isSafeInteger(last_event_id)) {
			replay_from = last_event_id;
		}

		return team_room_of(member.team_id).events(member, replay_from);
	})
	.get('/api/threads/:thread_id/question', async (context) =>
		context.text(await open_question(context.get('member'), context.req.param('thread_id'))),
	);
