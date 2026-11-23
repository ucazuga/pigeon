// Mutation testing: Stryker changes the relay's code one small edit at a time and checks that some test fails.
// A surviving mutant is a change no test would notice. Run with `bun run test:mutation` (slow; not part of CI).
/** @type {import('@stryker-mutator/api/core').PartialStrykerOptions} */
export default {
	testRunner: 'vitest',
	plugins: ['@stryker-mutator/vitest-runner'],
	// Tests reach the code through the Worker's HTTP and MCP entry points, not by importing it, so run them all.
	vitest: { configFile: 'vitest.config.ts', related: false },
	coverageAnalysis: 'perTest',
	mutate: ['src/**/*.ts', 'src/**/*.tsx', '!src/web/**', '!src/env.d.ts', '!src/index.ts'],
	reporters: ['clear-text', 'progress', 'html'],
	htmlReporter: { fileName: 'reports/mutation/index.html' },
	concurrency: 4,
	timeoutMS: 20000,
	tempDirName: '.stryker-tmp',
};
