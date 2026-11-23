import { env } from 'cloudflare:workers';
import { describe, expect, test } from 'vitest';
import { claim, form_error, invite, invite_code, invite_code_in, join, member_get, new_prompt, new_team, remove_member } from './client';

async function expire_invite(team_id: string, handle: string): Promise<void> {
	await env.DB.prepare("UPDATE invites SET expires_at = '2000-01-01T00:00:00.000Z' WHERE team_id = ? AND handle = ?").bind(team_id, handle).run();
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
});
