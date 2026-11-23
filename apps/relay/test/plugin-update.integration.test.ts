import { describe, expect, test } from 'vitest';
import { LATEST_PLUGIN_VERSION } from '../src/setup/plugin-version';
import { call_tool, read_events, team_of_two } from './client';

const HAS_EVENT_ID = /\nid: \d+/;
const [major = 0, minor = 0, patch = 0] = LATEST_PLUGIN_VERSION.split('.').map(Number);

describe('plugin update notice', () => {
	test.each([
		{ plugin: 'an older', version: '0.0.0', told: true },
		{ plugin: 'a pre-0.3.0 (no version)', version: '', told: true },
		{ plugin: 'the latest', version: LATEST_PLUGIN_VERSION, told: false },
		{ plugin: 'a newer patch', version: `${major}.${minor}.${patch + 1}`, told: false },
		// Compared as numbers: as text, "10" sorts before "4".
		{ plugin: 'a newer two-digit minor', version: `${major}.${minor + 10}.0`, told: false },
	])('should tell $plugin plugin to update: $told', async ({ version, told }) => {
		// given
		const team = await team_of_two();

		// when
		const first_connect = await read_events(team.lin, { 'x-pigeon-plugin-version': version }, (text) => HAS_EVENT_ID.test(text));

		// then
		expect(first_connect.includes('"type":"plugin_outdated"')).toBe(told);
	});

	test('should add the update notice to tool results for an outdated plugin', async () => {
		// given
		const team = await team_of_two();

		// when
		const outdated = await call_tool(team.lin, 'list_teammates', {}, '0.0.0');
		const current = await call_tool(team.lin, 'list_teammates', {}, LATEST_PLUGIN_VERSION);

		// then
		expect(outdated).toMatchObject({ ok: true, notes: [expect.stringContaining('out of date')] });
		expect(current).toMatchObject({ ok: true, notes: [] });
	});
});
