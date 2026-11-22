import { env } from 'cloudflare:workers';
import { Hono } from 'hono';
import * as zod from 'zod';
import { complete_link, request_link } from '../accounts/owner-login.service';
import { end_owner_session, start_owner_session } from '../infrastructure/http/owner-session.middleware';
import { client_ip, enforce_rate_limit } from '../infrastructure/http/rate-limit';
import { PigeonError } from '../pigeon-error';
import { CheckInboxPage, ConfirmSignInPage, LoginPage } from '../web/login';

const LOGIN_FORM = zod.object({ email: zod.email().trim().toLowerCase().max(254) });

const VERIFY_FORM = zod.object({ token: zod.string().min(16).max(128) });

/**
 * Owner sign-in pages and magic-link callbacks.
 *
 * - `GET  /login`         email form
 * - `POST /login`         send a sign-in link and show "check your inbox"
 * - `GET  /login/verify`  a "Sign in" button for the link's token (opening the link alone never signs in)
 * - `POST /login/verify`  consume the token, set the session cookie, go to `/dashboard`
 * - `POST /logout`        clear the cookie
 */
export const auth_routes = new Hono()
	.get('/login', (context) => context.html(<LoginPage error={null} />))
	.post('/login', async (context) => {
		const form = LOGIN_FORM.safeParse(await context.req.parseBody());

		if (form.success === false) {
			return context.html(<LoginPage error="Enter a valid email address." />, 400);
		}

		try {
			await enforce_rate_limit(env.LOGIN_LIMITER, `ip:${client_ip(context)}`);
			await enforce_rate_limit(env.LOGIN_LIMITER, `email:${form.data.email}`);
			await request_link(form.data.email);
		} catch (error) {
			if (error instanceof PigeonError && error.code === 'rate_limited') {
				return context.html(<LoginPage error={error.message} />, 429);
			}

			if (error instanceof PigeonError) {
				return context.html(<LoginPage error={error.message} />, 503);
			}

			throw error;
		}

		return context.html(<CheckInboxPage email={form.data.email} />);
	})
	.get('/login/verify', (context) => context.html(<ConfirmSignInPage token={context.req.query('token') ?? ''} />))
	.post('/login/verify', async (context) => {
		const form = VERIFY_FORM.safeParse(await context.req.parseBody());

		if (form.success === false) {
			return context.html(<LoginPage error="This sign-in link is not valid. Request a new one." />, 400);
		}

		try {
			await start_owner_session(context, await complete_link(form.data.token));
		} catch (error) {
			if (error instanceof PigeonError) {
				return context.html(<LoginPage error={`${error.message}. Request a new one.`} />, 401);
			}

			throw error;
		}

		return context.redirect('/dashboard');
	})
	.post('/logout', (context) => {
		end_owner_session(context);

		return context.redirect('/login');
	});
