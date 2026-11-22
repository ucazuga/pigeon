-- Who an invite is for: the team's owner joining their own team, or a teammate. The dashboard marks the owner's own
-- row and offers "join yourself" while the owner has no active invite. At most one active owner invite per team.
ALTER TABLE invites ADD COLUMN invitee TEXT NOT NULL DEFAULT 'teammate' CHECK (invitee IN ('owner', 'teammate'));

CREATE UNIQUE INDEX invites_active_owner ON invites (team_id) WHERE invitee = 'owner' AND status != 'revoked';
