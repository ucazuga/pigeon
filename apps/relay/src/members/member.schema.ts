import * as zod from 'zod';

/**
 * How teammates address each other, e.g. `ahmet` in `/pigeon:ask @ahmet …`. Unique within a team.
 * Normalized to lowercase; a leading `@` is accepted and dropped.
 */
export const MEMBER_HANDLE = zod
	.string()
	.trim()
	.toLowerCase()
	.transform((raw) => raw.replace(/^@/, ''))
	.pipe(zod.string().regex(/^[a-z][a-z0-9-]{1,31}$/, 'must be 2-32 chars of a-z, 0-9 or -, starting with a letter'));

/** A team member, as resolved from their token by the auth middleware. Every MCP call and team room call carries one. */
export type Member = {
	/** The member's team. */
	readonly team_id: string;

	/** Stable member ID. Threads and invites refer to members by this, never by handle. */
	readonly member_id: string;

	/** The member's handle, for display and for addressing questions. */
	readonly handle: string;
};
