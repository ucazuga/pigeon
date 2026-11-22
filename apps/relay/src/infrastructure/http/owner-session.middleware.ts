import type { Context, MiddlewareHandler } from 'hono';
import { deleteCookie, getSignedCookie, setSignedCookie } from 'hono/cookie';
import { find_owner, type OwnerSession } from '../../accounts/owner-login.service';
import { read_config } from '../config/config';

/** Hono variables set by {@link require_owner}. */
export type OwnerVariables = {
	/** The signed-in owner. */
	owner: OwnerSession;
};

const COOKIE = 'pigeon_session';
const SESSION_TTL_SECONDS = 30 * 24 * 60 * 60;

/**
 * Hono middleware for dashboard pages: require a signed owner session cookie, or redirect to the sign-in page at `/`.
 * The cookie holds `<owner_id>.<issued_at_ms>`, signed with SESSION_SIGNING_KEY.
 */
export const require_owner: MiddlewareHandler<{ Variables: OwnerVariables }> = async (context, next) => {
	const value = await getSignedCookie(context, read_config().session_signing_key.unwrap(), COOKIE);

	if (typeof value !== 'string') {
		return context.redirect('/');
	}

	const [owner_id = '', issued_at = '0'] = value.split('.');
	const is_fresh = Date.now() - Number(issued_at) < SESSION_TTL_SECONDS * 1000;
	const owner = await find_owner(owner_id);

	if (is_fresh === false || owner === null) {
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
export async function start_owner_session(context: Context, owner: OwnerSession): Promise<void> {
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
