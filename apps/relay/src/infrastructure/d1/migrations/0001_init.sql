-- Accounts and onboarding live in D1; live conversation state lives in each team's Durable Object.

CREATE TABLE owners (
	owner_id TEXT PRIMARY KEY,
	email TEXT NOT NULL UNIQUE,
	created_at TEXT NOT NULL
);

-- Magic-link tokens are stored hashed and consumed exactly once.
CREATE TABLE login_links (
	token_hash TEXT PRIMARY KEY,
	email TEXT NOT NULL,
	expires_at TEXT NOT NULL,
	consumed_at TEXT
);

CREATE TABLE teams (
	team_id TEXT PRIMARY KEY,
	owner_id TEXT NOT NULL REFERENCES owners (owner_id),
	name TEXT NOT NULL,
	created_at TEXT NOT NULL
);

-- One row per invite; `status` mirrors Invite['status'] in teams/team.service.ts.
-- Claiming must be a conditional update (`... WHERE invite_code_hash = ? AND status = 'pending'`) so two
-- concurrent joins cannot both succeed.
CREATE TABLE invites (
	invite_code_hash TEXT PRIMARY KEY,
	team_id TEXT NOT NULL REFERENCES teams (team_id),
	handle TEXT NOT NULL,
	status TEXT NOT NULL CHECK (status IN ('pending', 'claimed', 'connected', 'revoked')),
	member_id TEXT,
	created_at TEXT NOT NULL,
	expires_at TEXT NOT NULL,
	claimed_at TEXT,
	connected_at TEXT,
	revoked_at TEXT
);

-- A handle is taken only while its invite is not revoked, so a revoked handle can be invited again.
CREATE UNIQUE INDEX invites_active_handle ON invites (team_id, handle) WHERE status != 'revoked';

-- Member tokens are stored hashed; the member's machine holds the only plaintext copy.
-- Authentication must ignore revoked members (`revoked_at IS NULL`).
CREATE TABLE members (
	member_id TEXT PRIMARY KEY,
	team_id TEXT NOT NULL REFERENCES teams (team_id),
	handle TEXT NOT NULL,
	token_hash TEXT NOT NULL UNIQUE,
	created_at TEXT NOT NULL,
	revoked_at TEXT
);

CREATE UNIQUE INDEX members_active_handle ON members (team_id, handle) WHERE revoked_at IS NULL;
