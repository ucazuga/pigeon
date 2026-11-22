import { createMcpHandler } from '@modelcontextprotocol/server';
import { Hono } from 'hono';
import * as zod from 'zod';
import { type MemberVariables, require_member } from '../infrastructure/http/member-auth.middleware';
import { validate } from '../infrastructure/http/validate';
import { plugin_update_notice } from '../setup/plugin-version';
import { create_mcp_server } from './mcp.server';

/**
 * `/mcp` — Pigeon's remote MCP server (Streamable HTTP, stateless). The member is authenticated first,
 * and a fresh MCP server bound to that member handles the request. An outdated plugin is told to update.
 */
export const mcp_routes = new Hono<{ Variables: MemberVariables }>().all(
	'/mcp',
	require_member,
	validate(
		'header',
		// Plugins before 0.3.0 send no version.
		zod.object({
			'x-pigeon-plugin-version': zod
				.string()
				.regex(/^\d+\.\d+\.\d+$/)
				.nullable()
				.catch(null),
		}),
	),
	async (context) => {
		const member = context.get('member');
		const update_notice = plugin_update_notice(context.req.valid('header')['x-pigeon-plugin-version']);
		const handler = createMcpHandler(() => create_mcp_server(member, update_notice), { legacy: 'stateless' });

		return handler.fetch(context.req.raw);
	},
);
