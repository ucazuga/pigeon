import { env } from 'cloudflare:workers';
import type { MiddlewareHandler } from 'hono';
import { PigeonError } from '../../pigeon-error';
import type { OwnedTeam } from '../../teams/team.schema';
import type { OwnerVariables } from './owner-session.middleware';

/** Hono variables set by {@link require_owned_team}, on top of the signed-in owner. */
export type OwnedTeamVariables = OwnerVariables & {
	/** The team named by `:team_id`, owned by the signed-in owner. */
	team: OwnedTeam;
};

/**
 * Hono middleware for routes under `/dashboard/teams/:team_id`: the team must belong to the signed-in owner, and is exposed as `team`. Runs after {@link require_owner}. Another
 * owner's team looks the same as a missing one. Throws `not_found` for an unknown or foreign team.
 */
export const require_owned_team: MiddlewareHandler<{ Variables: OwnedTeamVariables }> = async (context, next) => {
	const team = await env.DB.prepare('SELECT team_id, name FROM teams WHERE team_id = ? AND owner_id = ?')
		.bind(context.req.param('team_id'), context.get('owner').owner_id)
		.first<OwnedTeam>();

	if (team === null) {
		throw new PigeonError('not_found', 'No such team');
	}

	context.set('team', team);
	await next();
};
