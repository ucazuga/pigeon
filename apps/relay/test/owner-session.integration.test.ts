import { afterEach, describe, expect, test, vi } from 'vitest';
import { dashboard_page, new_team, open_sign_in_link, request, sign_in } from './client';

const DAY_MS = 24 * 60 * 60 * 1000;

/** Where the dashboard sends this browser: '' when it shows the dashboard, '/' when it sends the browser to sign in. */
async function dashboard_redirect(cookie: string): Promise<string> {
	const response = await request('/dashboard', { redirect: 'manual', headers: { cookie } });

	return response.headers.get('location') ?? '';
}

afterEach(() => {
	vi.useRealTimers();
});

describe('owner session', () => {
	test('should keep the session cookie away from scripts and other sites', async () => {
		// given
		const email = `owner-${crypto.randomUUID()}@example.test`;

		// when
		const verified = await open_sign_in_link(email);

		// then
		const set_cookie = verified.headers.get('set-cookie') ?? '';

		expect(set_cookie).toMatch(/^pigeon_session=/);
		expect(set_cookie).toContain('HttpOnly');
		expect(set_cookie).toContain('SameSite=Lax');
		expect(set_cookie).toContain('Path=/');
	});

	test('should keep an owner signed in for 30 days and no longer', async () => {
		// given
		const owner = await sign_in(`owner-${crypto.randomUUID()}@example.test`);
		const signed_in_at = Date.now();

		vi.useFakeTimers({ toFake: ['Date'] });

		// when
		vi.setSystemTime(signed_in_at + 29 * DAY_MS);
		const after_29_days = await dashboard_redirect(owner.cookie);

		vi.setSystemTime(signed_in_at + 30 * DAY_MS);
		const after_30_days = await dashboard_redirect(owner.cookie);

		// then
		expect(after_29_days).toBe('');
		expect(after_30_days).toBe('/');
	});

	test('should not let an owner edit their cookie into someone else', async () => {
		// given
		// The cookie is `pigeon_session=<owner_id>.<issued_at>.<signature>`.
		const victim = await sign_in(`owner-${crypto.randomUUID()}@example.test`);
		const attacker = await sign_in(`owner-${crypto.randomUUID()}@example.test`);
		const [victim_owner_id = ''] = victim.cookie.split('.');
		const [, ...attacker_signed_rest] = attacker.cookie.split('.');

		// when
		const forged = await dashboard_redirect([victim_owner_id, ...attacker_signed_rest].join('.'));
		const unchanged = await dashboard_redirect(attacker.cookie);

		// then
		expect(forged).toBe('/');
		expect(unchanged).toBe('');
	});

	test('should refuse sign-in and dashboard forms sent from another site', async () => {
		// given
		const team = await new_team();
		const from_another_site = { origin: 'https://evil.example', cookie: team.owner.cookie, 'content-type': 'application/x-www-form-urlencoded' };

		// when
		const statuses = await Promise.all(
			['/', '/verify', '/logout', '/dashboard/teams', `/dashboard/teams/${team.team_id}/invites`].map(async (path) => {
				const response = await request(path, { method: 'POST', redirect: 'manual', headers: from_another_site, body: 'email=a%40b.test&handle=mallory&name=Evil' });

				return response.status;
			}),
		);

		// then
		expect(statuses).toEqual([403, 403, 403, 403, 403]);
		expect(await dashboard_page(team.owner)).not.toContain('mallory');
	});
});
