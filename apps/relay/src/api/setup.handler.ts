import { Hono } from 'hono';
import { not_yet_implemented } from '../infrastructure/defects';

/**
 * Agent-driven onboarding.
 *
 * - `GET  /setup/:invite_code.md`  markdown guide the teammate's agent follows (see setup/setup-guide.ts)
 * - `POST /api/join`               `pigeon-join` exchanges an invite code for member credentials
 */
export const setup_routes = new Hono()
	.get('/setup/:file', () => not_yet_implemented('GET /setup/:invite_code.md'))
	.post('/api/join', () => not_yet_implemented('POST /api/join'));
