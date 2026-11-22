import { describe, expect, test } from 'bun:test';
import { PigeonError } from '../pigeon-error';
import * as Invite from './invite';

const HOUR = 60 * 60 * 1000;

function pending_invite(expires_in: number): Invite.Invite {
	return {
		status: 'pending',
		team_id: 'team-1',
		handle: 'ahmet',
		created_at: new Date(),
		expires_at: new Date(Date.now() + expires_in),
	};
}

function error_code(action: () => unknown): string | null {
	try {
		action();
	} catch (error) {
		if (error instanceof PigeonError) {
			return error.code;
		}

		throw error;
	}

	return null;
}

describe('invite lifecycle', () => {
	test('a pending invite is claimed once, then connects', () => {
		const claimed = Invite.claim(pending_invite(HOUR), 'member-1');
		const connected = Invite.mark_connected(claimed);

		expect(connected).toMatchObject({ status: 'connected', member_id: 'member-1' });
		expect(error_code(() => Invite.claim(claimed, 'member-2'))).toBe('conflict');
	});

	test('an expired invite cannot be claimed', () => {
		expect(error_code(() => Invite.claim(pending_invite(-HOUR), 'member-1'))).toBe('conflict');
	});

	test('revoking a joined member keeps their id so their token can be revoked too', () => {
		const connected = Invite.mark_connected(Invite.claim(pending_invite(HOUR), 'member-1'));

		expect(Invite.revoke(connected)).toMatchObject({ status: 'revoked', member_id: 'member-1' });
		expect(Invite.revoke(pending_invite(HOUR))).toMatchObject({ status: 'revoked', member_id: null });
	});
});
