/** GitHub repository that is both the plugin's source and its Claude Code marketplace. */
const PLUGIN_REPOSITORY = 'ucazuga/pigeon';

/** The relay the plugin talks to when `PIGEON_RELAY_URL` is not set. Must match plugins/pigeon/.mcp.json. */
const PLUGIN_DEFAULT_RELAY = 'https://pigeon.example';

/** Everything the setup guide needs to render. */
export type SetupGuideInput = {
	/** Relay origin, e.g. `https://pigeon.example`. */
	readonly origin: string;

	/** The invite code. Rendered only into this one response. */
	readonly invite_code: string;

	/** The team being joined. */
	readonly team_name: string;

	/** The handle the teammate will have. */
	readonly handle: string;
};

/**
 * The one-line prompt the owner copies from the dashboard and hands to a teammate. It asks the agent to fetch the
 * guide with curl, so the agent reads it verbatim (a web-fetch tool may summarize it and garble the code).
 *
 * @param origin - Relay origin.
 * @param invite_code - The invite code.
 * @returns A prompt the teammate pastes into Claude Code.
 */
export function render_setup_prompt(origin: string, invite_code: string): string {
	return `Run \`curl -fsS ${origin}/setup/${invite_code}.md\` and follow the instructions to set me up for Pigeon.`;
}

/**
 * The setup guide (served as markdown) that the teammate's agent follows to install Pigeon.
 * Joining happens first, with a command that writes the member token to a file without printing it, so the token
 * never enters the transcript. Restarting Claude Code is the last step, because the agent loses its context there.
 *
 * @param input - Relay origin, invite code, team and handle.
 * @returns Markdown instructions addressed to an agent.
 */
export function render_setup_guide(input: SetupGuideInput): string {
	let protocols = '=https';

	if (input.origin.startsWith('http://localhost') || input.origin.startsWith('http://127.0.0.1')) {
		protocols = '=http';
	}

	const lines = [
		'# Pigeon setup (for your agent)',
		'',
		`You are setting up Pigeon for the person you are working with. They are joining the team "${input.team_name}"`,
		`as @${input.handle}. Pigeon lets their Claude Code ask teammates questions and answer theirs; every answer is`,
		'approved by a human before it is sent.',
		'',
		'Explain each step to the person before running it. Stop and ask if anything fails.',
		'',
		'## 1. Join the team',
		'',
		'This exchanges the single-use invite code for a member token and saves it to `~/.pigeon/credentials.json`',
		'(readable only by the person). The token is never printed. If the file already exists, stop and ask the',
		'person whether to replace their current team.',
		'',
		'```sh',
		'test -e ~/.pigeon/credentials.json && echo "ALREADY JOINED: stop and ask" || (',
		'  mkdir -p ~/.pigeon && chmod 700 ~/.pigeon && umask 077 &&',
		`  curl -fsS --proto ${protocols} -X POST -H 'content-type: application/json' \\`,
		`    --data-binary '{"invite_code":"${input.invite_code}"}' \\`,
		`    --url ${input.origin}/api/join -o ~/.pigeon/credentials.json.tmp &&`,
		`  grep -q '"member_token":"' ~/.pigeon/credentials.json.tmp &&`,
		'  mv ~/.pigeon/credentials.json.tmp ~/.pigeon/credentials.json && echo "Joined."',
		')',
		'```',
		'',
		'## 2. Install the plugin',
		'',
		`The plugin is open source: https://github.com/${PLUGIN_REPOSITORY}/tree/main/plugins/pigeon`,
		'',
		'```sh',
		`claude plugin marketplace add ${PLUGIN_REPOSITORY} --scope user`,
		'claude plugin install pigeon@pigeon --scope user',
		'```',
		'',
	];

	lines.push(
		'## 3. Settings',
		'',
		'In `~/.claude/settings.json`, keep every other setting as it is and:',
		'',
		'- Set `autoUpdate` to `true` on the `pigeon` entry of `extraKnownMarketplaces` (the marketplace command above',
		'  created that entry), so Pigeon keeps itself up to date. Claude Code leaves auto-update off for marketplaces',
		'  it does not ship with.',
	);

	if (input.origin !== PLUGIN_DEFAULT_RELAY) {
		lines.push(
			`- Add \`"PIGEON_RELAY_URL": "${input.origin}"\` to the \`env\` object (create \`env\` if it is missing), so`,
			'  the plugin talks to this relay.',
		);
	}

	lines.push('');

	lines.push(
		'## Last step: restart',
		'',
		'Tell the person to restart Claude Code. After that, `/mcp` shows the `pigeon` server as connected, and they',
		'can ask with `/pigeon:ask @handle <question>` and answer with `/pigeon:inbox`.',
		'',
	);

	return lines.join('\n');
}
