import { type Context, Hono } from 'hono';
import * as zod from 'zod';
import { read_config } from '../infrastructure/config/config';
import { type OwnerVariables, require_owner } from '../infrastructure/http/owner-session.middleware';
import { validate } from '../infrastructure/http/validate';
import { PigeonError } from '../pigeon-error';
import { render_setup_prompt } from '../setup/setup-guide';
import { DashboardPage, InviteCreatedPage } from '../web/dashboard';
import { MEMBER_HANDLE } from './team.schema';
import * as team_service from './team.service';

function dashboard_with_error(message: string): string {
	return `/dashboard?error=${encodeURIComponent(message)}`;
}

/** Redirect back to the dashboard with a message, for expected failures of a form action. */
function back_with_error(error: unknown): string {
	if (error instanceof PigeonError) {
		return dashboard_with_error(error.message);
	}

	throw error;
}

/** A form that did not parse goes back to the dashboard with the reason. */
function back_with_invalid_input(error: zod.core.$ZodError, context: Context): Response {
	return context.redirect(dashboard_with_error(error.issues.map((issue) => issue.message).join('; ')));
}

/**
 * The owner dashboard. Every route requires a signed owner session.
 *
 * - `GET  /dashboard`                                  teams, invites and their states
 * - `POST /dashboard/teams`                            create a team and the owner's invite; shows their prompt
 * - `POST /dashboard/teams/:team_id/invites`           invite a teammate or the owner; shows the setup prompt once
 * - `GET  /dashboard/teams/:team_id/invites`           invite states as JSON, polled by the invite page
 * - `POST /dashboard/teams/:team_id/members/:handle/prompt`  a new setup prompt for an unused invite
 * - `POST /dashboard/teams/:team_id/members/:handle/revoke`  remove a teammate
 */
export const dashboard_routes = new Hono<{ Variables: OwnerVariables }>()
	.use('/dashboard', require_owner)
	.use('/dashboard/*', require_owner)
	.get('/dashboard', async (context) => {
		const owner = context.get('owner');
		const teams = await team_service.list_owned(owner);
		const error = context.req.query('error') ?? null;

		return context.html(
			<DashboardPage owner={owner} teams={teams} can_create_team={team_service.can_create(teams)} error={error} />,
		);
	})
	.post(
		'/dashboard/teams',
		validate(
			'form',
			zod.object({ name: zod.string().trim().min(1).max(60), handle: MEMBER_HANDLE }),
			back_with_invalid_input,
		),
		async (context) => {
			const owner = context.get('owner');
			const { name, handle } = context.req.valid('form');

			try {
				const team = await team_service.create(owner, name, handle);

				return context.html(
					<InviteCreatedPage
						owner={owner}
						team_id={team.team_id}
						team_name={name}
						handle={handle}
						invitee="owner"
						earlier_prompt="none"
						prompt={render_setup_prompt(read_config().public_url.origin, team.invite_code.unwrap())}
					/>,
				);
			} catch (error) {
				return context.redirect(back_with_error(error));
			}
		},
	)
	.post(
		'/dashboard/teams/:team_id/invites',
		validate(
			'form',
			zod.object({ handle: MEMBER_HANDLE, invitee: zod.enum(['owner', 'teammate']).default('teammate') }),
			back_with_invalid_input,
		),
		async (context) => {
			const owner = context.get('owner');
			const team_id = context.req.param('team_id');
			const { handle, invitee } = context.req.valid('form');

			try {
				const invite = await team_service.invite_member(owner, team_id, handle, invitee);

				return context.html(
					<InviteCreatedPage
						owner={owner}
						team_id={team_id}
						team_name={invite.team_name}
						handle={handle}
						invitee={invitee}
						earlier_prompt="none"
						prompt={render_setup_prompt(read_config().public_url.origin, invite.invite_code.unwrap())}
					/>,
				);
			} catch (error) {
				return context.redirect(back_with_error(error));
			}
		},
	)
	.get('/dashboard/teams/:team_id/invites', async (context) => {
		const team = await team_service.find_owned(context.get('owner'), context.req.param('team_id'));

		return context.json(team.invites.map((invite) => ({ handle: invite.handle, status: invite.status })));
	})
	.post(
		'/dashboard/teams/:team_id/members/:handle/prompt',
		validate('param', zod.object({ team_id: zod.string().min(1), handle: MEMBER_HANDLE }), back_with_invalid_input),
		async (context) => {
			const owner = context.get('owner');
			const { team_id, handle } = context.req.valid('param');

			try {
				const invite = await team_service.reissue_invite(owner, team_id, handle);

				return context.html(
					<InviteCreatedPage
						owner={owner}
						team_id={team_id}
						team_name={invite.team_name}
						handle={handle}
						invitee={invite.invitee}
						earlier_prompt="replaced"
						prompt={render_setup_prompt(read_config().public_url.origin, invite.invite_code.unwrap())}
					/>,
				);
			} catch (error) {
				return context.redirect(back_with_error(error));
			}
		},
	)
	.post(
		'/dashboard/teams/:team_id/members/:handle/revoke',
		validate('param', zod.object({ team_id: zod.string().min(1), handle: MEMBER_HANDLE }), back_with_invalid_input),
		async (context) => {
			const { team_id, handle } = context.req.valid('param');

			try {
				await team_service.revoke_member(context.get('owner'), team_id, handle);
			} catch (error) {
				return context.redirect(back_with_error(error));
			}

			return context.redirect('/dashboard');
		},
	);
