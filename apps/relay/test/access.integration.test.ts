import { env } from 'cloudflare:workers';
import { describe, expect, test } from 'vitest';
import { call_tool, call_tool_ok, invite, member_get, new_prompt, new_team, remove_member, request, team_of_two } from './client';

describe('access', () => {
	test("should treat another owner's team as missing on every team route", async () => {
		// given
		const theirs = await new_team();
		const mine = await new_team();
		const their_team_as_me = { ...theirs, owner: mine.owner };

		// when
		const statuses = [
			(await request(`/dashboard/teams/${theirs.team_id}/invites`, { headers: { cookie: mine.owner.cookie } })).status,
			(await invite(their_team_as_me, 'mallory')).status,
			(await new_prompt(their_team_as_me, 'boss')).status,
			(await remove_member(their_team_as_me, 'boss')).status,
		];

		// then
		expect(statuses).toEqual([404, 404, 404, 404]);
	});

	test("should not let a member of another team read or answer a team's thread", async () => {
		// given
		const team = await team_of_two();
		const outsiders = await team_of_two();
		const asked = await call_tool_ok(team.boss, 'ask_teammate', { to: 'lin', question: 'internal only' });
		const thread_id = String(asked.thread_id);

		// when
		const read = await call_tool(outsiders.lin, 'get_thread', { thread_id });
		const answered = await call_tool(outsiders.lin, 'send_answer', { thread_id, question_id: asked.question_id, answer: 'x' });
		const drafted = await member_get(outsiders.lin, `/api/threads/${thread_id}/question`);

		// then
		expect(read).toEqual({ ok: false, error: 'not_found: No such thread' });
		expect(answered).toEqual({ ok: false, error: 'not_found: No such thread' });
		expect(drafted.status).toBe(404);
	});

	test('should store member tokens only as hashes', async () => {
		// given
		const team = await team_of_two();

		// when
		const stored_in_plain = await env.DB.prepare('SELECT member_id FROM members WHERE token_hash = ?').bind(team.lin).first();

		// then
		expect(stored_in_plain).toBeNull();
		expect((await member_get(team.lin, '/api/unanswered')).status).toBe(200);
	});
});
