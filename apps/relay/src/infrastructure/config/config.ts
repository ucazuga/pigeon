import { env } from 'cloudflare:workers';
import { type Redacted, redact } from '../redacted';

/** Relay configuration read from Worker bindings. */
export type RelayConfig = {
	/** Public origin of the relay. HTTPS, except for local development. */
	readonly public_url: URL;

	/** Sender address for sign-in emails, or null when email is not set up on this relay. */
	readonly email_from: string | null;

	/** Whether sign-in links are printed to the console instead of emailed (local development only). */
	readonly log_magic_links: boolean;

	/** Secret used to sign owner session cookies. */
	readonly session_signing_key: Redacted<string>;
};

const MIN_SIGNING_KEY_LENGTH = 32;

/**
 * Read and check the relay's configuration from Worker bindings.
 *
 * @throws {Error} When a binding is missing or malformed. The message names the binding, never its value.
 */
export function read_config(): RelayConfig {
	if (URL.canParse(env.PUBLIC_URL) === false) {
		throw new Error('PUBLIC_URL must be an absolute URL');
	}

	const public_url = new URL(env.PUBLIC_URL);
	const is_local = public_url.hostname === 'localhost' || public_url.hostname === '127.0.0.1';

	if (public_url.protocol !== 'https:' && is_local === false) {
		throw new Error('PUBLIC_URL must use https outside local development');
	}

	const email_from = env.EMAIL_FROM ?? null;

	if (email_from && email_from.includes('@') === false) {
		throw new Error('EMAIL_FROM must be an email address');
	}

	const session_signing_key = env.SESSION_SIGNING_KEY ?? '';

	if (session_signing_key.length < MIN_SIGNING_KEY_LENGTH) {
		throw new Error(`SESSION_SIGNING_KEY must be at least ${MIN_SIGNING_KEY_LENGTH} characters`);
	}

	return {
		public_url,
		email_from,
		log_magic_links: is_local && env.MAGIC_LINK_DELIVERY === 'console',
		session_signing_key: redact(session_signing_key),
	};
}
