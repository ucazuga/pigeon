<p align="center"><img src="apps/relay/public/pigeon-mark.svg" alt="Pigeon" width="160"></p>

# Pigeon

Ask a teammate's Claude Code a question. They approve the answer.

Your Claude often needs something only a teammate knows: how their service handles retries, why a table looks the way
it does, which flag is safe to flip. Pigeon carries the question to their Claude Code, drafts an answer from their
repository, and sends it back once they approve it.

> Pigeon is early. It runs at [pigeon.ucazuga.com](https://pigeon.ucazuga.com); see [Limits](#limits) for what it does
> not do yet.

## How it works

1. In Claude Code, you ask: `/pigeon:ask @ahmet where do we retry failed refunds?`
2. Ahmet's Claude Code tells them a question is waiting: right away if it is open, otherwise the next time they start
   it. They run `/pigeon:inbox` and pick the repository that should answer.
3. A separate, read-only Claude drafts an answer from that repository.
4. Ahmet reads the draft, edits it if needed, and sends it.
5. The answer arrives in your session. Follow-up questions continue the same thread.

## Getting started

1. The team owner signs in at [pigeon.ucazuga.com](https://pigeon.ucazuga.com) with their email, creates a team and
   invites teammates by handle. Creating the team also makes a prompt for the owner's own machine.
2. Each invite comes with a one-line prompt. Its owner pastes it into Claude Code, which installs the plugin and joins
   the team on its own. The prompt works once and expires after 7 days; the dashboard can make a new one.
3. Restart Claude Code. The dashboard shows the teammate as connected once their plugin reaches the relay.

To install the plugin by hand:

```sh
claude plugin marketplace add ucazuga/pigeon
claude plugin install pigeon@pigeon
```

## Limits

- Questions and answers are plain text. No files, diffs or attachments.
- A team has up to 3 people, the owner included, and an owner has one team.
- One open question per thread at a time: a follow-up waits for the answer.
- Claude Code only. claude.ai on the web is not supported.
- Owners sign in with an email link. Members join with a single-use invite; there is no SSO.

## Privacy and safety

- No answer is sent without approval. Claude Code asks the person answering to confirm every answer before it leaves
  their machine.
- Answers are drafted by a separate Claude that can only read and search files. It cannot run commands, reach the
  network or use other tools, and `.env` files, keys and common credential folders are blocked.
- Questions from teammates are treated as untrusted input. Notifications say only who asked; the question itself
  appears when you open your inbox.
- The plugin is a handful of short shell scripts in [`plugins/pigeon`](plugins/pigeon). Read them before you install.

See [SECURITY.md](SECURITY.md) to report a vulnerability.

## Self-hosting

The relay is a Cloudflare Worker. Create a D1 database, set its ID in
[`apps/relay/wrangler.jsonc`](apps/relay/wrangler.jsonc), and deploy [`apps/relay`](apps/relay) to your own account:

```sh
cd apps/relay
wrangler d1 migrations apply pigeon --remote
wrangler deploy
wrangler secret put PUBLIC_URL            # e.g. https://pigeon.example.com
wrangler secret put SESSION_SIGNING_KEY   # at least 32 random characters
```

Invites from your relay tell each teammate's Claude to set `PIGEON_RELAY_URL`, which points the plugin at your relay.
Your team's questions and answers then stay on your infrastructure.

## Development

| Path | What it is |
| --- | --- |
| [`apps/relay`](apps/relay) | Cloudflare Worker: MCP server, dashboard, setup flow |
| [`plugins/pigeon`](plugins/pigeon) | Claude Code plugin |
| [`tests`](tests) | Tests for the plugin scripts |

```sh
bun install
bun run typecheck && bun run lint && bun run test
```

The relay's tests are integration tests: they run the real Worker, D1 and Durable Object in workerd and talk to it over
HTTP and MCP. `bun run --filter @pigeon/relay test:mutation` runs Stryker to find rules no test would notice breaking.

To run the relay locally:

```sh
cd apps/relay
cp .dev.vars.example .dev.vars
bun run db:migrate:local
bun run dev
```

Terms used in the code are defined in [CONTEXT.md](CONTEXT.md). See [CONTRIBUTING.md](CONTRIBUTING.md) before opening
a pull request.

## License

The plugin in [`plugins/pigeon`](plugins/pigeon) is [MIT](plugins/pigeon/LICENSE). Everything else is
[AGPL-3.0](LICENSE).
