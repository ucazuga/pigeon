import type { OwnerSession } from '../accounts/owner-login.service';
import { not_yet_implemented } from '../infrastructure/defects';
import type { Redacted } from '../infrastructure/redacted';
import type { Invite } from './invite';

/*
 * Everything the dashboard and setup flow do with teams: create a team, invite a teammate,
 * and turn an invite code into member credentials. Reads and writes D1 directly.
 */

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

/**
 * List the teams this owner owns, with invite states.
 *
 * @param _owner - The signed-in owner.
 * @returns The owner's teams.
 * @throws {PigeonError} `unavailable` when D1 fails.
 */
export async function list_owned_teams(_owner: OwnerSession): Promise<ReadonlyArray<TeamOverview>> {
	return not_yet_implemented('list_owned_teams');
}

/**
 * Create a team owned by the signed-in owner.
 *
 * @param _owner - The signed-in owner.
 * @param _name - The team's display name.
 * @returns The new team.
 * @throws {PigeonError} `unavailable` when D1 fails.
 */
export async function create_team(_owner: OwnerSession, _name: string): Promise<TeamOverview> {
	return not_yet_implemented('create_team');
}

/**
 * Invite a teammate by handle. Returns the one-time invite code for the copyable setup prompt.
 *
 * @param _owner - The signed-in owner.
 * @param _team_id - The team to invite into.
 * @param _handle - The teammate's handle within the team.
 * @returns The invite and its plaintext code, shown once.
 * @throws {PigeonError} `not_found` for an unknown or foreign team; `conflict` when the handle is taken.
 */
export async function invite_member(
	_owner: OwnerSession,
	_team_id: string,
	_handle: string,
): Promise<{ readonly invite: Invite; readonly code: Redacted<string> }> {
	return not_yet_implemented('invite_member');
}

/**
 * Revoke a teammate: their invite, and their member token if they joined. Their handle can be invited again.
 *
 * @param _owner - The signed-in owner.
 * @param _team_id - The team.
 * @param _handle - The handle to revoke.
 * @throws {PigeonError} `not_found` for an unknown team or handle.
 */
export async function revoke_member(_owner: OwnerSession, _team_id: string, _handle: string): Promise<void> {
	not_yet_implemented('revoke_member');
}

/**
 * Exchange an invite code for member credentials. Called by `pigeon-join` during agent-driven setup.
 * Must claim with a conditional update and create the member in the same D1 batch (see the migration).
 *
 * @param _code - The invite code from the setup prompt.
 * @returns Member credentials, issued exactly once.
 * @throws {PigeonError} `not_found` for an unknown code; `conflict` when expired, already claimed or revoked.
 */
export async function claim_invite(_code: Redacted<string>): Promise<MemberCredentials> {
	return not_yet_implemented('claim_invite');
}
