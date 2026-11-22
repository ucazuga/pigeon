import type { Redacted } from '../infrastructure/redacted';

/** GitHub repository that is both the plugin's source and its Claude Code marketplace. */
const PLUGIN_REPOSITORY = 'ucazuga/pigeon';

/** Everything the setup guide needs to render. */
export type SetupGuideInput = {
	/** Relay origin. */
	readonly public_url: URL;

	/** The invite being set up. Rendered only into this one response. */
	readonly invite_code: Redacted<string>;
};

/**
 * Render the one-line prompt the owner copies from the dashboard and hands to a teammate.
 *
 * @param input - Relay origin and invite code.
 * @returns A prompt the teammate pastes into Claude Code.
 */
export function render_setup_prompt(input: SetupGuideInput): string {
	return `Read ${input.public_url.origin}/setup/${input.invite_code.unwrap()}.md and set me up for Pigeon.`;
}

/**
 * Render the setup guide (served as markdown) that the teammate's agent follows to install itself.
 * The member token is written to disk by `pigeon-join` and never printed, so it never enters the transcript.
 *
 * @param input - Relay origin and invite code.
 * @returns Markdown instructions addressed to an agent.
 */
export function render_setup_guide(input: SetupGuideInput): string {
	const origin = input.public_url.origin;
	const code = input.invite_code.unwrap();

	return [
		'# Pigeon setup (for your agent)',
		'',
		'You are setting up Pigeon for the person you are working with. Pigeon lets their Claude Code ask teammates',
		'questions and answer theirs. Every answer is approved by a human before it is sent; Claude Code enforces this.',
		'',
		'Explain each step to the person before running it. Stop and ask if anything fails.',
		'',
		'1. Install the plugin from its public repository (a remote MCP server plus a few short shell scripts',
		`   the person can read at https://github.com/${PLUGIN_REPOSITORY}/tree/main/plugins/pigeon):`,
		'   ```sh',
		`   claude plugin marketplace add ${PLUGIN_REPOSITORY} --scope user`,
		'   claude plugin install pigeon@pigeon --scope user',
		'   ```',
		'2. Ask the person to run `/reload-plugins`, so the plugin scripts are on your PATH.',
		'3. Join the team. This single-use code is exchanged for a member token, which is written to',
		'   `~/.pigeon/credentials.json` (mode 600) and is never printed:',
		'   ```sh',
		`   pigeon-join ${code} ${origin}`,
		'   ```',
		'4. Ask the person to run `/mcp` and confirm the `pigeon` server is connected, then call the `list_teammates` tool.',
		'5. Tell them how to use it: ask with `/pigeon:ask @handle <question>`, and answer with `/pigeon:inbox`.',
		'',
	].join('\n');
}
