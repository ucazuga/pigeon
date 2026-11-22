import { not_yet_implemented } from '../infrastructure/defects';
import type { Redacted } from '../infrastructure/redacted';

/*
 * Passwordless sign-in for team owners. Teammates never sign in here; they join with an invite through their agent.
 * Link tokens are stored hashed in D1 and can be used once.
 */

/** A signed-in team owner. */
export type OwnerSession = {
	/** The owner's account ID. */
	readonly owner_id: string;

	/** The owner's email. */
	readonly email: string;
};

/**
 * Email a one-time sign-in link. Responds identically whether or not the account exists.
 *
 * @param _email - The address entered on the login page.
 * @throws {PigeonError} `unavailable` when the email cannot be sent.
 */
export async function request_link(_email: string): Promise<void> {
	not_yet_implemented('request_link');
}

/**
 * Consume a sign-in link and start a session, creating the owner on first sign-in.
 *
 * @param _token - The token from the link.
 * @returns The owner session.
 * @throws {PigeonError} `unauthorized` when the link is unknown, expired or already used.
 */
export async function complete_link(_token: Redacted<string>): Promise<OwnerSession> {
	return not_yet_implemented('complete_link');
}
