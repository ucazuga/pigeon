# Contributing

```sh
bun install
bun run typecheck && bun run lint && bun test
```

- Code follows the standard enforced by `biome.json` and the rules in `tooling/biome-rules/`; domain language is in
  [CONTEXT.md](CONTEXT.md).
- Changes to `plugins/pigeon/bin/` need a test in `tests/plugin-scripts.test.ts`. These scripts run on people's machines;
  keep them short, POSIX `sh`, and free of dependencies beyond `curl` and `claude`.
- By contributing you agree that your contribution is licensed under the license of the directory it touches
  (MIT for `plugins/pigeon/`, AGPL-3.0 elsewhere).
