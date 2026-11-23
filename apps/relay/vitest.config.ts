import path from 'node:path';
import { cloudflareTest, readD1Migrations } from '@cloudflare/vitest-plugin';
import { defineConfig } from 'vitest/config';

/*
 * Relay tests run inside workerd with the real Worker, D1 and the TeamRoom Durable Object (Miniflare), and talk to it
 * over HTTP and MCP like a browser or a plugin would. Storage is fresh for every test file.
 */
export default defineConfig({
	plugins: [
		cloudflareTest(async () => {
			const migrations = await readD1Migrations(path.join(import.meta.dirname, 'src/infrastructure/d1/migrations'));

			return {
				wrangler: { configPath: './wrangler.jsonc' },
				miniflare: {
					bindings: {
						TEST_MIGRATIONS: migrations,
						PUBLIC_URL: 'http://localhost:8787',
						SESSION_SIGNING_KEY: 'test-signing-key-at-least-32-characters-long',
						// Sign-in links go to the console, where the tests read them.
						MAGIC_LINK_DELIVERY: 'console',
					},
				},
			};
		}),
	],
	test: {
		include: ['test/**/*.integration.test.ts'],
		setupFiles: ['./test/apply-migrations.ts'],
	},
});
