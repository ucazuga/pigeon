import type { McpServer } from '@modelcontextprotocol/server';
import * as zod from 'zod';
import { not_yet_implemented } from '../infrastructure/defects';
import type { Member } from '../members/member.schema';
import { MEMBER_HANDLE } from '../members/member.schema';
import { MESSAGE_BODY } from '../threads/thread.schema';

/*
 * Pigeon's MCP tools, as seen by a member's Claude Code through the plugin's remote MCP server.
 *
 * Trust rule enforced by the platform, not by prompt: `send_answer` carries
 * `anthropic/requiresUserInteraction`, so Claude Code asks the human on every call — no "always allow",
 * and it cannot run unattended (it is denied in `-p` / `dontAsk`).
 */

const ID = zod.string().min(1).max(64);

// TODO(implementation): wrap every tool callback once, so a thrown PigeonError becomes a tool error carrying its
// code, and anything else is logged and returned as a generic error. Without it, the MCP SDK returns the raw
// error message to the client and bypasses infrastructure/http/error.handler.ts.

const REQUIRES_HUMAN = { 'anthropic/requiresUserInteraction': true } as const;

/** Every Pigeon tool, registered for one authenticated member. */
export const mcp_tools = {
	/**
	 * Register all tools on a server, bound to the member calling them.
	 *
	 * @param server - The MCP server to register on.
	 * @param member - The authenticated member.
	 */
	register(server: McpServer, member: Member): void {
		server.registerTool(
			'list_teammates',
			{
				description: 'List the handles of teammates you can ask.',
				annotations: { readOnlyHint: true },
			},
			async () => not_yet_implemented(`list_teammates for ${member.handle}`),
		);

		server.registerTool(
			'ask_teammate',
			{
				description:
					"Ask a teammate's Claude a question. The question must stand alone: they cannot see this conversation. " +
					'Returns a thread_id; then call wait_for_answer.',
				inputSchema: zod.object({ to: MEMBER_HANDLE, question: MESSAGE_BODY }),
			},
			async () => not_yet_implemented('ask_teammate'),
		);

		server.registerTool(
			'follow_up',
			{
				description: 'Ask a follow-up question in a thread that has been answered or declined.',
				inputSchema: zod.object({ thread_id: ID, question: MESSAGE_BODY }),
			},
			async () => not_yet_implemented('follow_up'),
		);

		server.registerTool(
			'wait_for_answer',
			{
				description:
					'Wait until a teammate answers or declines the open question in a thread, and return the answer. ' +
					'It can take minutes; keep working on other things meanwhile.',
				inputSchema: zod.object({ thread_id: ID }),
				annotations: { readOnlyHint: true },
			},
			async () => not_yet_implemented('wait_for_answer (long-poll with progress notifications)'),
		);

		server.registerTool(
			'list_inbox',
			{
				description: 'List questions teammates sent you that still need an answer, with thread history.',
				annotations: { readOnlyHint: true },
			},
			async () => not_yet_implemented('list_inbox'),
		);

		server.registerTool(
			'get_thread',
			{
				description: 'Read the full history of a thread you are part of.',
				inputSchema: zod.object({ thread_id: ID }),
				annotations: { readOnlyHint: true },
			},
			async () => not_yet_implemented('get_thread'),
		);

		server.registerTool(
			'send_answer',
			{
				description:
					'Send the human-approved answer to a question. Only call this after the human has read the exact text.',
				inputSchema: zod.object({ thread_id: ID, question_id: ID, answer: MESSAGE_BODY }),
				_meta: REQUIRES_HUMAN,
			},
			async () => not_yet_implemented('send_answer'),
		);

		server.registerTool(
			'decline_question',
			{
				description: 'Decline a question without answering it.',
				inputSchema: zod.object({ thread_id: ID, question_id: ID }),
			},
			async () => not_yet_implemented('decline_question'),
		);
	},
};
