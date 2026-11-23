# Contributing

```sh
bun install
bun run typecheck && bun run lint && bun test
```

- Code follows the standard enforced by `biome.json` and the rules in `tooling/biome-rules/`; domain language is in
  [CONTEXT.md](CONTEXT.md).
- Relay behaviour is tested in `apps/relay/test/*.integration.test.ts`: the real Worker, D1 and team room in workerd,
  driven over HTTP and MCP through `test/client.ts`. Name tests `should …` and lay them out as given / when / then.
  Add a test when it would catch a change that matters, not to raise a number. `bun run test:mutation` (in
  `apps/relay`, slow) shows which code changes no test would notice.
- Changes to `plugins/pigeon/bin/` need a test in `tests/plugin-scripts.test.ts`. These scripts run on people's machines;
  keep them short, POSIX `sh`, and free of dependencies beyond `curl` and `claude`.
- CI (`.github/workflows/ci.yml`) runs the same checks on every push and pull request. A push to `main` that passes
  is deployed to the hosted relay: D1 migrations, then the Worker. Don't deploy it from your machine.
- By contributing you agree that your contribution is licensed under the license of the directory it touches
  (MIT for `plugins/pigeon/`, AGPL-3.0 elsewhere).
