import { Hono } from 'hono';
import { not_yet_implemented } from '../infrastructure/defects';

/**
 * The owner dashboard. Requires a signed owner session cookie.
 *
 * - `GET  /dashboard`                           teams, members and invite states
 * - `POST /dashboard/teams`                     create a team
 * - `POST /dashboard/teams/:team_id/invites`    invite a handle; renders the copyable setup prompt once
 * - `GET  /dashboard/teams/:team_id/invites`    invite states as JSON, polled for "waiting for your agent…"
 */
export const dashboard_routes = new Hono()
	.get('/dashboard', () => not_yet_implemented('GET /dashboard'))
	.post('/dashboard/teams', () => not_yet_implemented('POST /dashboard/teams'))
	.post('/dashboard/teams/:team_id/invites', () => not_yet_implemented('POST /dashboard/teams/:team_id/invites'))
	.get('/dashboard/teams/:team_id/invites', () => not_yet_implemented('GET /dashboard/teams/:team_id/invites'));
