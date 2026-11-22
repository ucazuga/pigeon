import { createMcpHandler } from '@modelcontextprotocol/server';
import { Hono } from 'hono';
import { type MemberVariables, require_member } from '../infrastructure/http/member-auth.middleware';
import { create_mcp_server } from '../mcp/mcp.server';

/**
 * `/mcp` — Pigeon's remote MCP server (Streamable HTTP, stateless). The member is authenticated first,
 * and a fresh MCP server bound to that member handles the request.
 */
export const mcp_routes = new Hono<{ Variables: MemberVariables }>().all('/mcp', require_member, (context) => {
	const member = context.get('member');
	const handler = createMcpHandler(() => create_mcp_server(member), { legacy: 'stateless' });

	return handler.fetch(context.req.raw);
});
