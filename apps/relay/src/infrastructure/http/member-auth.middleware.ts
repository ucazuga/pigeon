import { env } from 'cloudflare:workers';
import type { MiddlewareHandler } from 'hono';
import type { Member } from '../../members/member.schema';
import { PigeonError } from '../../pigeon-error';

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
 * @throws {PigeonError} `unauthorized` for a missing, unknown or revoked token.
 */
export const require_member: MiddlewareHandler<{ Variables: MemberVariables }> = async (context, next) => {
	const header = context.req.header('Authorization') ?? '';

	if (header.startsWith(BEARER_PREFIX) === false) {
		throw new PigeonError('unauthorized', 'Missing member token');
	}

	context.set('member', await find_member_by_token(header.slice(BEARER_PREFIX.length)));

	await next();
};

/**
 * Hex-encoded SHA-256 of a token, as stored in `members.token_hash`.
 *
 * @param token - The raw token.
 * @returns The hash.
 */
export async function hash_token(token: string): Promise<string> {
	const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(token));

	return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('');
}

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
