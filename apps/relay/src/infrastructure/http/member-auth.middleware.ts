import { env } from 'cloudflare:workers';
import type { MiddlewareHandler } from 'hono';
import { PigeonError } from '../../pigeon-error';
import type { Member } from '../../teams/team.schema';
import * as team_service from '../../teams/team.service';
import { hash_token } from '../token';

/** Hono variables set by {@link require_member}. */
export type MemberVariables = {
	/** The authenticated member. */
	member: Member;
};

const BEARER_PREFIX = 'Bearer ';

/**
 * Hono middleware: require `Authorization: Bearer <member token>` and expose the member as `member`.
 * Tokens are looked up by SHA-256 hash in D1 and never logged or echoed. Revoked members are rejected.
 * The first authenticated request also marks the member's invite as connected, for the dashboard.
 *
 * @throws {PigeonError} `unauthorized` for a missing, unknown or revoked token.
 */
export const require_member: MiddlewareHandler<{ Variables: MemberVariables }> = async (context, next) => {
	const authorization = context.req.header('Authorization') ?? '';

	if (authorization.startsWith(BEARER_PREFIX) === false) {
		throw new PigeonError('unauthorized', 'Missing member token');
	}

	const member = await find_member_by_token(authorization.slice(BEARER_PREFIX.length));

	await team_service.mark_connected(member.member_id);
	context.set('member', member);

	await next();
};

async function find_member_by_token(token: string): Promise<Member> {
	const member = await env.DB.prepare(
		'SELECT team_id, member_id, handle FROM members WHERE token_hash = ? AND revoked_at IS NULL',
	)
		.bind(await hash_token(token))
		.first<Member>();

	if (member === null) {
		throw new PigeonError('unauthorized', 'Unknown or revoked member token');
	}

	return member;
}
