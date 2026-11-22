# ADR 0002: Autopilot answers from repositories the answerer chose

Status: proposed (2026-11-23)

## Context

Pigeon replaces "can we hop on a call?" with a question to a teammate's Claude. Today a human approves every answer.
That is the right default, but for routine questions ("which service owns the webhook?") the approval step makes the
answerer the bottleneck again, which is the problem Pigeon exists to remove.

## Decision

An answerer can turn on **autopilot**. Their Claude then answers some questions without asking them first.

- **The answerer opts in, never the asker.** What gets shared comes from the answerer's repositories, so only they can
  allow it. They can also limit autopilot to certain teammates (`from avni`). Questions from anyone else go to the
  inbox as before.
- **Repositories are an explicit list.** `/pigeon:autopilot` looks for git repositories under the home directory,
  the answerer picks which ones to include, and Claude writes a one-line description of each from its README. The list
  is stored in `~/.pigeon/autopilot` and never sent to the relay.
- **One drafting session sees every chosen repository.** The drafter runs in the first repository with `--add-dir` for
  the others, the descriptions in its system prompt, and the same lock-down as `pigeon-draft`: read-only, in-repo
  reads only, secret files denied, and a spend cap. It decides which repository to read, so there is no separate
  routing step.
- **When in doubt, a human answers.** The drafter returns `NEEDS_HUMAN` when it is unsure or the question is outside
  the chosen repositories. The answer is also held back when it matches a token or key pattern (`AKIA`, `ghp_`, `sk-`,
  `xox`, `-----BEGIN`). In both cases the question stays in the inbox.
- **It runs only while Claude is open.** A SessionStart hook starts `pigeon-autopilot`, which exits when the Claude
  session that started it exits. The plugin monitor can't be used, because Claude Desktop does not run plugin
  monitors. With several sessions open, a per-question lock file makes sure only one of them drafts.
- **Auto answers are labelled.** The relay accepts them on `POST /api/threads/:id/auto-answer`, only for the member
  the question was sent to and only while it awaits an answer. It stores `approval: 'auto'` on the message, as
  opposed to `'human'`. The asker's tools say the answer was not reviewed. The answerer's prompt hook tells them what
  autopilot answered, and `/pigeon:inbox` shows the text.

## Considered options

- **Use the repository of whichever session is open.** This needs no setup. It was rejected because, with two
  sessions in different repositories, which one answers would be arbitrary, and a session opened in a personal
  project would answer too.
- **A routing call to pick one repository, then a draft.** This adds a second Claude call and a second place to be
  wrong. `--add-dir` gives the drafter the same choice inside one session.
- **A LaunchAgent or daemon that runs while Claude is closed.** Deferred. Not needed for now, and it would break the
  "nothing runs in the background" promise.
- **An answerer in the cloud with a copy of the code.** Rejected. Code would have to leave the answerer's machine, which
  changes the trust model.
- **Let the asker request an automatic answer.** Rejected, because the asker doesn't own what is being shared.

## Consequences

- "Every answer is approved by a human" is no longer true for members who turn autopilot on. README, CONTEXT.md and
  the marketing claims must say "unless autopilot is on" once this ships.
- Anything in the chosen repositories can reach a teammate without review, including through a question written to
  extract it. The limits are the chosen repositories, the deny rules and the pattern check. A team has at most three
  people, but the setup skill must say this plainly.
- Each auto answer uses the answerer's Claude usage, capped by `PIGEON_DRAFT_BUDGET_USD`.
- Autopilot only works in Claude Desktop if Desktop runs plugin hooks. This is not verified yet (see the 0.4.0 prompt
  hook).
