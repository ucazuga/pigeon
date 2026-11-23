import { env } from 'cloudflare:workers';
import { describe, expect, test } from 'vitest';
import { claim, dashboard_page, first_match, form_error, invite, invite_code, invite_code_in, join, member_get, new_prompt, new_team, remove_member, request } from './client';

async function expire_invite(team_id: string, handle: string): Promise<void> {
	await env.DB.prepare("UPDATE invites SET expires_at = '2000-01-01T00:00:00.000Z' WHERE team_id = ? AND handle = ?").bind(team_id, handle).run();
}

/** The status the dashboard shows for a person, e.g. 'pending' or 'expired'; '' when they are not listed. */
function status_on_dashboard(page: string, handle: string): string {
	return first_match(new RegExp(`data-handle="${handle}"[\\s\\S]*?data-status="([a-z_]+)"`), page);
}

describe('invites', () => {
	test('should accept an invite code only once', async () => {
		// given
		const team = await new_team();
		const code = await invite_code(team, 'lin');

		// when
		const first_claim = await join(code);
		const second_claim = await claim(code);

		// then
		expect(first_claim).not.toBe('');
		expect(second_claim.status).toBe(409);
		expect(await second_claim.json()).toEqual({ error: 'conflict', message: 'This invite is already claimed' });
	});

	test('should refuse a fourth person in a team', async () => {
		// given
		const team = await new_team();

		await invite(team, 'lin');
		await invite(team, 'ana');

		// when
		const refused = await invite(team, 'cem');

		// then
		expect(form_error(refused)).toContain('This team is full');
	});

	test('should free a seat when a teammate is removed', async () => {
		// given
		const team = await new_team();

		await invite(team, 'lin');
		await invite(team, 'ana');

		// when
		await remove_member(team, 'ana');

		// then
		expect(await invite_code(team, 'cem')).not.toBe('');
	});

	test('should free a seat when an invite expires', async () => {
		// given
		const team = await new_team();

		await invite(team, 'lin');
		await invite(team, 'ana');

		// when
		await expire_invite(team.team_id, 'ana');

		// then
		expect(await invite_code(team, 'cem')).not.toBe('');
	});

	test('should refuse an expired invite code', async () => {
		// given
		const team = await new_team();
		const code = await invite_code(team, 'lin');

		await expire_invite(team.team_id, 'lin');

		// when
		const claim = await join(code);

		// then
		expect(claim).toBe('');
	});

	test('should not issue a new prompt for an invite that was already used', async () => {
		// given
		const team = await new_team();

		await join(await invite_code(team, 'lin'));

		// when
		const refused = await new_prompt(team, 'lin');

		// then
		expect(form_error(refused)).toContain('already used');
	});

	test('should stop the earlier code working when a new prompt is issued', async () => {
		// given
		const team = await new_team();
		const earlier_code = await invite_code(team, 'lin');

		// when
		const new_code = invite_code_in(await (await new_prompt(team, 'lin')).text());

		// then
		expect(await join(earlier_code)).toBe('');
		expect(await join(new_code)).not.toBe('');
	});

	test("should end a removed teammate's access at once", async () => {
		// given
		const team = await new_team();
		const token = await join(await invite_code(team, 'lin'));

		expect((await member_get(token, '/api/unanswered')).status).toBe(200);

		// when
		await remove_member(team, 'lin');

		// then
		expect((await member_get(token, '/api/unanswered')).status).toBe(401);
	});

	test('should refuse an invite code with characters a shell would run', async () => {
		// given
		// The guide renders the code into shell commands, so only the code's own characters may pass, at both ends.
		const team = await new_team();
		const code = await invite_code(team, 'lin');
		const tampered_codes = [`$(id)${code}`, `${code};id`];

		// when
		const joins = await Promise.all(tampered_codes.map(async (tampered) => (await claim(tampered)).status));
		const guides = await Promise.all(tampered_codes.map(async (tampered) => (await request(`/setup/${encodeURIComponent(tampered)}.md`)).status));

		// then
		expect(joins).toEqual([400, 400]);
		expect(guides).toEqual([400, 400]);
	});

	test('should show an expired invite as expired and give its seat back on the dashboard', async () => {
		// given
		const team = await new_team();

		await invite(team, 'lin');
		await invite(team, 'ana');

		const full = await dashboard_page(team.owner);

		// when
		await expire_invite(team.team_id, 'ana');

		// then
		const after_expiry = await dashboard_page(team.owner);

		expect(full).toContain('3 of 3 seats');
		expect(full).toContain('This team is full');
		expect(status_on_dashboard(after_expiry, 'ana')).toBe('expired');
		expect(status_on_dashboard(after_expiry, 'lin')).toBe('pending');
		expect(after_expiry).toContain('2 of 3 seats');
		expect(after_expiry).not.toContain('This team is full');
	});

	test('should refuse a handle that is already invited to the team', async () => {
		// given
		const team = await new_team('boss');

		await invite(team, 'lin');

		// when
		const second_lin = await invite(team, 'lin');
		const another_boss = await invite(team, 'boss');

		// then
		expect(form_error(second_lin)).toBe('@lin is already invited to this team');
		expect(form_error(another_boss)).toBe('@boss is already invited to this team');
	});

	test('should let the setup guide be read again without using up the invite', async () => {
		// given
		// An agent may open the guide more than once before it runs the join command.
		const team = await new_team();
		const code = await invite_code(team, 'lin');

		// when
		const first_read = await request(`/setup/${code}.md`);
		const second_read = await request(`/setup/${code}.md`);
		const member_token = await join(code);

		// then
		expect(first_read.status).toBe(200);
		expect(await second_read.text()).toContain(code);
		expect(member_token).not.toBe('');
	});

	test('should show on the dashboard when a teammate has joined and when their plugin connects', async () => {
		// given
		const team = await new_team();
		const lin_token = await join(await invite_code(team, 'lin'));

		const joined = await dashboard_page(team.owner);

		// when
		await member_get(lin_token, '/api/unanswered');

		// then
		const connected = await dashboard_page(team.owner);

		expect(status_on_dashboard(joined, 'lin')).toBe('claimed');
		expect(status_on_dashboard(connected, 'lin')).toBe('connected');
	});
});
