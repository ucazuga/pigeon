import { env } from 'cloudflare:workers';
import type { MiddlewareHandler } from 'hono';
import type { Member } from '../../members/member.schema';
import { PigeonError } from '../../pigeon-error';
import { not_yet_implemented } from '../defects';

/** Hono variables set by {@link require_member}. */
export type MemberVariables = {
	/** The authenticated member. */
	member: Member;
};

const BEARER_PREFIX = 'Bearer ';

/**
 * Hono middleware: require `Authorization: Bearer <member token>` and expose the member as `member`.
 * Tokens are looked up by SHA-256 hash in D1 and never logged or echoed. Revoked members are rejected.
 *
 * @throws {PigeonError} `unauthorized` for a missing or unknown token; `unavailable` when D1 fails.
 */
export const require_member: MiddlewareHandler<{ Variables: MemberVariables }> = async (context, next) => {
	const header = context.req.header('Authorization') ?? '';

	if (header.startsWith(BEARER_PREFIX) === false) {
		throw new PigeonError('unauthorized', 'Missing member token');
	}

	context.set('member', await find_member_by_token(header.slice(BEARER_PREFIX.length)));

	await next();
};

async function find_member_by_token(_token: string): Promise<Member> {
	// Must match only active members: `WHERE token_hash = ? AND revoked_at IS NULL`.
	return not_yet_implemented(`find member by token hash in ${typeof env.DB}`);
}
