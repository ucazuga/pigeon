import { env } from 'cloudflare:workers';
import { read_config } from '../infrastructure/config/config';
import { send_magic_link } from '../infrastructure/email/email.service';
import { create_token, hash_token } from '../infrastructure/token';
import { PigeonError } from '../pigeon-error';

/*
 * Passwordless sign-in for team owners. Teammates never sign in here; they join with an invite through their agent.
 * Link tokens are stored hashed in D1, expire after 15 minutes and work once.
 */

const LINK_TTL_MS = 15 * 60 * 1000;

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
 * @param email - The address entered on the login page (already validated and lowercased).
 * @throws {PigeonError} `unavailable` when the email cannot be sent.
 */
export async function request_link(email: string): Promise<void> {
	const token = create_token();

	await env.DB.prepare('INSERT INTO login_links (token_hash, email, expires_at) VALUES (?, ?, ?)')
		.bind(await hash_token(token), email, new Date(Date.now() + LINK_TTL_MS).toISOString())
		.run();

	const link = new URL('/login/verify', read_config().public_url);

	link.searchParams.set('token', token);
	await send_magic_link(email, link);
}

/**
 * Consume a sign-in link and start a session, creating the owner on first sign-in.
 *
 * @param token - The token from the link.
 * @returns The owner.
 * @throws {PigeonError} `unauthorized` when the link is unknown, expired or already used.
 */
export async function complete_link(token: string): Promise<OwnerSession> {
	const now = new Date().toISOString();
	const link = await env.DB.prepare(
		`UPDATE login_links SET consumed_at = ?
		 WHERE token_hash = ? AND consumed_at IS NULL AND expires_at > ? RETURNING email`,
	)
		.bind(now, await hash_token(token), now)
		.first<{ readonly email: string }>();

	if (link === null) {
		throw new PigeonError('unauthorized', 'This sign-in link is invalid, expired or already used');
	}

	await env.DB.prepare('INSERT OR IGNORE INTO owners (owner_id, email, created_at) VALUES (?, ?, ?)')
		.bind(crypto.randomUUID(), link.email, now)
		.run();

	return find_owner_by_email(link.email);
}

/**
 * Load an owner by ID, for an existing session.
 *
 * @param owner_id - The owner's ID from the session cookie.
 * @returns The owner, or null when the account no longer exists.
 */
export async function find_owner(owner_id: string): Promise<OwnerSession | null> {
	return env.DB.prepare('SELECT owner_id, email FROM owners WHERE owner_id = ?').bind(owner_id).first<OwnerSession>();
}

async function find_owner_by_email(email: string): Promise<OwnerSession> {
	const owner = await env.DB.prepare('SELECT owner_id, email FROM owners WHERE email = ?')
		.bind(email)
		.first<OwnerSession>();

	if (owner === null) {
		throw new Error('Owner row missing right after insert');
	}

	return owner;
}
