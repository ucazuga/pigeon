import type { Context } from 'hono';
import { PigeonError } from '../../pigeon-error';

/**
 * The caller's IP address as seen by Cloudflare.
 *
 * @param context - The Hono request context.
 * @returns The IP, or `unknown` outside Cloudflare.
 */
export function client_ip(context: Context): string {
	return context.req.header('cf-connecting-ip') ?? 'unknown';
}

/**
 * Count one request against a limit.
 *
 * @param limiter - The rate limit binding.
 * @param key - What to count, e.g. `ip:203.0.113.7`.
 * @throws {PigeonError} `rate_limited` when the limit for this key is used up.
 */
export async function enforce_rate_limit(limiter: RateLimit, key: string): Promise<void> {
	const { success } = await limiter.limit({ key });

	if (success === false) {
		throw new PigeonError('rate_limited', 'Too many attempts. Wait a minute and try again.');
	}
}
