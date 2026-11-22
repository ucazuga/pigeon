import { env } from 'cloudflare:workers';
import type { Owner } from '../auth/owner.service';
import { read_config } from '../infrastructure/config/config';
import { type Redacted, redact } from '../infrastructure/redacted';
import { create_token, hash_token } from '../infrastructure/token';
import { PigeonError } from '../pigeon-error';
import type { OwnedTeam } from './team.schema';

/*
 * Everything the dashboard and setup flow do with teams: create a team (with the owner's own invite), invite a
 * teammate, revoke one, and turn an invite code into member credentials. Reads and writes D1 directly.
 */

const INVITE_TTL_MS = 7 * 24 * 60 * 60 * 1000;

/** For now an owner can have one team. */
const TEAMS_PER_OWNER = 1;

const TEAM_LIMIT_MESSAGE = 'You already have a team. One team per owner for now.';

/** People in a team, the owner included: the owner plus at most this many minus one teammates. */
const TEAM_SIZE = 3;

const TEAM_FULL_MESSAGE = `This team is full: up to ${TEAM_SIZE} people, you included.`;

/**
 * SQL for the teammate seats in use: invites that are neither revoked nor expired. Binds the team ID, then the current
 * time as an ISO string.
 */
const TAKEN_TEAMMATE_SEATS_SQL = `(
	SELECT COUNT(*) FROM invites
	WHERE team_id = ? AND invitee = 'teammate' AND status != 'revoked'
	AND NOT (status = 'pending' AND expires_at <= ?)
)`;

/**
 * Who an invite is for. The owner joins their own team through an invite too: owning a team (the dashboard) and
 * being a member of it (Pigeon in your own Claude Code) are separate.
 */
export type Invitee = 'owner' | 'teammate';

type InviteBase = {
	readonly team_id: string;
	readonly handle: string;
	readonly invitee: Invitee;
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
	readonly invitee: Invitee;
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

	/** The owner's own invite while it is not revoked; null when the owner has not joined this team. */
	readonly owner_invite: Invite | null;

	/** The people to show: invites that are not revoked, the owner's first, then newest first. */
	readonly people: ReadonlyArray<Invite>;

	/** Seats in use (the owner's seat always counts) and the team's size. */
	readonly seats: { readonly taken: number; readonly total: number };

	/** Whether a teammate seat is free. The team holds the owner and up to two teammates. */
	readonly can_invite_teammate: boolean;
};

/** A new team and the owner's invite into it. */
export type CreatedTeam = {
	/** The new team's ID. */
	readonly team_id: string;

	/** The owner's one-time invite code, for their own setup prompt. Only its hash is stored. */
	readonly invite_code: Redacted<string>;
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

/** A fresh setup prompt for an invite nobody has used yet. */
export type ReissuedInvite = {
	/** Who the invite is for. */
	readonly invitee: Invitee;

	/** The new one-time code. The earlier code no longer works. */
	readonly invite_code: Redacted<string>;
};

function to_invite(invite_row: InviteRow): Invite {
	const invite_fields = {
		team_id: invite_row.team_id,
		handle: invite_row.handle,
		invitee: invite_row.invitee,
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
			revoked_at: new Date(invite_row.revoked_at ?? 0),
		};
	}

	if (invite_row.member_id === null) {
		throw new Error(`Invite for ${invite_row.handle} is ${invite_row.status} without a member`);
	}

	const claimed_fields = {
		...invite_fields,
		member_id: invite_row.member_id,
		claimed_at: new Date(invite_row.claimed_at ?? 0),
	};

	if (invite_row.status === 'claimed') {
		return { ...claimed_fields, status: 'claimed' };
	}

	return { ...claimed_fields, status: 'connected', connected_at: new Date(invite_row.connected_at ?? 0) };
}

/**
 * An INSERT for a new pending invite, with the code it stores the hash of. A teammate invite inserts nothing when the
 * teammate seats are taken; the count runs inside the INSERT, so concurrent invites cannot overfill the team. The
 * owner's own seat is capped by the `invites_active_owner` index instead.
 */
async function prepare_invite_insert(
	team_id: string,
	handle: string,
	invitee: Invitee,
): Promise<{ readonly insert: D1PreparedStatement; readonly invite_code: Redacted<string> }> {
	const invite_code = create_token();
	const now = Date.now();
	const created_at = new Date(now).toISOString();
	const insert = env.DB.prepare(
		`INSERT INTO invites (invite_code_hash, team_id, handle, invitee, status, created_at, expires_at)
		 SELECT ?, ?, ?, ?, 'pending', ?, ?
		 WHERE ? = 'owner' OR ${TAKEN_TEAMMATE_SEATS_SQL} < ?`,
	).bind(
		await hash_token(invite_code),
		team_id,
		handle,
		invitee,
		created_at,
		new Date(now + INVITE_TTL_MS).toISOString(),
		invitee,
		team_id,
		created_at,
		TEAM_SIZE - 1,
	);

	return { insert, invite_code: redact(invite_code) };
}

/** A team's dashboard view, from its invites (newest first). */
function to_overview(team_id: string, name: string, invites: ReadonlyArray<Invite>): TeamOverview {
	const owner_invite = invites.find((invite) => invite.invitee === 'owner' && invite.status !== 'revoked') ?? null;
	// Revoked and expired invites free their seat.
	const teammate_seats = invites.filter(
		(invite) => invite.invitee === 'teammate' && invite.status !== 'revoked' && invite.status !== 'expired',
	).length;
	const teammates = invites.filter((invite) => invite.invitee === 'teammate' && invite.status !== 'revoked');
	let people = teammates;

	if (owner_invite) {
		people = [owner_invite, ...teammates];
	}

	return {
		team_id,
		name,
		invites,
		owner_invite,
		people,
		seats: { taken: 1 + teammate_seats, total: TEAM_SIZE },
		can_invite_teammate: teammate_seats < TEAM_SIZE - 1,
	};
}

/**
 * List the teams this owner owns, with invite states.
 *
 * @param owner - The signed-in owner.
 * @returns The owner's teams, newest first.
 */
export async function list(owner: Owner): Promise<ReadonlyArray<TeamOverview>> {
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

	return teams.results.map((team) => {
		const invites = invite_rows.results.filter((invite) => invite.team_id === team.team_id).map(to_invite);

		return to_overview(team.team_id, team.name, invites);
	});
}

/**
 * One owned team, with invite states.
 *
 * @param team - The team, checked by `require_owned_team`.
 * @returns The team's overview.
 */
export async function get(team: OwnedTeam): Promise<TeamOverview> {
	const { results: invite_rows } = await env.DB.prepare(
		'SELECT * FROM invites WHERE team_id = ? ORDER BY created_at DESC',
	)
		.bind(team.team_id)
		.all<InviteRow>();

	return to_overview(team.team_id, team.name, invite_rows.map(to_invite));
}

async function count_teams(owner: Owner): Promise<number> {
	const counted = await env.DB.prepare('SELECT COUNT(*) AS team_count FROM teams WHERE owner_id = ?')
		.bind(owner.owner_id)
		.first<{ readonly team_count: number }>();

	// COUNT(*) always returns a row; null only satisfies the driver's type.
	if (counted === null) {
		return 0;
	}

	return counted.team_count;
}

/**
 * Whether the owner may create another team, for showing or hiding the form.
 *
 * @param teams - The owner's teams, from {@link list}.
 * @returns True while the owner is under the team limit.
 */
export function can_create(teams: ReadonlyArray<TeamOverview>): boolean {
	return teams.length < TEAMS_PER_OWNER;
}

/**
 * Create a team owned by the signed-in owner, and the owner's own invite into it, so they can set Pigeon up on their
 * machine first. An owner can have one team for now.
 *
 * @param owner - The signed-in owner.
 * @param name - The team's display name (already validated).
 * @param owner_handle - The handle the owner will use in this team (already normalized).
 * @returns The new team and the owner's invite code.
 * @throws {PigeonError} `conflict` when the owner already has a team.
 */
export async function create(owner: Owner, name: string, owner_handle: string): Promise<CreatedTeam> {
	if ((await count_teams(owner)) >= TEAMS_PER_OWNER) {
		throw new PigeonError('conflict', TEAM_LIMIT_MESSAGE);
	}

	const team_id = crypto.randomUUID();
	const owner_invite = await prepare_invite_insert(team_id, owner_handle, 'owner');

	try {
		// The team insert re-checks the limit, so two concurrent requests cannot both pass. When it inserts nothing,
		// the invite insert fails on its team foreign key and the whole batch rolls back.
		await env.DB.batch([
			env.DB.prepare(
				`INSERT INTO teams (team_id, owner_id, name, created_at)
				 SELECT ?, ?, ?, ? WHERE (SELECT COUNT(*) FROM teams WHERE owner_id = ?) < ?`,
			).bind(team_id, owner.owner_id, name, new Date().toISOString(), owner.owner_id, TEAMS_PER_OWNER),
			owner_invite.insert,
		]);
	} catch (error) {
		if ((await count_teams(owner)) >= TEAMS_PER_OWNER) {
			throw new PigeonError('conflict', TEAM_LIMIT_MESSAGE);
		}

		throw error;
	}

	return { team_id, invite_code: owner_invite.invite_code };
}

/**
 * Invite someone into a team by handle: a teammate, or the owner joining their own team.
 *
 * @param team - The team to invite into, checked by `require_owned_team`.
 * @param handle - The invitee's handle (already normalized).
 * @param invitee - Whether this is a teammate or the owner themselves.
 * @returns The plaintext invite code, shown once. Only its hash is stored.
 * @throws {PigeonError} `conflict` when the handle is taken, the owner is already in the team, or the team is full
 *   (the owner and two teammates).
 */
export async function invite(team: OwnedTeam, handle: string, invitee: Invitee): Promise<Redacted<string>> {
	const invite = await prepare_invite_insert(team.team_id, handle, invitee);
	let inserted = 0;

	try {
		inserted = (await invite.insert.run()).meta.changes;
	} catch (error) {
		if (error instanceof Error === false || error.message.includes('UNIQUE constraint failed') === false) {
			throw error;
		}

		// SQLite names the columns of the violated index: (team_id, handle) for a taken handle, (team_id) for a second
		// active owner invite.
		if (error.message.includes('invites.handle')) {
			throw new PigeonError('conflict', `@${handle} is already invited to this team`);
		}

		throw new PigeonError('conflict', 'You are already in this team. Remove your row first to join again.');
	}

	if (inserted === 0) {
		throw new PigeonError('conflict', TEAM_FULL_MESSAGE);
	}

	return invite.invite_code;
}

/**
 * Give an unused invite a new code and a new 7-day window. Only the code's hash is stored, so an earlier prompt cannot
 * be shown again; this replaces it instead, and the earlier code stops working. Renewing an expired teammate invite
 * takes a seat again, so it is refused when the team is full; the check runs inside the UPDATE.
 *
 * @param team - The team, checked by `require_owned_team`.
 * @param handle - Whose invite to renew.
 * @returns The new code, with who the invite is for.
 * @throws {PigeonError} `not_found` for an unknown handle, `conflict` when the invite was already used or the team is
 *   full.
 */
export async function reissue_invite(team: OwnedTeam, handle: string): Promise<ReissuedInvite> {
	const invite_row = await env.DB.prepare(
		"SELECT * FROM invites WHERE team_id = ? AND handle = ? AND status != 'revoked'",
	)
		.bind(team.team_id, handle)
		.first<InviteRow>();

	if (invite_row === null) {
		throw new PigeonError('not_found', `@${handle} has no active invite`);
	}

	if (invite_row.status !== 'pending') {
		throw new PigeonError('conflict', `@${handle} already used their prompt. Remove them to start over.`);
	}

	const invite_code = create_token();
	const now = new Date();
	const renewal = await env.DB.prepare(
		`UPDATE invites SET invite_code_hash = ?, expires_at = ?
		 WHERE invite_code_hash = ? AND status = 'pending'
		 AND (invitee = 'owner' OR expires_at > ? OR ${TAKEN_TEAMMATE_SEATS_SQL} < ?)`,
	)
		.bind(
			await hash_token(invite_code),
			new Date(now.getTime() + INVITE_TTL_MS).toISOString(),
			invite_row.invite_code_hash,
			now.toISOString(),
			team.team_id,
			now.toISOString(),
			TEAM_SIZE - 1,
		)
		.run();

	if (renewal.meta.changes === 0) {
		throw new PigeonError('conflict', TEAM_FULL_MESSAGE);
	}

	return { invitee: invite_row.invitee, invite_code: redact(invite_code) };
}

/**
 * Revoke a teammate: their invite, and their member token if they joined. Their handle can be invited again.
 *
 * @param team - The team, checked by `require_owned_team`.
 * @param handle - The handle to revoke.
 * @throws {PigeonError} `not_found` for an unknown handle.
 */
export async function revoke_member(team: OwnedTeam, handle: string): Promise<void> {
	const invite = await env.DB.prepare("SELECT * FROM invites WHERE team_id = ? AND handle = ? AND status != 'revoked'")
		.bind(team.team_id, handle)
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
export async function get_pending_invite(
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

	// The row read before the claim says why the claim updated nothing.
	if (claim_update === null || claim_update.meta.changes !== 1) {
		if (invite.status !== 'pending') {
			throw new PigeonError('conflict', `This invite is already ${invite.status}`);
		}

		if (new Date(invite.expires_at) <= new Date()) {
			throw new PigeonError('conflict', 'This invite has expired; ask your team owner for a new one');
		}

		throw new PigeonError('conflict', 'This invite was just used');
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
