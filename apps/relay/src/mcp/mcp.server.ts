import { McpServer } from '@modelcontextprotocol/server';
import type { Member } from '../members/member.schema';
import { mcp_tools } from './mcp.tools';

const SERVER_INFO = { name: 'pigeon', version: '0.1.0' } as const;

/**
 * Build the MCP server for one authenticated member. A fresh server is built per request (stateless transport).
 *
 * @param member - The member calling the tools.
 * @returns An MCP server exposing Pigeon's tools for that member.
 */
export function create_mcp_server(member: Member): McpServer {
	const server = new McpServer(SERVER_INFO);

	mcp_tools.register(server, member);

	return server;
}
