import { env } from 'cloudflare:workers';
import { Hono } from 'hono';
import * as zod from 'zod';
import { end_owner_session, start_owner_session } from '../infrastructure/http/owner-session.middleware';
import { client_ip, enforce_rate_limit } from '../infrastructure/http/rate-limit';
import { validate } from '../infrastructure/http/validate';
import { PigeonError } from '../pigeon-error';
import { CheckInboxPage, ConfirmSignInPage, LoginPage } from '../web/login';
import { consume_link, request_link } from './magic-link.service';
import { find_or_create_owner } from './owner.service';

/**
 * Owner sign-in pages and magic-link callbacks.
 *
 * - `GET  /`        email form; the home page
 * - `POST /`        send a sign-in link and show "check your inbox"
 * - `GET  /verify`  a "Sign in" button for the link's token (opening the link alone never signs in)
 * - `POST /verify`  consume the token, set the session cookie, go to `/dashboard`
 * - `POST /logout`  clear the cookie, back to `/`
 */
export const auth_routes = new Hono()
	.get('/', (context) => context.html(<LoginPage error={null} />))
	.post(
		'/',
		validate('form', zod.object({ email: zod.email().trim().toLowerCase().max(254) }), (_error, context) =>
			context.html(<LoginPage error="Enter a valid email address." />, 400),
		),
		async (context) => {
			const { email } = context.req.valid('form');

			try {
				await enforce_rate_limit(env.LOGIN_LIMITER, `ip:${client_ip(context)}`);
				await enforce_rate_limit(env.LOGIN_LIMITER, `email:${email}`);
				await request_link(email);
			} catch (error) {
				if (error instanceof PigeonError && error.code === 'rate_limited') {
					return context.html(<LoginPage error={error.message} />, 429);
				}

				if (error instanceof PigeonError) {
					return context.html(<LoginPage error={error.message} />, 503);
				}

				throw error;
			}

			return context.html(<CheckInboxPage email={email} />);
		},
	)
	.get('/verify', (context) => context.html(<ConfirmSignInPage token={context.req.query('token') ?? ''} />))
	.post(
		'/verify',
		validate('form', zod.object({ token: zod.string().min(16).max(128) }), (_error, context) =>
			context.html(<LoginPage error="This sign-in link is not valid. Request a new one." />, 400),
		),
		async (context) => {
			const { token } = context.req.valid('form');

			try {
				const email = await consume_link(token);

				await start_owner_session(context, await find_or_create_owner(email));
			} catch (error) {
				if (error instanceof PigeonError) {
					return context.html(<LoginPage error={`${error.message}. Request a new one.`} />, 401);
				}

				throw error;
			}

			return context.redirect('/dashboard');
		},
	)
	.post('/logout', (context) => {
		end_owner_session(context);

		return context.redirect('/');
	});
