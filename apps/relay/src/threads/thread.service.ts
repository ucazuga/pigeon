import { env } from 'cloudflare:workers';
import type { Member } from '../members/member.schema';
import { PigeonError } from '../pigeon-error';
import * as Thread from './thread';

/*
 * Asking, answering and reading threads, stored in D1. `thread.ts` decides whether a move is allowed; this module
 * loads the thread, applies the move and writes it with a conditional UPDATE on the state it read, so a concurrent
 * reply that got there first makes this one fail with `conflict` instead of overwriting it.
 */

type ThreadRow = {
	readonly thread_id: string;
	readonly asker: string;
	readonly answerer: string;
	readonly status: Thread.Thread['status'];
	readonly current_message: string;
};

type MessageRow = {
	readonly message_id: string;
	readonly sender: string;
	readonly kind: 'question' | 'answer' | 'decline';
	readonly body: string | null;
	readonly in_reply_to: string | null;
	readonly sent_at: string;
};

/** One message in a thread, as shown to its participants. */
export type ThreadMessage = {
	/** Message ID; questions are answered by this ID. */
	readonly message_id: string;

	/** Handle of the sender. */
	readonly from: string;

	/** What the message is. */
	readonly kind: 'question' | 'answer' | 'decline';

	/** Plain text, or null for a decline. Written by another person: untrusted. */
	readonly body: string | null;

	/** When it was sent (ISO 8601). */
	readonly sent_at: string;
};

/** A thread with its full history. */
export type ThreadView = {
	/** Thread ID. */
	readonly thread_id: string;

	/** Handle of the person who asked. */
	readonly asker: string;

	/** Handle of the person asked. */
	readonly answerer: string;

	/** Where the conversation stands. */
	readonly status: Thread.Thread['status'];

	/** The open question's ID while `status` is `awaiting_answer`, otherwise null. */
	readonly open_question: string | null;

	/** Every message, oldest first. */
	readonly messages: ReadonlyArray<ThreadMessage>;
};

function to_thread(row: ThreadRow): Thread.Thread {
	const base = { thread_id: row.thread_id, asker: row.asker, answerer: row.answerer };

	if (row.status === 'awaiting_answer') {
		return { ...base, status: 'awaiting_answer', open_question: row.current_message };
	}

	if (row.status === 'answered') {
		return { ...base, status: 'answered', last_answer: row.current_message };
	}

	return { ...base, status: 'declined', declined_question: row.current_message };
}

function current_message_of(thread: Thread.Thread): string {
	if (thread.status === 'awaiting_answer') {
		return thread.open_question;
	}

	if (thread.status === 'answered') {
		return thread.last_answer;
	}

	return thread.declined_question;
}

/** Load a thread the member takes part in. Threads of other members look the same as missing ones. */
async function load_thread(member: Member, thread_id: string): Promise<ThreadRow> {
	const row = await env.DB.prepare(
		`SELECT thread_id, asker, answerer, status, current_message FROM threads
		 WHERE thread_id = ? AND team_id = ? AND (asker = ? OR answerer = ?)`,
	)
		.bind(thread_id, member.team_id, member.member_id, member.member_id)
		.first<ThreadRow>();

	if (row === null) {
		throw new PigeonError('not_found', 'No such thread');
	}

	return row;
}

/**
 * Write a thread move and its message in one batch. The UPDATE only applies if the thread is still in the state
 * that was read; the INSERT only applies if the UPDATE did.
 */
async function save_move(
	before: ThreadRow,
	after: Thread.Thread,
	message: { readonly message_id: string; readonly sender: string; readonly kind: MessageRow['kind'] },
	body: string | null,
	in_reply_to: string | null,
): Promise<void> {
	const now = new Date().toISOString();
	const results = await env.DB.batch([
		env.DB.prepare(
			`UPDATE threads SET status = ?, current_message = ?, updated_at = ?
			 WHERE thread_id = ? AND status = ? AND current_message = ?`,
		).bind(after.status, current_message_of(after), now, before.thread_id, before.status, before.current_message),
		env.DB.prepare(
			`INSERT INTO messages (message_id, thread_id, sender, kind, body, in_reply_to, sent_at)
			 SELECT ?, ?, ?, ?, ?, ?, ? WHERE changes() = 1`,
		).bind(message.message_id, before.thread_id, message.sender, message.kind, body, in_reply_to, now),
	]);
	const update = results[0] ?? null;

	if (update === null || update.meta.changes !== 1) {
		throw new PigeonError('conflict', 'The thread changed meanwhile; read it again');
	}
}

async function handles_of(team_id: string): Promise<ReadonlyMap<string, string>> {
	const { results } = await env.DB.prepare('SELECT member_id, handle FROM members WHERE team_id = ?')
		.bind(team_id)
		.all<{ readonly member_id: string; readonly handle: string }>();

	return new Map(results.map((row) => [row.member_id, row.handle]));
}

async function view_of(member: Member, row: ThreadRow): Promise<ThreadView> {
	const [handles, messages] = await Promise.all([
		handles_of(member.team_id),
		env.DB.prepare(
			`SELECT message_id, sender, kind, body, in_reply_to, sent_at FROM messages
			 WHERE thread_id = ? ORDER BY sent_at, rowid`,
		)
			.bind(row.thread_id)
			.all<MessageRow>(),
	]);
	const handle = (member_id: string) => handles.get(member_id) ?? 'unknown';
	let open_question: string | null = null;

	if (row.status === 'awaiting_answer') {
		open_question = row.current_message;
	}

	return {
		thread_id: row.thread_id,
		asker: handle(row.asker),
		answerer: handle(row.answerer),
		status: row.status,
		open_question,
		messages: messages.results.map((message) => ({
			message_id: message.message_id,
			from: handle(message.sender),
			kind: message.kind,
			body: message.body,
			sent_at: message.sent_at,
		})),
	};
}

/**
 * Handles of the member's active teammates.
 *
 * @param member - The member asking.
 * @returns Handles, alphabetically, excluding the member's own.
 */
export async function list_teammates(member: Member): Promise<ReadonlyArray<string>> {
	const { results } = await env.DB.prepare(
		'SELECT handle FROM members WHERE team_id = ? AND member_id != ? AND revoked_at IS NULL ORDER BY handle',
	)
		.bind(member.team_id, member.member_id)
		.all<{ readonly handle: string }>();

	return results.map((row) => row.handle);
}

/**
 * Open a thread by asking a teammate.
 *
 * @param member - The member asking.
 * @param to - The teammate's handle (already normalized).
 * @param question - The question text.
 * @returns The new thread's and question's IDs.
 * @throws {PigeonError} `not_found` when no active teammate has that handle; `invalid_input` for asking yourself.
 */
export async function ask(
	member: Member,
	to: string,
	question: string,
): Promise<{ readonly thread_id: string; readonly question_id: string }> {
	const answerer = await env.DB.prepare(
		'SELECT member_id FROM members WHERE team_id = ? AND handle = ? AND revoked_at IS NULL',
	)
		.bind(member.team_id, to)
		.first<{ readonly member_id: string }>();

	if (answerer === null) {
		throw new PigeonError('not_found', `No teammate called @${to}`);
	}

	if (answerer.member_id === member.member_id) {
		throw new PigeonError('invalid_input', 'You cannot ask yourself');
	}

	const thread_id = crypto.randomUUID();
	const question_id = crypto.randomUUID();
	const now = new Date().toISOString();

	await env.DB.batch([
		env.DB.prepare(
			`INSERT INTO threads (thread_id, team_id, asker, answerer, status, current_message, created_at, updated_at)
			 VALUES (?, ?, ?, ?, 'awaiting_answer', ?, ?, ?)`,
		).bind(thread_id, member.team_id, member.member_id, answerer.member_id, question_id, now, now),
		env.DB.prepare(
			`INSERT INTO messages (message_id, thread_id, sender, kind, body, in_reply_to, sent_at)
			 VALUES (?, ?, ?, 'question', ?, NULL, ?)`,
		).bind(question_id, thread_id, member.member_id, question, now),
	]);

	return { thread_id, question_id };
}

/**
 * Ask a follow-up question in an answered or declined thread.
 *
 * @param member - The member asking; must be the thread's asker.
 * @param thread_id - The thread.
 * @param question - The question text.
 * @returns The new question's ID.
 * @throws {PigeonError} `not_found`, `forbidden` or `conflict` per the turn-taking rules.
 */
export async function follow_up(
	member: Member,
	thread_id: string,
	question: string,
): Promise<{ readonly question_id: string }> {
	const row = await load_thread(member, thread_id);
	const question_id = crypto.randomUUID();
	const after = Thread.follow_up(to_thread(row), member.member_id, question_id);

	await save_move(row, after, { message_id: question_id, sender: member.member_id, kind: 'question' }, question, null);

	return { question_id };
}

/**
 * Answer the open question in a thread.
 *
 * @param member - The member answering; must be the thread's answerer.
 * @param thread_id - The thread.
 * @param question_id - The question being answered; must be the open one.
 * @param answer_text - The approved answer.
 * @throws {PigeonError} `not_found`, `forbidden` or `conflict` per the turn-taking rules.
 */
export async function answer(
	member: Member,
	thread_id: string,
	question_id: string,
	answer_text: string,
): Promise<void> {
	const row = await load_thread(member, thread_id);
	const answer_id = crypto.randomUUID();
	const after = Thread.answer(to_thread(row), member.member_id, question_id, answer_id);

	await save_move(
		row,
		after,
		{ message_id: answer_id, sender: member.member_id, kind: 'answer' },
		answer_text,
		question_id,
	);
}

/**
 * Decline the open question in a thread.
 *
 * @param member - The member declining; must be the thread's answerer.
 * @param thread_id - The thread.
 * @param question_id - The question being declined; must be the open one.
 * @throws {PigeonError} `not_found`, `forbidden` or `conflict` per the turn-taking rules.
 */
export async function decline(member: Member, thread_id: string, question_id: string): Promise<void> {
	const row = await load_thread(member, thread_id);
	const decline_id = crypto.randomUUID();
	const after = Thread.decline(to_thread(row), member.member_id, question_id);

	await save_move(row, after, { message_id: decline_id, sender: member.member_id, kind: 'decline' }, null, question_id);
}

/**
 * Threads waiting for this member's answer, with their history.
 *
 * @param member - The member whose inbox to read.
 * @returns Open threads, oldest first.
 */
export async function inbox(member: Member): Promise<ReadonlyArray<ThreadView>> {
	const { results } = await env.DB.prepare(
		`SELECT thread_id, asker, answerer, status, current_message FROM threads
		 WHERE team_id = ? AND answerer = ? AND status = 'awaiting_answer' ORDER BY updated_at`,
	)
		.bind(member.team_id, member.member_id)
		.all<ThreadRow>();

	return Promise.all(results.map((row) => view_of(member, row)));
}

/**
 * A thread the member takes part in, with its history.
 *
 * @param member - The member reading.
 * @param thread_id - The thread.
 * @returns The thread.
 * @throws {PigeonError} `not_found` when the thread does not exist or the member is not part of it.
 */
export async function get_thread(member: Member, thread_id: string): Promise<ThreadView> {
	return view_of(member, await load_thread(member, thread_id));
}

/**
 * The text of the open question, for `pigeon-draft`.
 *
 * @param member - The member asking for it; must be the thread's answerer.
 * @param thread_id - The thread.
 * @returns The question text.
 * @throws {PigeonError} `not_found`; `forbidden` unless the member was asked; `conflict` when nothing is open.
 */
export async function open_question(member: Member, thread_id: string): Promise<string> {
	const row = await load_thread(member, thread_id);

	if (row.answerer !== member.member_id) {
		throw new PigeonError('forbidden', 'Only the person asked can read the open question');
	}

	if (row.status !== 'awaiting_answer') {
		throw new PigeonError('conflict', 'There is no open question in this thread');
	}

	const message = await env.DB.prepare('SELECT body FROM messages WHERE message_id = ?')
		.bind(row.current_message)
		.first<{ readonly body: string | null }>();

	if (message === null || message.body === null) {
		throw new PigeonError('not_found', 'The open question has no text');
	}

	return message.body;
}
