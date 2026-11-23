import { env, waitUntil } from 'cloudflare:workers';
import { PigeonError } from '../pigeon-error';
import type { Member } from '../teams/team.schema';
import { team_room_of } from './team-room.durable-object';

/*
 * Asking, answering and reading threads, stored in D1.
 *
 * A thread alternates strictly: the asker asks, the answerer answers or declines, the asker may follow up. Only one
 * question is open at a time, so the answering side always has exactly one draft to review. Each move checks who may
 * make it, then writes with a conditional UPDATE on the state it read, so a concurrent reply that got there first
 * makes this one fail with `conflict` instead of overwriting it.
 *
 * After a write, the recipient's team room is told in the background (`waitUntil`): the message is already stored, so a room that cannot be reached must not fail the
 * request. The recipient still sees the message in their inbox or on their next wait.
 */

/**
 * How long one `wait_for_answer` call holds the connection. Kept under Claude Code's MCP request timeout: a longer
 * wait fails as "operation timed out" on the client instead of returning `still_waiting`.
 */
const WAIT_MS = 45 * 1000;

/** SQL condition on `threads`: the asker is still in the team. A removed teammate's open questions leave the inbox. */
const ASKER_STILL_IN_TEAM_SQL = 'EXISTS (SELECT 1 FROM members WHERE members.member_id = threads.asker AND members.revoked_at IS NULL)';

/** Where a thread's conversation stands. */
type ThreadStatus = 'awaiting_answer' | 'answered' | 'declined';

type ThreadRow = {
	readonly thread_id: string;

	/** Member ID (not handle) of the person who asked. */
	readonly asker: string;

	/** Member ID (not handle) of the person asked. */
	readonly answerer: string;
	readonly status: ThreadStatus;

	/** The open question while awaiting an answer, the last answer once answered, the declined question once declined. */
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
	readonly status: ThreadStatus;

	/** The open question's ID while `status` is `awaiting_answer`, otherwise null. */
	readonly open_question: string | null;

	/** Every message, oldest first. */
	readonly messages: ReadonlyArray<ThreadMessage>;
};

/** Result of waiting for an answer. */
export type WaitResult = { readonly status: 'still_waiting'; readonly thread_id: string; readonly message: string } | { readonly status: 'replied'; readonly thread: ThreadView };

/** Load a thread the member takes part in. Threads of other members look the same as missing ones. */
async function get_thread_row(member: Member, thread_id: string): Promise<ThreadRow> {
	const thread = await env.DB.prepare(
		`SELECT thread_id, asker, answerer, status, current_message FROM threads
		 WHERE thread_id = ? AND team_id = ? AND (asker = ? OR answerer = ?)`,
	)
		.bind(thread_id, member.team_id, member.member_id, member.member_id)
		.first<ThreadRow>();

	if (thread === null) {
		throw new PigeonError('not_found', 'No such thread');
	}

	return thread;
}

/**
 * Write a thread move and its message in one batch. The UPDATE only applies if the thread is still in the state that was read, and while the other person is still in the team;
 * the INSERT only applies if the UPDATE did.
 */
async function save_message(
	thread: ThreadRow,
	next_state: { readonly status: ThreadStatus; readonly current_message: string },
	message: { readonly message_id: string; readonly sender: string; readonly kind: MessageRow['kind'] },
	body: string | null,
	in_reply_to: string | null,
): Promise<void> {
	let recipient = thread.asker;

	if (message.sender === thread.asker) {
		recipient = thread.answerer;
	}

	const now = new Date().toISOString();
	const batch_results = await env.DB.batch([
		env.DB.prepare(
			`UPDATE threads SET status = ?, current_message = ?, updated_at = ?
			 WHERE thread_id = ? AND status = ? AND current_message = ?
			 AND EXISTS (SELECT 1 FROM members WHERE member_id = ? AND revoked_at IS NULL)`,
		).bind(next_state.status, next_state.current_message, now, thread.thread_id, thread.status, thread.current_message, recipient),
		env.DB.prepare(
			`INSERT INTO messages (message_id, thread_id, sender, kind, body, in_reply_to, sent_at)
			 SELECT ?, ?, ?, ?, ?, ?, ? WHERE changes() = 1`,
		).bind(message.message_id, thread.thread_id, message.sender, message.kind, body, in_reply_to, now),
	]);
	const [thread_update = null] = batch_results;

	if (thread_update && thread_update.meta.changes === 1) {
		return;
	}

	const still_in_team = await env.DB.prepare('SELECT 1 AS active FROM members WHERE member_id = ? AND revoked_at IS NULL').bind(recipient).first();

	if (still_in_team === null) {
		throw new PigeonError('conflict', 'The other person is no longer in the team');
	}

	throw new PigeonError('conflict', 'The thread changed meanwhile; read it again');
}

/** Every handle in the team by member ID, removed members included, so old threads still show who wrote what. */
async function get_handles(team_id: string): Promise<ReadonlyMap<string, string>> {
	const { results: teammates } = await env.DB.prepare('SELECT member_id, handle FROM members WHERE team_id = ?')
		.bind(team_id)
		.all<{ readonly member_id: string; readonly handle: string }>();

	return new Map(teammates.map((teammate) => [teammate.member_id, teammate.handle]));
}

async function build_view(thread: ThreadRow, handles: ReadonlyMap<string, string>): Promise<ThreadView> {
	const { results: messages } = await env.DB.prepare(
		`SELECT message_id, sender, kind, body, in_reply_to, sent_at FROM messages
		 WHERE thread_id = ? ORDER BY sent_at, rowid`,
	)
		.bind(thread.thread_id)
		.all<MessageRow>();

	const handle_of = (member_id: string) => handles.get(member_id) ?? 'unknown';

	let open_question: string | null = null;

	if (thread.status === 'awaiting_answer') {
		open_question = thread.current_message;
	}

	return {
		thread_id: thread.thread_id,
		asker: handle_of(thread.asker),
		answerer: handle_of(thread.answerer),
		status: thread.status,
		open_question,
		messages: messages.map((message) => ({
			message_id: message.message_id,
			from: handle_of(message.sender),
			kind: message.kind,
			body: message.body,
			sent_at: message.sent_at,
		})),
	};
}

/** Handles of the member's active teammates, alphabetically, without their own. */
export async function list_teammates(member: Member): Promise<ReadonlyArray<string>> {
	const { results: teammates } = await env.DB.prepare('SELECT handle FROM members WHERE team_id = ? AND member_id != ? AND revoked_at IS NULL ORDER BY handle')
		.bind(member.team_id, member.member_id)
		.all<{ readonly handle: string }>();

	return teammates.map((teammate) => teammate.handle);
}

/**
 * Open a thread by asking a teammate. `not_found` when no active teammate has that handle; `invalid_input` for asking yourself.
 */
export async function ask(member: Member, to: string, question: string): Promise<{ readonly thread_id: string; readonly question_id: string }> {
	const answerer = await env.DB.prepare('SELECT member_id FROM members WHERE team_id = ? AND handle = ? AND revoked_at IS NULL')
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

	waitUntil(
		team_room_of(member.team_id).notify(answerer.member_id, {
			type: 'question_received',
			thread_id,
			message_id: question_id,
			from: member.handle,
			sent_at: now,
		}),
	);

	return { thread_id, question_id };
}

/** Ask a follow-up in an answered or declined thread. Only the asker can; otherwise `forbidden`, or `conflict` while a question is still open. */
export async function follow_up(member: Member, thread_id: string, question: string): Promise<{ readonly question_id: string }> {
	const thread = await get_thread_row(member, thread_id);

	if (thread.asker !== member.member_id) {
		throw new PigeonError('forbidden', 'Only the asker can follow up');
	}

	if (thread.status === 'awaiting_answer') {
		throw new PigeonError('conflict', 'The previous question has not been answered yet');
	}

	const question_id = crypto.randomUUID();
	const next_state = { status: 'awaiting_answer', current_message: question_id } as const;

	await save_message(thread, next_state, { message_id: question_id, sender: member.member_id, kind: 'question' }, question, null);

	waitUntil(
		team_room_of(member.team_id).notify(thread.answerer, {
			type: 'question_received',
			thread_id,
			message_id: question_id,
			from: member.handle,
			sent_at: new Date().toISOString(),
		}),
	);

	return { question_id };
}

/** Answer the open question. Only the person asked can, and only the question that is open now; otherwise `forbidden` or `conflict`. */
export async function answer(member: Member, thread_id: string, question_id: string, answer_text: string): Promise<void> {
	const thread = await get_thread_row(member, thread_id);

	if (thread.answerer !== member.member_id) {
		throw new PigeonError('forbidden', 'Only the person asked can reply');
	}

	if (thread.status !== 'awaiting_answer' || thread.current_message !== question_id) {
		throw new PigeonError('conflict', 'This question is no longer open');
	}

	const answer_id = crypto.randomUUID();
	const next_state = { status: 'answered', current_message: answer_id } as const;

	await save_message(thread, next_state, { message_id: answer_id, sender: member.member_id, kind: 'answer' }, answer_text, question_id);

	waitUntil(
		team_room_of(member.team_id).notify(thread.asker, {
			type: 'answer_received',
			thread_id,
			message_id: answer_id,
			in_reply_to: question_id,
			from: member.handle,
			sent_at: new Date().toISOString(),
		}),
	);
}

/** Decline the open question, with the same rules as {@link answer}. */
export async function decline(member: Member, thread_id: string, question_id: string): Promise<void> {
	const thread = await get_thread_row(member, thread_id);

	if (thread.answerer !== member.member_id) {
		throw new PigeonError('forbidden', 'Only the person asked can reply');
	}

	if (thread.status !== 'awaiting_answer' || thread.current_message !== question_id) {
		throw new PigeonError('conflict', 'This question is no longer open');
	}

	const decline_id = crypto.randomUUID();
	const next_state = { status: 'declined', current_message: question_id } as const;

	await save_message(thread, next_state, { message_id: decline_id, sender: member.member_id, kind: 'decline' }, null, question_id);

	waitUntil(
		team_room_of(member.team_id).notify(thread.asker, {
			type: 'question_declined',
			thread_id,
			message_id: decline_id,
			in_reply_to: question_id,
			from: member.handle,
			sent_at: new Date().toISOString(),
		}),
	);
}

/** Threads waiting for this member's answer, with their history. */
export async function list_inbox(member: Member): Promise<ReadonlyArray<ThreadView>> {
	const [open_threads, handles] = await Promise.all([
		env.DB.prepare(
			`SELECT thread_id, asker, answerer, status, current_message FROM threads
			 WHERE team_id = ? AND answerer = ? AND status = 'awaiting_answer' AND ${ASKER_STILL_IN_TEAM_SQL} ORDER BY updated_at`,
		)
			.bind(member.team_id, member.member_id)
			.all<ThreadRow>(),
		get_handles(member.team_id),
	]);

	return Promise.all(open_threads.results.map((thread) => build_view(thread, handles)));
}

/** How many questions are waiting for this member's answer. */
export async function count_unanswered(member: Member): Promise<number> {
	const counted = await env.DB.prepare(
		`SELECT COUNT(*) AS unanswered FROM threads WHERE team_id = ? AND answerer = ? AND status = 'awaiting_answer' AND ${ASKER_STILL_IN_TEAM_SQL}`,
	)
		.bind(member.team_id, member.member_id)
		.first<{ readonly unanswered: number }>();

	// COUNT(*) always returns a row; null only satisfies the driver's type.
	if (counted === null) {
		return 0;
	}

	return counted.unanswered;
}

/** A thread the member takes part in, with its history. Someone else's thread is `not_found`, like a missing one. */
export async function get_thread(member: Member, thread_id: string): Promise<ThreadView> {
	const [thread, handles] = await Promise.all([get_thread_row(member, thread_id), get_handles(member.team_id)]);

	return build_view(thread, handles);
}

/** The open question's text, for `pigeon-draft`. Only the person asked can read it (`forbidden`); `conflict` when nothing is open. */
export async function get_open_question(member: Member, thread_id: string): Promise<string> {
	const thread = await get_thread_row(member, thread_id);

	if (thread.answerer !== member.member_id) {
		throw new PigeonError('forbidden', 'Only the person asked can read the open question');
	}

	if (thread.status !== 'awaiting_answer') {
		throw new PigeonError('conflict', 'There is no open question in this thread');
	}

	// While a question is open, current_message is that question, and questions always have text (only declines store none).
	const question = await env.DB.prepare("SELECT body FROM messages WHERE message_id = ? AND kind = 'question'").bind(thread.current_message).first<{ readonly body: string }>();

	if (question === null) {
		throw new Error(`Thread ${thread_id} is awaiting an answer but its open question is missing`);
	}

	return question.body;
}

/**
 * Wait for the answer to the asker's open question, for up to 45 seconds. Returns the thread once it is answered or declined, or `still_waiting` after the timeout. Throws
 * `not_found` for an unknown thread; `forbidden` unless the member asked.
 */
export async function wait_for_answer(member: Member, thread_id: string): Promise<WaitResult> {
	const thread = await get_thread_row(member, thread_id);

	if (thread.asker !== member.member_id) {
		throw new PigeonError('forbidden', 'Only the person who asked can wait for the answer');
	}

	if (thread.status === 'awaiting_answer') {
		await team_room_of(member.team_id).wait_for_reply(member.member_id, thread_id, thread.current_message, WAIT_MS);
	}

	const thread_after_wait = await get_thread_row(member, thread_id);

	if (thread_after_wait.status === 'awaiting_answer') {
		return {
			status: 'still_waiting',
			thread_id,
			message: 'No answer yet. Call wait_for_answer again to keep waiting.',
		};
	}

	return { status: 'replied', thread: await build_view(thread_after_wait, await get_handles(member.team_id)) };
}
