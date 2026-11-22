import { PigeonError } from '../pigeon-error';

/*
 * An invite is the dashboard's unit of onboarding. The owner creates it, copies a one-line prompt into
 * the teammate's hands, and watches it move: pending ("waiting for your agent") → claimed (setup ran,
 * member token issued) → connected (the member's Claude first reached the relay).
 */

type InviteBase = {
	readonly team_id: string;
	readonly handle: string;
	readonly created_at: Date;

	/** A pending invite can no longer be claimed after this. */
	readonly expires_at: Date;
};

/** The lifecycle of one teammate's onboarding. */
export type Invite =
	| (InviteBase & { readonly status: 'pending' })
	| (InviteBase & { readonly status: 'claimed'; readonly member_id: string; readonly claimed_at: Date })
	| (InviteBase & {
			readonly status: 'connected';
			readonly member_id: string;
			readonly claimed_at: Date;
			readonly connected_at: Date;
	  })
	| (InviteBase & { readonly status: 'revoked'; readonly member_id: string | null; readonly revoked_at: Date });

/**
 * Claim a pending invite for a newly created member.
 *
 * @param invite - The invite being claimed.
 * @param member_id - The member created for this invite.
 * @returns The claimed invite.
 * @throws {PigeonError} `conflict` unless the invite is pending and not expired.
 */
export function claim(invite: Invite, member_id: string): Invite {
	const now = new Date();

	if (invite.status === 'pending' && invite.expires_at <= now) {
		throw new PigeonError('conflict', 'This invite has expired; ask your team owner for a new one');
	}

	if (invite.status === 'pending') {
		return { ...invite, status: 'claimed', member_id, claimed_at: now };
	}

	throw new PigeonError('conflict', `This invite is already ${invite.status}`);
}

/**
 * Record the member's first live connection. Idempotent once connected.
 *
 * @param invite - The invite whose member connected.
 * @returns The connected invite.
 * @throws {PigeonError} `conflict` when the invite is pending or revoked.
 */
export function mark_connected(invite: Invite): Invite {
	if (invite.status === 'connected') {
		return invite;
	}

	if (invite.status === 'claimed') {
		return { ...invite, status: 'connected', connected_at: new Date() };
	}

	throw new PigeonError('conflict', `Cannot connect an invite that is ${invite.status}`);
}

/**
 * Revoke an invite and, if it was claimed, the membership it created. The handle becomes free to invite again.
 *
 * @param invite - The invite to revoke.
 * @returns The revoked invite, keeping the member ID so the member's token can be revoked too.
 * @throws {PigeonError} `conflict` when the invite is already revoked.
 */
export function revoke(invite: Invite): Invite {
	if (invite.status === 'revoked') {
		throw new PigeonError('conflict', 'This invite is already revoked');
	}

	if (invite.status === 'pending') {
		return { ...invite, status: 'revoked', member_id: null, revoked_at: new Date() };
	}

	return { ...invite, status: 'revoked', member_id: invite.member_id, revoked_at: new Date() };
}
