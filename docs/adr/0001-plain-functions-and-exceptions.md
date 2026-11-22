# ADR 0001: Plain functions, one error class, no DI

Status: accepted (2026-11-22)

## Decision

Pigeon's relay is written as plain modules of functions:

- **Errors are thrown.** Expected failures throw `PigeonError(code, message)` with one of six codes
  (`invalid_input`, `unauthorized`, `forbidden`, `not_found`, `conflict`, `unavailable`). There is no `Result` type and
  no per-failure error classes. `infrastructure/http/error.handler.ts` is the only place that maps codes to HTTP status.
- **No dependency injection.** Modules import Worker bindings directly with `import { env } from 'cloudflare:workers'`.
  There are no ports, adapters or service classes.
- **Classes only where the platform needs one:** `TeamRoom` (Durable Object) and `PigeonError` (`instanceof`).
  Everything else is functions and plain objects.
- **IDs are plain strings.** Input is checked with Zod schemas at the boundary; there are no branded ID types.
- **No `_tag` fields.** Unions are discriminated by a field named for what it means: `status` for lifecycles
  (threads, invites), `type` for events and commands.

## Why

The product is small and the team prefers code that reads top to bottom. The ceremony of errors-as-values, ports and
branded types cost more than it protected here. This deliberately departs from the generic coding standard; do not
reintroduce those patterns without revisiting this ADR.

## What we keep

State rules live in the service that writes the state: turn-taking checks in `threads/thread.service.ts`, invite
claims in `teams/team.service.ts`. Conditional SQL updates (`WHERE status = ...`) are what actually enforce them, so a
separate pure state module would only repeat the SQL. `redact()` stays so tokens never reach logs.
