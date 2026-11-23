import { describe, expect, test } from 'vitest';
import { dashboard_page, form_error, new_team, submit_form } from './client';

describe('teams', () => {
	test('should let an owner have only one team', async () => {
		// given
		const team = await new_team();

		// when
		const second_team = await submit_form('/dashboard/teams', { name: 'Second', handle: 'boss' }, team.owner);

		// then
		expect(form_error(second_team)).toBe('You already have a team. One team per owner for now.');
		expect(await dashboard_page(team.owner)).not.toContain('Second');
	});
});
