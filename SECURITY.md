# Security

Pigeon carries questions and answers between people's coding agents, so security reports are our top priority.

## Reporting a vulnerability

Please do **not** open a public issue. Use GitHub's private vulnerability reporting
(Security → Report a vulnerability) on this repository. We aim to acknowledge reports within 3 working days.

## What runs where

- **On a member's machine:** the plugin in `plugins/pigeon/` (shell scripts and markdown).
- **On the relay:** `apps/relay/` (Cloudflare Worker). It stores team membership and thread messages.

## Security properties

- No answer leaves a member's machine without a human approving the exact text
  (`send_answer` is marked `anthropic/requiresUserInteraction`, so Claude Code prompts on every call).
- Notifications from the inbox monitor contain only who asked, never message text.
- The drafting session (`pigeon-draft`) gets only Read, Grep and Glob, runs in `dontAsk` mode with no allow rules
  (so only reads inside the chosen repository succeed), ignores the repository's own settings and hooks, loads no
  MCP servers or plugins, has `.env` files, keys and common credential folders denied, and a per-draft spend cap.
  It fetches the question itself and receives it on stdin, never as a command-line argument.
- The member token is sent only to the relay it was issued by, is stored hashed on the relay, written locally with
  mode 600, and never printed. Owners can revoke members.

## Known limitations

- The person answering sees the question in their own Claude session when they open `/pigeon:inbox`. That session has
  their normal permissions; treat question text as untrusted.
- Asking a question does not require approval. A compromised asking session could send local context to a teammate.
- `pigeon-draft` still loads the user's own Claude Code settings (needed for authentication). Broad allow rules or
  additional directories there widen what the drafting session can read.

A report that breaks any of these is in scope.
