import { describe, expect, test } from 'bun:test';
import { PigeonError } from '../pigeon-error';
import * as Thread from './thread';

const opened = Thread.open({ thread_id: 'thread-1', asker: 'asker', answerer: 'answerer', question: 'question-1' });

function error_code(action: () => unknown): string | null {
	try {
		action();
	} catch (error) {
		if (error instanceof PigeonError) {
			return error.code;
		}

		throw error;
	}

	return null;
}

describe('thread turn-taking', () => {
	test('the answerer answers the open question, then the asker may follow up', () => {
		const answered = Thread.answer(opened, 'answerer', 'question-1', 'answer-1');
		const followed_up = Thread.follow_up(answered, 'asker', 'question-2');

		expect(followed_up).toMatchObject({ status: 'awaiting_answer', open_question: 'question-2' });
	});

	test('the asker cannot follow up while a question is still open', () => {
		expect(error_code(() => Thread.follow_up(opened, 'asker', 'question-2'))).toBe('conflict');
	});

	test('only the answerer may answer', () => {
		expect(error_code(() => Thread.answer(opened, 'asker', 'question-1', 'answer-1'))).toBe('forbidden');
		expect(error_code(() => Thread.answer(opened, 'outsider', 'question-1', 'answer-1'))).toBe('forbidden');
	});

	test('a reply to a question other than the open one is refused', () => {
		expect(error_code(() => Thread.decline(opened, 'answerer', 'question-2'))).toBe('conflict');
	});

	test('a declined thread can be followed up', () => {
		const declined = Thread.decline(opened, 'answerer', 'question-1');

		expect(Thread.follow_up(declined, 'asker', 'question-2').status).toBe('awaiting_answer');
	});
});
