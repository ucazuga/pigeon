import type { Context, MiddlewareHandler } from 'hono';
import { deleteCookie, getSignedCookie, setSignedCookie } from 'hono/cookie';
import { find_owner, type Owner } from '../../auth/owner.service';
import { read_config } from '../config/config';

/** Hono variables set by {@link require_owner}. */
export type OwnerVariables = {
	/** The signed-in owner. */
	owner: Owner;
};

const COOKIE = 'pigeon_session';
const SESSION_TTL_SECONDS = 30 * 24 * 60 * 60;

/**
 * The owner signed in on this request. The cookie holds `<owner_id>.<issued_at_ms>`, signed with SESSION_SIGNING_KEY.
 *
 * @returns The owner, or null when the cookie is missing, tampered with, too old, or names an unknown owner.
 */
async function signed_in_owner(context: Context): Promise<Owner | null> {
	// Hono returns undefined for a missing cookie and false for a bad signature: both mean "not signed in".
	const cookie = (await getSignedCookie(context, read_config().session_signing_key.unwrap(), COOKIE)) || null;

	if (cookie === null) {
		return null;
	}

	const [owner_id = '', issued_at = '0'] = cookie.split('.');

	if (Date.now() - Number(issued_at) >= SESSION_TTL_SECONDS * 1000) {
		return null;
	}

	return find_owner(owner_id);
}

/** Hono middleware for dashboard pages: require a signed-in owner, or clear the cookie and go to sign-in at `/`. */
export const require_owner: MiddlewareHandler<{ Variables: OwnerVariables }> = async (context, next) => {
	const owner = await signed_in_owner(context);

	if (owner === null) {
		end_owner_session(context);

		return context.redirect('/');
	}

	context.set('owner', owner);
	await next();
};

/**
 * Sign the owner in on this browser.
 *
 * @param context - The Hono request context.
 * @param owner - The owner who just completed a sign-in link.
 */
export async function start_owner_session(context: Context, owner: Owner): Promise<void> {
	const config = read_config();

	await setSignedCookie(context, COOKIE, `${owner.owner_id}.${Date.now()}`, config.session_signing_key.unwrap(), {
		httpOnly: true,
		secure: config.public_url.protocol === 'https:',
		sameSite: 'Lax',
		path: '/',
		maxAge: SESSION_TTL_SECONDS,
	});
}

/**
 * Sign the owner out on this browser.
 *
 * @param context - The Hono request context.
 */
export function end_owner_session(context: Context): void {
	deleteCookie(context, COOKIE, { path: '/' });
}
