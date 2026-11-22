import * as zod from 'zod';

/** Upper bound on a single message, in characters. MVP messages are plain text only. */
export const MESSAGE_BODY_MAX_LENGTH = 8000;

/** A plain-text question, follow-up or answer: trimmed, non-empty, bounded. */
export const MESSAGE_BODY = zod.string().trim().min(1).max(MESSAGE_BODY_MAX_LENGTH);

/*
 * Events the relay pushes on `GET /api/events` (SSE). The plugin monitor turns each into a one-line notification
 * that goes straight into the member's Claude session, so events never carry message text: a teammate must not
 * be able to put words in front of someone's Claude without that person opening /pigeon:inbox.
 * Message text is only returned by MCP tools (`list_inbox`, `get_thread`, `wait_for_answer`).
 */

type ThreadMessage = {
	readonly thread_id: string;
	readonly message_id: string;
	/** Handle of the sender; the monitor prints it only if it matches the handle format. */
	readonly from: string;
	readonly sent_at: string;
};

/** Something happened in a thread that the recipient should know about. */
export type RelayEvent =
	| (ThreadMessage & { readonly type: 'question_received' })
	| (ThreadMessage & { readonly type: 'answer_received'; readonly in_reply_to: string })
	| (ThreadMessage & { readonly type: 'question_declined'; readonly in_reply_to: string });

/**
 * Sent once when a monitor connects without `Last-Event-ID` (a new Claude Code session). They have no event id, so
 * they do not move the client's `Last-Event-ID`.
 *
 * - `unanswered_questions`: how many questions wait for this member, so ones that arrived while no session was open
 *   are not missed.
 * - `plugin_outdated`: the member's plugin is older than the one the marketplace serves.
 */
export type ConnectNotice = { readonly type: 'unanswered_questions'; readonly count: number } | { readonly type: 'plugin_outdated'; readonly latest: string };
