import { PigeonError } from '../pigeon-error';

/*
 * A thread is one conversation between an asker and one answerer. It alternates strictly:
 * the asker asks, the answerer answers or declines, the asker may follow up. Only one question is open at a time,
 * which keeps human approval on the answering side simple — there is always exactly one draft to review.
 */

type ThreadBase = {
	readonly thread_id: string;

	/** Member ID (not handle) of the person who asked. */
	readonly asker: string;

	/** Member ID (not handle) of the person asked. */
	readonly answerer: string;
};

/** The conversational state of a thread. */
export type Thread =
	| (ThreadBase & { readonly status: 'awaiting_answer'; readonly open_question: string })
	| (ThreadBase & { readonly status: 'answered'; readonly last_answer: string })
	| (ThreadBase & { readonly status: 'declined'; readonly declined_question: string });

/**
 * Open a thread with its first question.
 *
 * @param input - The new thread's participants and first question ID.
 * @returns A thread awaiting an answer.
 */
export function open(input: ThreadBase & { readonly question: string }): Thread {
	return {
		status: 'awaiting_answer',
		thread_id: input.thread_id,
		asker: input.asker,
		answerer: input.answerer,
		open_question: input.question,
	};
}

/**
 * The asker continues the thread with a new question.
 *
 * @param thread - The current thread.
 * @param actor - The member asking.
 * @param question - The new question's ID.
 * @returns The thread, awaiting an answer to the new question.
 * @throws {PigeonError} `forbidden` when the actor is not the asker; `conflict` while a question is still open.
 */
export function follow_up(thread: Thread, actor: string, question: string): Thread {
	if (actor !== thread.asker) {
		throw new PigeonError('forbidden', 'Only the asker can follow up');
	}

	if (thread.status === 'awaiting_answer') {
		throw new PigeonError('conflict', 'The previous question has not been answered yet');
	}

	return open({ thread_id: thread.thread_id, asker: thread.asker, answerer: thread.answerer, question });
}

/**
 * The answerer replies to the open question.
 *
 * @param thread - The current thread.
 * @param actor - The member answering.
 * @param in_reply_to - The question being answered.
 * @param answer_id - The answer's ID.
 * @returns The answered thread.
 * @throws {PigeonError} `forbidden` when the actor is not the answerer; `conflict` when no question is open or
 *   `in_reply_to` is not the open question.
 */
export function answer(thread: Thread, actor: string, in_reply_to: string, answer_id: string): Thread {
	assert_can_reply(thread, actor, in_reply_to);

	return {
		status: 'answered',
		thread_id: thread.thread_id,
		asker: thread.asker,
		answerer: thread.answerer,
		last_answer: answer_id,
	};
}

/**
 * The answerer declines the open question.
 *
 * @param thread - The current thread.
 * @param actor - The member declining.
 * @param in_reply_to - The question being declined.
 * @returns The declined thread.
 * @throws {PigeonError} Same cases as {@link answer}.
 */
export function decline(thread: Thread, actor: string, in_reply_to: string): Thread {
	assert_can_reply(thread, actor, in_reply_to);

	return {
		status: 'declined',
		thread_id: thread.thread_id,
		asker: thread.asker,
		answerer: thread.answerer,
		declined_question: in_reply_to,
	};
}

function assert_can_reply(thread: Thread, actor: string, in_reply_to: string): void {
	if (actor !== thread.answerer) {
		throw new PigeonError('forbidden', 'Only the person asked can reply');
	}

	if (thread.status !== 'awaiting_answer') {
		throw new PigeonError('conflict', 'There is no open question in this thread');
	}

	if (thread.open_question !== in_reply_to) {
		throw new PigeonError('conflict', 'This reply is for a question that is no longer open');
	}
}
