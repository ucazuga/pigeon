import { describe, expect, test } from 'bun:test';
import { join } from 'node:path';
import { LATEST_PLUGIN_VERSION } from '../apps/relay/src/setup/plugin-version';
import { render_setup_guide } from '../apps/relay/src/setup/setup-guide';

/*
 * The plugin and the relay are released from the same commit but read on different machines, so the values they must
 * agree on are checked here.
 */

const PLUGIN = join(import.meta.dir, '..', 'plugins', 'pigeon');

/** The relay the plugin's MCP server uses when `PIGEON_RELAY_URL` is not set. */
async function plugin_default_relay(): Promise<string> {
	const mcp_config = await Bun.file(join(PLUGIN, '.mcp.json')).text();
	const [, default_relay = ''] = /\$\{PIGEON_RELAY_URL:-([^}]+)\}/.exec(mcp_config) ?? [];

	return default_relay;
}

function setup_guide_for(origin: string): string {
	return render_setup_guide({ origin, invite_code: 'code_aaaaaaaaaaaaaaaa', team_name: 'Core', handle: 'ahmet' });
}

describe('plugin release', () => {
	test("should not ask members of the plugin's default relay to set PIGEON_RELAY_URL", async () => {
		// given
		const default_relay = await plugin_default_relay();

		// when
		const hosted_guide = setup_guide_for(default_relay);
		const self_hosted_guide = setup_guide_for('https://relay.self-hosted.test');

		// then
		expect(default_relay).toBe('https://pigeon.ucazuga.com');
		expect(hosted_guide).not.toContain('PIGEON_RELAY_URL');
		expect(self_hosted_guide).toContain('"PIGEON_RELAY_URL": "https://relay.self-hosted.test"');
	});

	test("should treat the plugin's own version as the latest", async () => {
		// given
		const manifest = (await Bun.file(join(PLUGIN, '.claude-plugin', 'plugin.json')).json()) as { readonly version: string };

		// when
		const plugin_version = manifest.version;

		// then
		expect(LATEST_PLUGIN_VERSION).toBe(plugin_version);
	});
});
