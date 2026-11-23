import { exports } from 'cloudflare:workers';
import { vi } from 'vitest';

/*
 * The relay's clients, for integration tests. Each function does what a real client does, over the same HTTP and MCP
 * entry points, against the real Worker, D1 and team room:
 *
 * - the owner's browser: sign in, create a team, invite, remove, renew a prompt
 * - a member's plugin: join with an invite code, call MCP tools, read its endpoints
 * - the monitor: read the live event stream
 */

const ORIGIN = 'http://localhost:8787';

/** Newer than any release, so the relay never adds an "update your plugin" notice. */
const PLUGIN_VERSION = '99.0.0';

let request_count = 0;

/** Send a request to the Worker. Each one comes from its own IP, so the per-IP rate limits never trip across tests. */
export function request(path: string, init: RequestInit = {}): Promise<Response> {
	request_count += 1;

	const headers = new Headers(init.headers);

	headers.set('cf-connecting-ip', `10.0.${Math.floor(request_count / 256) % 256}.${request_count % 256}`);

	return exports.default.fetch(new Request(`${ORIGIN}${path}`, { ...init, headers }));
}

/** The first capture group of `pattern` in `text`, or '' when it does not match. */
export function first_match(pattern: RegExp, text: string): string {
	const match = pattern.exec(text);

	if (match === null) {
		return '';
	}

	return match[1] ?? '';
}

// The owner's browser

/** A signed-in owner: their session cookie. */
export type Owner = { readonly cookie: string };

/** A team as its owner created it. The owner holds their own invite code but has not joined yet. */
export type CreatedTeam = { readonly owner: Owner; readonly team_id: string; readonly owner_invite_code: string };

/** Submit a dashboard form, from the relay's own origin as the CSRF check requires. */
export function submit_form(path: string, fields: Record<string, string>, owner: Owner): Promise<Response> {
	return request(path, {
		method: 'POST',
		redirect: 'manual',
		headers: { origin: ORIGIN, cookie: owner.cookie, 'content-type': 'application/x-www-form-urlencoded' },
		body: new URLSearchParams(fields).toString(),
	});
}

/** The message a refused dashboard form redirects back with. */
export function form_error(response: Response): string {
	return new URL(response.headers.get('location') ?? '/', ORIGIN).searchParams.get('error') ?? '';
}

/** The invite code inside an invite page's setup prompt, or '' when the page has none. */
export function invite_code_in(page: string): string {
	return first_match(/\/setup\/([A-Za-z0-9_-]+)\.md/, page);
}

/** Ask for a magic link and press its "Sign in" button. A local relay prints the link to the console, where it is read from. The response sets the session cookie. */
export async function open_sign_in_link(email: string): Promise<Response> {
	const console_log = vi.spyOn(console, 'log').mockImplementation(() => undefined);

	await submit_form('/login', { email }, { cookie: '' });

	const printed = console_log.mock.calls.map((call) => String(call[0])).join('\n');

	console_log.mockRestore();

	const token = first_match(new RegExp(`sign-in link for ${email}: \\S+token=([A-Za-z0-9_-]+)`), printed);

	return submit_form('/verify', { token }, { cookie: '' });
}

/** Sign in with a magic link. */
export async function sign_in(email: string): Promise<Owner> {
	const verified = await open_sign_in_link(email);
	const [cookie = ''] = (verified.headers.get('set-cookie') ?? '').split(';');

	return { cookie };
}

/** The dashboard page as the owner sees it. */
export async function dashboard_page(owner: Owner): Promise<string> {
	return (await request('/dashboard', { headers: { cookie: owner.cookie } })).text();
}

/** A new owner with a new team. */
export async function new_team(owner_handle = 'boss'): Promise<CreatedTeam> {
	const owner = await sign_in(`owner-${crypto.randomUUID()}@example.test`);
	const created = await submit_form('/dashboard/teams', { name: 'Team', handle: owner_handle }, owner);
	const dashboard = await dashboard_page(owner);

	return {
		owner,
		team_id: first_match(/data-invites-url="\/dashboard\/teams\/([^/]+)\/invites"/, dashboard),
		owner_invite_code: invite_code_in(await created.text()),
	};
}

/** Invite a teammate. The response is the invite page, or a redirect with an error when the invite was refused. */
export function invite(team: CreatedTeam, handle: string): Promise<Response> {
	return submit_form(`/dashboard/teams/${team.team_id}/invites`, { handle }, team.owner);
}

/** Invite a teammate and return their invite code, or '' when the invite was refused. */
export async function invite_code(team: CreatedTeam, handle: string): Promise<string> {
	return invite_code_in(await (await invite(team, handle)).text());
}

/** Remove a teammate from the team. */
export function remove_member(team: CreatedTeam, handle: string): Promise<Response> {
	return submit_form(`/dashboard/teams/${team.team_id}/members/${handle}/revoke`, {}, team.owner);
}

/** Ask for a new setup prompt for an invite. */
export function new_prompt(team: CreatedTeam, handle: string): Promise<Response> {
	return submit_form(`/dashboard/teams/${team.team_id}/members/${handle}/prompt`, {}, team.owner);
}

// A member's plugin

/** Exchange an invite code for a member token, as the setup guide does. */
export function claim(invite_code: string): Promise<Response> {
	return request('/api/join', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ invite_code }) });
}

/** Claim an invite and return the member token, or '' when the claim was refused. */
export async function join(invite_code: string): Promise<string> {
	const response = await claim(invite_code);

	if (response.ok === false) {
		return '';
	}

	return ((await response.json()) as { readonly member_token: string }).member_token;
}

/** GET one of the plugin scripts' endpoints with a member token. */
export function member_get(member_token: string, path: string): Promise<Response> {
	return request(path, { headers: { authorization: `Bearer ${member_token}` } });
}

/** What an MCP tool returned: its JSON result and any notes after it, or the error text. */
export type ToolResult = { readonly ok: true; readonly value: Record<string, unknown>; readonly notes: ReadonlyArray<string> } | { readonly ok: false; readonly error: string };

type McpResponse = { readonly result: { readonly isError?: boolean; readonly content: ReadonlyArray<{ readonly text: string }> } };

/** Call a Pigeon MCP tool as a member's Claude Code does, from a plugin at `plugin_version`. */
export async function call_tool(member_token: string, tool: string, tool_arguments: Record<string, unknown>, plugin_version = PLUGIN_VERSION): Promise<ToolResult> {
	const response = await request('/mcp', {
		method: 'POST',
		headers: {
			authorization: `Bearer ${member_token}`,
			'x-pigeon-plugin-version': plugin_version,
			'content-type': 'application/json',
			accept: 'application/json, text/event-stream',
		},
		body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name: tool, arguments: tool_arguments } }),
	});
	// The MCP handler answers as a one-event stream: the JSON-RPC message is on the `data:` line.
	const message = first_match(/^data: (.*)$/m, await response.text());
	const { result } = JSON.parse(message) as McpResponse;
	const [content = { text: '' }, ...notes] = result.content;

	if (result.isError) {
		return { ok: false, error: content.text };
	}

	return { ok: true, value: JSON.parse(content.text) as Record<string, unknown>, notes: notes.map((note) => note.text) };
}

/** Call a Pigeon MCP tool that must succeed, and return its JSON result. */
export async function call_tool_ok(member_token: string, tool: string, tool_arguments: Record<string, unknown>): Promise<Record<string, unknown>> {
	const result = await call_tool(member_token, tool, tool_arguments);

	if (result.ok === false) {
		throw new Error(`${tool} failed: ${result.error}`);
	}

	return result.value;
}

// The monitor

/** How long `read_events` reads before it gives up waiting for `enough`. */
const EVENT_READ_LIMIT_MS = 1000;

/** Read a member's event stream until `enough` holds for what arrived, the stream ends, or a second passes. */
export async function read_events(member_token: string, headers: Record<string, string>, enough: (received: string) => boolean): Promise<string> {
	const response = await request('/api/events', { headers: { authorization: `Bearer ${member_token}`, 'x-pigeon-plugin-version': PLUGIN_VERSION, ...headers } });
	const reader = (response.body as ReadableStream<Uint8Array>).getReader();
	const give_up = new Promise<'gave_up'>((resolve) => setTimeout(resolve, EVENT_READ_LIMIT_MS, 'gave_up'));
	const decoder = new TextDecoder();
	let received = '';

	while (enough(received) === false) {
		const chunk = await Promise.race([reader.read(), give_up]);

		if (chunk === 'gave_up' || chunk.done) {
			break;
		}

		received += decoder.decode(chunk.value);
	}

	await reader.cancel();

	return received;
}

// Teams

/** A team with the owner (@boss) and one teammate (@lin), both joined: their member tokens. */
export async function team_of_two(): Promise<CreatedTeam & { readonly boss: string; readonly lin: string }> {
	const team = await new_team('boss');
	const lin_code = await invite_code(team, 'lin');

	return { ...team, boss: await join(team.owner_invite_code), lin: await join(lin_code) };
}
