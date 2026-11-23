import { McpServer } from '@modelcontextprotocol/server';
import { LATEST_PLUGIN_VERSION } from '../setup/plugin-version';
import type { Member } from '../teams/team.schema';
import { register_tools } from './mcp.tools';

const SERVER_INFO = { name: 'pigeon', version: LATEST_PLUGIN_VERSION } as const;

/**
 * The MCP server for one member, built per request (stateless transport). `update_notice` is set while their plugin is outdated: it goes out as server instructions
 * when Claude Code connects, and on every tool result, so sessions that are already running hear it too.
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
