-- Threads and their messages. Turn-taking rules live in threads/thread.service.ts; every state change is a conditional
-- UPDATE on (status, current_message), so two concurrent replies cannot both succeed.

CREATE TABLE threads (
	thread_id TEXT PRIMARY KEY,
	team_id TEXT NOT NULL REFERENCES teams (team_id),
	asker TEXT NOT NULL REFERENCES members (member_id),
	answerer TEXT NOT NULL REFERENCES members (member_id),
	status TEXT NOT NULL CHECK (status IN ('awaiting_answer', 'answered', 'declined')),
	-- The open question, the last answer or the declined question, depending on status.
	current_message TEXT NOT NULL,
	created_at TEXT NOT NULL,
	updated_at TEXT NOT NULL
);

CREATE INDEX threads_answerer_status ON threads (answerer, status);
CREATE INDEX threads_asker ON threads (asker);

CREATE TABLE messages (
	message_id TEXT PRIMARY KEY,
	thread_id TEXT NOT NULL REFERENCES threads (thread_id),
	sender TEXT NOT NULL REFERENCES members (member_id),
	kind TEXT NOT NULL CHECK (kind IN ('question', 'answer', 'decline')),
	-- Null for declines.
	body TEXT,
	in_reply_to TEXT,
	sent_at TEXT NOT NULL
);

CREATE INDEX messages_thread ON messages (thread_id, sent_at);
