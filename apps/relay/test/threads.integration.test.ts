import { describe, expect, test } from 'vitest';
import { call_tool, call_tool_ok, member_get, remove_member, team_of_two } from './client';

describe('threads', () => {
	test('should refuse an answer from anyone but the person asked', async () => {
		// given
		const team = await team_of_two();
		const asked = await call_tool_ok(team.boss, 'ask_teammate', { to: 'lin', question: 'which db?' });

		// when
		const answered = await call_tool(team.boss, 'send_answer', { thread_id: asked.thread_id, question_id: asked.question_id, answer: 'postgres' });

		// then
		expect(answered).toEqual({ ok: false, error: 'forbidden: Only the person asked can reply' });
	});

	test('should refuse an answer to a question that is not the open one', async () => {
		// given
		const team = await team_of_two();
		const asked = await call_tool_ok(team.boss, 'ask_teammate', { to: 'lin', question: 'which db?' });

		// when
		const answered = await call_tool(team.lin, 'send_answer', { thread_id: asked.thread_id, question_id: crypto.randomUUID(), answer: 'postgres' });

		// then
		expect(answered).toEqual({ ok: false, error: 'conflict: This question is no longer open' });
	});

	test('should refuse a second reply to a question that was answered', async () => {
		// given
		const team = await team_of_two();
		const asked = await call_tool_ok(team.boss, 'ask_teammate', { to: 'lin', question: 'which db?' });
		const reply = { thread_id: asked.thread_id, question_id: asked.question_id };

		await call_tool_ok(team.lin, 'send_answer', { ...reply, answer: 'postgres' });

		// when
		const second_answer = await call_tool(team.lin, 'send_answer', { ...reply, answer: 'mysql' });
		const decline = await call_tool(team.lin, 'decline_question', reply);

		// then
		expect(second_answer).toEqual({ ok: false, error: 'conflict: This question is no longer open' });
		expect(decline).toEqual({ ok: false, error: 'conflict: This question is no longer open' });
	});

	test('should refuse a follow-up while the question is still open', async () => {
		// given
		const team = await team_of_two();
		const asked = await call_tool_ok(team.boss, 'ask_teammate', { to: 'lin', question: 'q1' });

		// when
		const follow_up = await call_tool(team.boss, 'follow_up', { thread_id: asked.thread_id, question: 'q2' });

		// then
		expect(follow_up).toEqual({ ok: false, error: 'conflict: The previous question has not been answered yet' });
	});

	test('should let only the asker follow up once the question got a reply', async () => {
		// given
		const team = await team_of_two();
		const asked = await call_tool_ok(team.boss, 'ask_teammate', { to: 'lin', question: 'q1' });

		await call_tool_ok(team.lin, 'decline_question', { thread_id: asked.thread_id, question_id: asked.question_id });

		// when
		const from_answerer = await call_tool(team.lin, 'follow_up', { thread_id: asked.thread_id, question: 'q2' });
		const from_asker = await call_tool(team.boss, 'follow_up', { thread_id: asked.thread_id, question: 'q2' });

		// then
		expect(from_answerer).toEqual({ ok: false, error: 'forbidden: Only the asker can follow up' });
		expect(from_asker.ok).toBe(true);
	});

	test('should give the open question to the person asked only, for drafting', async () => {
		// given
		const team = await team_of_two();
		const asked = await call_tool_ok(team.boss, 'ask_teammate', { to: 'lin', question: 'where is the webhook?' });

		// when
		const for_answerer = await member_get(team.lin, `/api/threads/${asked.thread_id}/question`);
		const for_asker = await member_get(team.boss, `/api/threads/${asked.thread_id}/question`);

		// then
		expect(await for_answerer.text()).toBe('where is the webhook?');
		expect(for_asker.status).toBe(403);
	});

	test('should end wait_for_answer as soon as the answer arrives', async () => {
		// given
		const team = await team_of_two();
		const asked = await call_tool_ok(team.boss, 'ask_teammate', { to: 'lin', question: 'ready?' });
		const started_at = Date.now();
		const waiting = call_tool_ok(team.boss, 'wait_for_answer', { thread_id: asked.thread_id });

		await new Promise((resolve) => setTimeout(resolve, 200));

		// when
		await call_tool_ok(team.lin, 'send_answer', { thread_id: asked.thread_id, question_id: asked.question_id, answer: 'yes' });

		// then
		expect((await waiting).status).toBe('replied');
		expect(Date.now() - started_at).toBeLessThan(5000);
	});

	test('should refuse a follow-up to a teammate who was removed', async () => {
		// given
		const team = await team_of_two();
		const asked = await call_tool_ok(team.boss, 'ask_teammate', { to: 'lin', question: 'q1' });

		await call_tool_ok(team.lin, 'send_answer', { thread_id: asked.thread_id, question_id: asked.question_id, answer: 'a1' });
		await remove_member(team, 'lin');

		// when
		const follow_up = await call_tool(team.boss, 'follow_up', { thread_id: asked.thread_id, question: 'q2' });

		// then
		expect(follow_up).toEqual({ ok: false, error: 'conflict: The other person is no longer in the team' });
	});

	test('should drop the questions of a removed teammate from the inbox and the waiting count', async () => {
		// given
		const team = await team_of_two();

		await call_tool_ok(team.lin, 'ask_teammate', { to: 'boss', question: 'from lin' });

		expect(await (await member_get(team.boss, '/api/unanswered')).text()).toBe('1');

		// when
		await remove_member(team, 'lin');

		// then
		expect(await (await member_get(team.boss, '/api/unanswered')).text()).toBe('0');
		expect(await call_tool_ok(team.boss, 'list_inbox', {})).toMatchObject({ threads: [] });
	});
});
