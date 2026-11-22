import { Hono } from 'hono';
import { csrf } from 'hono/csrf';
import { auth_routes } from './auth/auth.handler';
import { handle_error } from './infrastructure/http/error.handler';
import { mcp_routes } from './mcp/mcp.handler';
import { setup_routes } from './setup/setup.handler';
import { dashboard_routes } from './teams/dashboard.handler';
import { thread_routes } from './threads/thread.handler';

/** The relay's HTTP app: error handling plus every route. */
export const app = new Hono()
	.onError(handle_error)
	// Browser forms only: reject cross-site form posts to sign-in and dashboard routes.
	.use('/', csrf())
	.use('/verify', csrf())
	.use('/logout', csrf())
	.use('/dashboard/*', csrf())
	.route('/', auth_routes)
	.route('/', dashboard_routes)
	.route('/', setup_routes)
	.route('/', mcp_routes)
	.route('/', thread_routes);
