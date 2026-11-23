# Contributing

```sh
bun install
bun run typecheck && bun run lint && bun run test
```

- Code follows the standard enforced by `biome.json` and the rules in `tooling/biome-rules/`; domain language is in
  [CONTEXT.md](CONTEXT.md).
- Relay behaviour is tested in `apps/relay/test/*.integration.test.ts`: the real Worker, D1 and team room in workerd,
  driven over HTTP and MCP through `test/client.ts`. Name tests `should …` and lay them out as given / when / then.
  Add a test when it would catch a change that matters, not to raise a number. `bun run test:mutation` (in
  `apps/relay`, slow) shows which code changes no test would notice.
- Changes to `plugins/pigeon/bin/` need a test in `tests/plugin-scripts.test.ts`. These scripts run on people's machines;
  keep them short, POSIX `sh`, and free of dependencies beyond `curl` and `claude`.
- Work on a short-lived branch named after the change (`feat/…`, `fix/…`, `docs/…`, `test/…`, `ci/…`, `chore/…`)
  and open a pull request to `main`. Pull requests are squash-merged, so the title becomes the commit on `main`: write
  it as a lowercase conventional commit, e.g. `fix(relay): keep the stream open after a reconnect`. CI checks it.
- CI (`.github/workflows/ci.yml`) runs the same checks on every push and pull request. A push to `main` that passes
  is deployed to the hosted relay: D1 migrations, then the Worker. Don't deploy it from your machine.
- The plugin is installed from `main`, and Claude Code updates it only when its version changes. A pull request that
  touches `plugins/pigeon/` must raise `version` in `plugins/pigeon/.claude-plugin/plugin.json` and
  `LATEST_PLUGIN_VERSION` in `apps/relay/src/setup/plugin-version.ts` together; CI fails otherwise. After the deploy,
  CI tags the new version as `v<version>` and publishes a GitHub release with notes from the merged pull requests.
- By contributing you agree that your contribution is licensed under the license of the directory it touches
  (MIT for `plugins/pigeon/`, AGPL-3.0 elsewhere).
