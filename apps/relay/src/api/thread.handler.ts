import { Hono } from 'hono';
import { not_yet_implemented } from '../infrastructure/defects';
import { type MemberVariables, require_member } from '../infrastructure/http/member-auth.middleware';
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
	.get('/api/events', () => not_yet_implemented('GET /api/events (SSE)'))
	.get('/api/threads/:thread_id/question', async (context) =>
		context.text(await open_question(context.get('member'), context.req.param('thread_id'))),
	);
