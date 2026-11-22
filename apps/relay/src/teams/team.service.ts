import { env } from 'cloudflare:workers';
import type { Owner } from '../auth/owner.service';
import { read_config } from '../infrastructure/config/config';
import { type Redacted, redact } from '../infrastructure/redacted';
import { create_token, hash_token } from '../infrastructure/token';
import { PigeonError } from '../pigeon-error';

/*
 * Everything the dashboard and setup flow do with teams: create a team, invite a teammate, revoke one,
 * and turn an invite code into member credentials. Reads and writes D1 directly.
 */

const INVITE_TTL_MS = 7 * 24 * 60 * 60 * 1000;

type InviteBase = {
	readonly team_id: string;
	readonly handle: string;
	readonly created_at: Date;

	/** A pending invite can no longer be claimed after this. */
	readonly expires_at: Date;
};

/**
 * One teammate's onboarding, as the dashboard shows it: pending ("waiting for your agent") → claimed (setup ran,
 * member token issued) → connected (the member's Claude first reached the relay), or revoked. A pending invite past
 * its expiry is expired: it can no longer be claimed.
 */
export type Invite =
	| (InviteBase & { readonly status: 'pending' })
	| (InviteBase & { readonly status: 'expired' })
	| (InviteBase & { readonly status: 'claimed'; readonly member_id: string; readonly claimed_at: Date })
	| (InviteBase & {
			readonly status: 'connected';
			readonly member_id: string;
			readonly claimed_at: Date;
			readonly connected_at: Date;
	  })
	| (InviteBase & { readonly status: 'revoked'; readonly member_id: string | null; readonly revoked_at: Date });

type InviteRow = {
	readonly invite_code_hash: string;
	readonly team_id: string;
	readonly handle: string;

	/** Stored states. `expired` is not stored; it is a pending invite past `expires_at`. */
	readonly status: 'pending' | 'claimed' | 'connected' | 'revoked';
	readonly member_id: string | null;
	readonly created_at: string;
	readonly expires_at: string;
	readonly claimed_at: string | null;
	readonly connected_at: string | null;
	readonly revoked_at: string | null;
};

/** What the dashboard shows for one team. */
export type TeamOverview = {
	/** The team's ID. */
	readonly team_id: string;

	/** Display name. */
	readonly name: string;

	/** Every invite with its onboarding state, newest first. */
	readonly invites: ReadonlyArray<Invite>;
};

/** What a claimed invite hands to the teammate's machine, exactly once. */
export type MemberCredentials = {
	/** Relay origin. */
	readonly relay_url: string;

	/** The team's display name. */
	readonly team_name: string;

	/** The new member's handle. */
	readonly handle: string;

	/** Bearer token for the relay. Stored hashed on the relay. */
	readonly member_token: Redacted<string>;
};

function date_or_epoch(value: string | null): Date {
	if (value === null) {
		return new Date(0);
	}

	return new Date(value);
}

function to_invite(invite_row: InviteRow): Invite {
	const invite_fields = {
		team_id: invite_row.team_id,
		handle: invite_row.handle,
		created_at: new Date(invite_row.created_at),
		expires_at: new Date(invite_row.expires_at),
	};

	if (invite_row.status === 'pending' && invite_fields.expires_at <= new Date()) {
		return { ...invite_fields, status: 'expired' };
	}

	if (invite_row.status === 'pending') {
		return { ...invite_fields, status: 'pending' };
	}

	if (invite_row.status === 'revoked') {
		return {
			...invite_fields,
			status: 'revoked',
			member_id: invite_row.member_id,
			revoked_at: date_or_epoch(invite_row.revoked_at),
		};
	}

	if (invite_row.member_id === null) {
		throw new Error(`Invite for ${invite_row.handle} is ${invite_row.status} without a member`);
	}

	const claimed_fields = {
		...invite_fields,
		member_id: invite_row.member_id,
		claimed_at: date_or_epoch(invite_row.claimed_at),
	};

	if (invite_row.status === 'claimed') {
		return { ...claimed_fields, status: 'claimed' };
	}

	return { ...claimed_fields, status: 'connected', connected_at: date_or_epoch(invite_row.connected_at) };
}

/** Why an invite could not be claimed, from the row read before the claim. */
function claim_refusal(invite_row: InviteRow): string {
	if (invite_row.status !== 'pending') {
		return `This invite is already ${invite_row.status}`;
	}

	if (new Date(invite_row.expires_at) <= new Date()) {
		return 'This invite has expired; ask your team owner for a new one';
	}

	return 'This invite was just used';
}

function is_unique_violation(error: unknown): boolean {
	return error instanceof Error && error.message.includes('UNIQUE constraint failed');
}

async function owned_team(owner: Owner, team_id: string): Promise<{ readonly name: string }> {
	const team = await env.DB.prepare('SELECT name FROM teams WHERE team_id = ? AND owner_id = ?')
		.bind(team_id, owner.owner_id)
		.first<{ readonly name: string }>();

	if (team === null) {
		throw new PigeonError('not_found', 'No such team');
	}

	return team;
}

/**
 * List the teams this owner owns, with invite states.
 *
 * @param owner - The signed-in owner.
 * @returns The owner's teams, newest first.
 */
export async function list_owned_teams(owner: Owner): Promise<ReadonlyArray<TeamOverview>> {
	const [teams, invite_rows] = await Promise.all([
		env.DB.prepare('SELECT team_id, name FROM teams WHERE owner_id = ? ORDER BY created_at DESC')
			.bind(owner.owner_id)
			.all<{ readonly team_id: string; readonly name: string }>(),
		env.DB.prepare(
			`SELECT invites.* FROM invites JOIN teams USING (team_id)
			 WHERE teams.owner_id = ? ORDER BY invites.created_at DESC`,
		)
			.bind(owner.owner_id)
			.all<InviteRow>(),
	]);

	return teams.results.map((team) => ({
		team_id: team.team_id,
		name: team.name,
		invites: invite_rows.results.filter((invite) => invite.team_id === team.team_id).map(to_invite),
	}));
}

/**
 * Create a team owned by the signed-in owner.
 *
 * @param owner - The signed-in owner.
 * @param name - The team's display name (already validated).
 * @returns The new team's ID.
 */
export async function create_team(owner: Owner, name: string): Promise<string> {
	const team_id = crypto.randomUUID();

	await env.DB.prepare('INSERT INTO teams (team_id, owner_id, name, created_at) VALUES (?, ?, ?, ?)')
		.bind(team_id, owner.owner_id, name, new Date().toISOString())
		.run();

	return team_id;
}

/**
 * Invite a teammate by handle. Returns the one-time invite code for the copyable setup prompt.
 *
 * @param owner - The signed-in owner.
 * @param team_id - The team to invite into.
 * @param handle - The teammate's handle (already normalized).
 * @returns The plaintext invite code, shown once. Only its hash is stored.
 * @throws {PigeonError} `not_found` for an unknown or foreign team; `conflict` when the handle is taken.
 */
export async function invite_member(owner: Owner, team_id: string, handle: string): Promise<Redacted<string>> {
	await owned_team(owner, team_id);

	const code = create_token();
	const now = Date.now();

	try {
		await env.DB.prepare(
			`INSERT INTO invites (invite_code_hash, team_id, handle, status, created_at, expires_at)
			 VALUES (?, ?, ?, 'pending', ?, ?)`,
		)
			.bind(
				await hash_token(code),
				team_id,
				handle,
				new Date(now).toISOString(),
				new Date(now + INVITE_TTL_MS).toISOString(),
			)
			.run();
	} catch (error) {
		if (is_unique_violation(error)) {
			throw new PigeonError('conflict', `@${handle} is already invited to this team`);
		}

		throw error;
	}

	return redact(code);
}

/**
 * Revoke a teammate: their invite, and their member token if they joined. Their handle can be invited again.
 *
 * @param owner - The signed-in owner.
 * @param team_id - The team.
 * @param handle - The handle to revoke.
 * @throws {PigeonError} `not_found` for an unknown team or handle.
 */
export async function revoke_member(owner: Owner, team_id: string, handle: string): Promise<void> {
	await owned_team(owner, team_id);

	const invite = await env.DB.prepare("SELECT * FROM invites WHERE team_id = ? AND handle = ? AND status != 'revoked'")
		.bind(team_id, handle)
		.first<InviteRow>();

	if (invite === null) {
		throw new PigeonError('not_found', `@${handle} has no active invite`);
	}

	const now = new Date().toISOString();

	await env.DB.batch([
		env.DB.prepare("UPDATE invites SET status = 'revoked', revoked_at = ? WHERE invite_code_hash = ?").bind(
			now,
			invite.invite_code_hash,
		),
		env.DB.prepare('UPDATE members SET revoked_at = ? WHERE member_id = ? AND revoked_at IS NULL').bind(
			now,
			invite.member_id,
		),
	]);
}

/**
 * Look up a still-claimable invite by its code, for the setup guide. Does not consume it.
 *
 * @param code - The invite code from the URL.
 * @returns The team name and handle.
 * @throws {PigeonError} `not_found` when the code is unknown, used, revoked or expired.
 */
export async function find_pending_invite(
	code: string,
): Promise<{ readonly team_name: string; readonly handle: string }> {
	const invite = await env.DB.prepare(
		`SELECT teams.name AS team_name, invites.handle FROM invites JOIN teams USING (team_id)
		 WHERE invites.invite_code_hash = ? AND invites.status = 'pending' AND invites.expires_at > ?`,
	)
		.bind(await hash_token(code), new Date().toISOString())
		.first<{ readonly team_name: string; readonly handle: string }>();

	if (invite === null) {
		throw new PigeonError('not_found', 'This invite is not valid anymore. Ask your team owner for a new one.');
	}

	return invite;
}

/**
 * Exchange an invite code for member credentials. Called once during agent-driven setup.
 * Claims with a conditional update (still pending, not expired) and creates the member in the same batch, so a code
 * can only be used once.
 *
 * @param code - The invite code.
 * @returns Member credentials, issued exactly once.
 * @throws {PigeonError} `not_found` for an unknown code; `conflict` when expired, already claimed or revoked.
 */
export async function claim_invite(code: Redacted<string>): Promise<MemberCredentials> {
	const code_hash = await hash_token(code.unwrap());
	const invite = await env.DB.prepare(
		'SELECT invites.*, teams.name AS team_name FROM invites JOIN teams USING (team_id) WHERE invite_code_hash = ?',
	)
		.bind(code_hash)
		.first<InviteRow & { readonly team_name: string }>();

	if (invite === null) {
		throw new PigeonError('not_found', 'Unknown invite code');
	}

	const member_id = crypto.randomUUID();
	const member_token = create_token();
	const now = new Date().toISOString();
	const claim_results = await env.DB.batch([
		env.DB.prepare(
			`UPDATE invites SET status = 'claimed', member_id = ?, claimed_at = ?
			 WHERE invite_code_hash = ? AND status = 'pending' AND expires_at > ?`,
		).bind(member_id, now, code_hash, now),
		env.DB.prepare(
			`INSERT INTO members (member_id, team_id, handle, token_hash, created_at)
			 SELECT ?, ?, ?, ?, ? WHERE changes() = 1`,
		).bind(member_id, invite.team_id, invite.handle, await hash_token(member_token), now),
	]);
	const claim_update = claim_results[0] ?? null;

	if (claim_update === null || claim_update.meta.changes !== 1) {
		throw new PigeonError('conflict', claim_refusal(invite));
	}

	return {
		relay_url: read_config().public_url.origin,
		team_name: invite.team_name,
		handle: invite.handle,
		member_token: redact(member_token),
	};
}

/**
 * Mark a member's invite as connected the first time they reach the relay. A no-op afterwards.
 *
 * @param member_id - The authenticated member.
 */
export async function mark_connected(member_id: string): Promise<void> {
	await env.DB.prepare(
		"UPDATE invites SET status = 'connected', connected_at = ? WHERE member_id = ? AND status = 'claimed'",
	)
		.bind(new Date().toISOString(), member_id)
		.run();
}
