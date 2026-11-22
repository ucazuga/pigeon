/** The plugin version the marketplace serves. Bump together with `plugins/pigeon/.claude-plugin/plugin.json`. */
export const LATEST_PLUGIN_VERSION = '0.3.0';

const UPDATE_COMMAND = 'claude plugin marketplace update pigeon && claude plugin update pigeon@pigeon --scope user';

function is_older(version: string, latest: string): boolean {
	const version_parts = version.split('.').map(Number);
	const latest_parts = latest.split('.').map(Number);

	for (let index = 0; index < latest_parts.length; index++) {
		const own_part = version_parts[index] ?? 0;
		const latest_part = latest_parts[index] ?? 0;

		if (own_part !== latest_part) {
			return own_part < latest_part;
		}
	}

	return false;
}

/**
 * What to tell a member whose plugin is behind. The plugin sends its version in `X-Pigeon-Plugin-Version`; plugins
 * before 0.3.0 send none, so a missing version counts as outdated. Third-party marketplaces do not auto-update unless
 * the user turned it on, so the relay is the one place that can tell them.
 *
 * @param version - The version the plugin reported, or null when it sent none.
 * @returns The notice, written for the member's Claude to pass on, or null when the plugin is current.
 */
export function plugin_update_notice(version: string | null): string | null {
	if (version && is_older(version, LATEST_PLUGIN_VERSION) === false) {
		return null;
	}

	return (
		`The Pigeon plugin on this machine is out of date (latest is ${LATEST_PLUGIN_VERSION}). ` +
		`Tell the user, and offer to run \`${UPDATE_COMMAND}\`; then they run /reload-plugins or restart Claude Code.`
	);
}
