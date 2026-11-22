import { env } from 'cloudflare:workers';
import { type Redacted, redact } from '../redacted';

/** Relay configuration read from Worker bindings. */
export type RelayConfig = {
	/** Public origin of the relay. HTTPS, except for local development. */
	readonly public_url: URL;

	/** Sender address for magic-link emails. */
	readonly email_from: string;

	/** Secret used to sign owner session cookies. */
	readonly session_signing_key: Redacted<string>;
};

const MIN_SIGNING_KEY_LENGTH = 32;

/**
 * Read and check the relay's configuration from Worker bindings.
 *
 * @returns The configuration.
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

	if (env.EMAIL_FROM.includes('@') === false) {
		throw new Error('EMAIL_FROM must be an email address');
	}

	if (typeof env.SESSION_SIGNING_KEY !== 'string' || env.SESSION_SIGNING_KEY.length < MIN_SIGNING_KEY_LENGTH) {
		throw new Error(`SESSION_SIGNING_KEY must be at least ${MIN_SIGNING_KEY_LENGTH} characters`);
	}

	return {
		public_url,
		email_from: env.EMAIL_FROM,
		session_signing_key: redact(env.SESSION_SIGNING_KEY),
	};
}
