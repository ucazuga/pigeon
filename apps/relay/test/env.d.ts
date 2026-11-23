import type { D1Migration } from 'cloudflare:test';

declare global {
	namespace Cloudflare {
		interface Env {
			/** The relay's D1 migrations, read by vitest.config.ts and applied before each test file. */
			readonly TEST_MIGRATIONS: D1Migration[];
		}

		/** Types `exports` from `cloudflare:workers`, which the tests use to call the Worker. */
		interface GlobalProps {
			mainModule: typeof import('../src/index');
			durableNamespaces: 'TeamRoom';
		}
	}
}
