import { Hono } from 'hono';
import * as zod from 'zod';
import { read_config } from '../infrastructure/config/config';
import { redact } from '../infrastructure/redacted';
import { render_setup_guide } from '../setup/setup-guide';
import { claim_invite, find_pending_invite } from '../teams/team.service';

const INVITE_CODE = zod.string().regex(/^[A-Za-z0-9_-]{16,128}$/, 'not an invite code');

const JOIN_REQUEST = zod.object({ invite_code: INVITE_CODE });

/**
 * Agent-driven onboarding.
 *
 * - `GET  /setup/:invite_code.md`  markdown guide the teammate's agent follows. Reading it never uses up the invite.
 * - `POST /api/join`               exchanges an invite code for member credentials, once
 */
export const setup_routes = new Hono()
	.get('/setup/:file', async (context) => {
		const code = INVITE_CODE.parse(context.req.param('file').replace(/\.md$/, ''));
		const invite = await find_pending_invite(code);
		const guide = render_setup_guide({
			origin: read_config().public_url.origin,
			invite_code: code,
			team_name: invite.team_name,
			handle: invite.handle,
		});

		return context.body(guide, 200, { 'content-type': 'text/markdown; charset=utf-8', 'cache-control': 'no-store' });
	})
	.post('/api/join', async (context) => {
		const request = JOIN_REQUEST.parse(await context.req.json());
		const credentials = await claim_invite(redact(request.invite_code));

		// One line of JSON in a fixed key order: the plugin scripts read it with sed, without jq.
		return context.body(
			JSON.stringify({
				relay_url: credentials.relay_url,
				team_name: credentials.team_name,
				handle: credentials.handle,
				member_token: credentials.member_token.unwrap(),
			}),
			200,
			{ 'content-type': 'application/json', 'cache-control': 'no-store' },
		);
	});
