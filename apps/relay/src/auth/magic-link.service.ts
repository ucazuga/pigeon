import { env } from 'cloudflare:workers';
import { read_config } from '../infrastructure/config/config';
import * as email_service from '../infrastructure/email/email.service';
import { create_token, hash_token } from '../infrastructure/token';
import { PigeonError } from '../pigeon-error';

/*
 * Passwordless sign-in links for team owners: proving someone controls an email address. Teammates never sign in
 * here; they join with an invite through their agent. Link tokens are stored hashed in D1, expire after 15 minutes
 * and work once.
 */

const LINK_TTL_MS = 15 * 60 * 1000;

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

	const sign_in_url = new URL('/verify', read_config().public_url);

	sign_in_url.searchParams.set('token', token);
	await email_service.send_magic_link(email, sign_in_url);
}

/**
 * Consume a sign-in link.
 *
 * @param token - The token from the link.
 * @returns The email address the link was sent to, now verified.
 * @throws {PigeonError} `unauthorized` when the link is unknown, expired or already used.
 */
export async function consume_link(token: string): Promise<string> {
	const now = new Date().toISOString();
	const consumed_link = await env.DB.prepare(
		`UPDATE login_links SET consumed_at = ?
		 WHERE token_hash = ? AND consumed_at IS NULL AND expires_at > ? RETURNING email`,
	)
		.bind(now, await hash_token(token), now)
		.first<{ readonly email: string }>();

	if (consumed_link === null) {
		throw new PigeonError('unauthorized', 'This sign-in link is invalid, expired or already used');
	}

	return consumed_link.email;
}
