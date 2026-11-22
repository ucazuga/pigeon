import { Hono } from 'hono';
import * as zod from 'zod';
import { read_config } from '../infrastructure/config/config';
import { type OwnerVariables, require_owner } from '../infrastructure/http/owner-session.middleware';
import { MEMBER_HANDLE } from '../members/member.schema';
import { PigeonError } from '../pigeon-error';
import { render_setup_prompt } from '../setup/setup-guide';
import { create_team, invite_member, list_owned_teams, revoke_member } from '../teams/team.service';
import { DashboardPage, InviteCreatedPage } from '../web/dashboard';

const TEAM_FORM = zod.object({ name: zod.string().trim().min(1).max(60) });

const INVITE_FORM = zod.object({ handle: MEMBER_HANDLE });

/** Redirect back to the dashboard with a message, for expected failures of a form action. */
function back_with_error(error: unknown): string {
	if (error instanceof PigeonError) {
		return `/dashboard?error=${encodeURIComponent(error.message)}`;
	}

	if (error instanceof zod.ZodError) {
		return `/dashboard?error=${encodeURIComponent(error.issues.map((issue) => issue.message).join('; '))}`;
	}

	throw error;
}

/**
 * The owner dashboard. Every route requires a signed owner session.
 *
 * - `GET  /dashboard`                                  teams, invites and their states
 * - `POST /dashboard/teams`                            create a team
 * - `POST /dashboard/teams/:team_id/invites`           invite a handle; shows the setup prompt once
 * - `GET  /dashboard/teams/:team_id/invites`           invite states as JSON, polled by the invite page
 * - `POST /dashboard/teams/:team_id/members/:handle/revoke`  remove a teammate
 */
export const dashboard_routes = new Hono<{ Variables: OwnerVariables }>()
	.use('/dashboard', require_owner)
	.use('/dashboard/*', require_owner)
	.get('/dashboard', async (context) => {
		const owner = context.get('owner');
		const teams = await list_owned_teams(owner);

		return context.html(<DashboardPage owner={owner} teams={teams} error={context.req.query('error') ?? null} />);
	})
	.post('/dashboard/teams', async (context) => {
		try {
			const form = TEAM_FORM.parse(await context.req.parseBody());

			await create_team(context.get('owner'), form.name);
		} catch (error) {
			return context.redirect(back_with_error(error));
		}

		return context.redirect('/dashboard');
	})
	.post('/dashboard/teams/:team_id/invites', async (context) => {
		const owner = context.get('owner');
		const team_id = context.req.param('team_id');

		try {
			const form = INVITE_FORM.parse(await context.req.parseBody());
			const code = await invite_member(owner, team_id, form.handle);
			const teams = await list_owned_teams(owner);
			const team = teams.find((candidate) => candidate.team_id === team_id) ?? null;
			let team_name = '';

			if (team) {
				team_name = team.name;
			}

			return context.html(
				<InviteCreatedPage
					owner={owner}
					team_id={team_id}
					team_name={team_name}
					handle={form.handle}
					prompt={render_setup_prompt(read_config().public_url.origin, code.unwrap())}
				/>,
			);
		} catch (error) {
			return context.redirect(back_with_error(error));
		}
	})
	.get('/dashboard/teams/:team_id/invites', async (context) => {
		const teams = await list_owned_teams(context.get('owner'));
		const team = teams.find((candidate) => candidate.team_id === context.req.param('team_id')) ?? null;

		if (team === null) {
			throw new PigeonError('not_found', 'No such team');
		}

		return context.json(team.invites.map((invite) => ({ handle: invite.handle, status: invite.status })));
	})
	.post('/dashboard/teams/:team_id/members/:handle/revoke', async (context) => {
		try {
			await revoke_member(context.get('owner'), context.req.param('team_id'), context.req.param('handle'));
		} catch (error) {
			return context.redirect(back_with_error(error));
		}

		return context.redirect('/dashboard');
	});
