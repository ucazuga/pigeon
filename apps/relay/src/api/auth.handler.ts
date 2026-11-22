import { Hono } from 'hono';
import { not_yet_implemented } from '../infrastructure/defects';

/**
 * Owner sign-in pages and magic-link callbacks.
 *
 * - `GET  /login`         email form
 * - `POST /login`         send magic link, always render "check your inbox"
 * - `GET  /login/verify`  consume link, set signed session cookie, redirect to `/dashboard`
 * - `POST /logout`        clear the cookie
 */
export const auth_routes = new Hono()
	.get('/login', () => not_yet_implemented('GET /login'))
	.post('/login', () => not_yet_implemented('POST /login'))
	.get('/login/verify', () => not_yet_implemented('GET /login/verify'))
	.post('/logout', () => not_yet_implemented('POST /logout'));
