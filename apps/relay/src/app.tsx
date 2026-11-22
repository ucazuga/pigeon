import { Hono } from 'hono';
import { csrf } from 'hono/csrf';
import { auth_routes } from './api/auth.handler';
import { dashboard_routes } from './api/dashboard.handler';
import { mcp_routes } from './api/mcp.handler';
import { setup_routes } from './api/setup.handler';
import { thread_routes } from './api/thread.handler';
import { handle_error } from './infrastructure/http/error.handler';
import { Landing } from './web/landing';

/** The relay's HTTP app: error handling plus every route. */
export const app = new Hono()
	.onError(handle_error)
	// Browser forms only: reject cross-site form posts to sign-in and dashboard routes.
	.use('/login/*', csrf())
	.use('/login', csrf())
	.use('/logout', csrf())
	.use('/dashboard/*', csrf())
	.get('/', (context) => context.html(<Landing />))
	.route('/', auth_routes)
	.route('/', dashboard_routes)
	.route('/', setup_routes)
	.route('/', mcp_routes)
	.route('/', thread_routes);
