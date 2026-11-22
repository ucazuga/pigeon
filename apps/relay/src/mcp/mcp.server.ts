import { McpServer } from '@modelcontextprotocol/server';
import { LATEST_PLUGIN_VERSION } from '../setup/plugin-version';
import type { Member } from '../teams/team.schema';
import { register_tools } from './mcp.tools';

const SERVER_INFO = { name: 'pigeon', version: LATEST_PLUGIN_VERSION } as const;

/**
 * Build the MCP server for one authenticated member. A fresh server is built per request (stateless transport).
 *
 * @param member - The member calling the tools.
 * @param update_notice - Set when the member's plugin is outdated: given as server instructions when Claude Code
 *   connects, and added to every tool result, so sessions that are already running hear it too.
 * @returns An MCP server exposing Pigeon's tools for that member.
 */
export function create_mcp_server(member: Member, update_notice: string | null): McpServer {
	let options = {};

	if (update_notice) {
		options = { instructions: update_notice };
	}

	const server = new McpServer(SERVER_INFO, options);

	register_tools(server, member, update_notice);

	return server;
}
