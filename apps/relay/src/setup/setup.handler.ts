import { env } from 'cloudflare:workers';
import { Hono, type MiddlewareHandler } from 'hono';
import * as zod from 'zod';
import { read_config } from '../infrastructure/config/config';
import { client_ip, enforce_rate_limit } from '../infrastructure/http/rate-limit';
import { validate } from '../infrastructure/http/validate';
import { redact } from '../infrastructure/redacted';
import * as team_service from '../teams/team.service';
import { render_setup_guide } from './setup-guide';

const INVITE_CODE = zod.string().regex(/^[A-Za-z0-9_-]{16,128}$/, 'not an invite code');

/** Runs before the body is parsed, so malformed requests count against the limit too. */
const limit_joins: MiddlewareHandler = async (context, next) => {
	await enforce_rate_limit(env.JOIN_LIMITER, `ip:${client_ip(context)}`);
	await next();
};

/**
 * Agent-driven onboarding.
 *
 * - `GET  /setup/:invite_code.md`  markdown guide the teammate's agent follows. Reading it never uses up the invite.
 * - `POST /api/join`               exchanges an invite code for member credentials, once
 */
export const setup_routes = new Hono()
	.get(
		'/setup/:file',
		// The file name is the invite code: `/setup/<code>.md`.
		validate(
			'param',
			zod.object({
				file: zod
					.string()
					.transform((file) => file.replace(/\.md$/, ''))
					.pipe(INVITE_CODE),
			}),
		),
		async (context) => {
			const invite_code = context.req.valid('param').file;
			const invite = await team_service.get_pending_invite(invite_code);
			const guide = render_setup_guide({
				origin: read_config().public_url.origin,
				invite_code,
				team_name: invite.team_name,
				handle: invite.handle,
			});

			return context.body(guide, 200, { 'content-type': 'text/markdown; charset=utf-8', 'cache-control': 'no-store' });
		},
	)
	.post('/api/join', limit_joins, validate('json', zod.object({ invite_code: INVITE_CODE })), async (context) => {
		const credentials = await team_service.claim_invite(redact(context.req.valid('json').invite_code));

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
