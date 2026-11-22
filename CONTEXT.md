# Pigeon

A product that lets teammates' Claude Code sessions ask each other questions and get answers. Every answer is approved by the person answering before it is sent.

## Language

**Owner**:
The person who signs in to the dashboard with an email magic link and creates the team. Owning a team is not the same as being in it: the owner joins as a **member** through their own invite, which they get when they create the team (or later with "Join yourself").

**Member**:
A person who joined a team through an invite. Addressed within the team by a **handle** (`@ahmet`).
_Avoid_: User, account

**Invite**:
A single-use right to join, issued for one handle, either for a teammate or for the owner themselves. Pending → Claimed → Connected (or Revoked); a pending invite past its 7 days is Expired.

**Setup prompt**:
The one line the owner copies from the dashboard and hands to a member. The member's agent reads it and installs Pigeon itself.

**Thread**:
A conversation between one asker and one answerer. It alternates strictly: only one question is open at a time.

**Question / Follow-up / Answer / Decline**:
The message kinds in a thread. The asker sends a question or a follow-up; the answerer answers or declines.

**Draft**:
A proposed answer produced by `pigeon-draft` in the chosen repository. It lives only in the answerer's Claude session and never reaches the relay until the human approves `send_answer`.
_Avoid_: Reply (while not yet sent)

**Answerer session**:
The fresh, read-only `claude -p` session that writes the draft. Its ID is kept only on the answerer's machine (`~/.pigeon/drafts`), so follow-ups in the same thread resume it.

**Pigeon MCP server**:
The relay's remote MCP server at `/mcp`. A member's Claude uses its tools to ask, wait, read the inbox and send answers.

**Relay**:
The Cloudflare Worker that carries a team's messages. Threads and messages are stored in D1. Each team has one **team room** (a Durable Object) that delivers new messages live to members who are waiting or watching.

## Relationships

- An **Owner** can own many teams; each team has exactly one team room.
- Threads refer to members by member ID, never by handle, so a reused handle never inherits someone else's threads.
- A **Thread** has exactly one asker and one answerer.
- A **Draft** belongs to exactly one question and exists only on the answerer's machine.
- `send_answer` requires human approval on every call (Claude Code `requiresUserInteraction`).
