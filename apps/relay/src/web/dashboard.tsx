import type { Owner } from '../auth/owner.service';
import type { Invite, Invitee, TeamOverview } from '../teams/team.service';
import { Layout } from './layout';

const STATUS_LABEL: Readonly<Record<Invite['status'], string>> = {
	pending: 'Waiting for their agent',
	claimed: 'Setting up',
	connected: 'Connected',
	revoked: 'Revoked',
	expired: 'Invite expired',
};

function Header(props: { readonly owner: Owner }) {
	return (
		<div class="top">
			<img src="/pigeon-mark.svg" alt="" />
			<span class="grow">Pigeon</span>
			<span class="muted">{props.owner.email}</span>
			<form method="post" action="/logout">
				<button type="submit" class="quiet">
					Sign out
				</button>
			</form>
		</div>
	);
}

function JoinYourself(props: { readonly team_id: string }) {
	return (
		<div class="notice">
			<p>
				<strong>You are not in this team yet.</strong> To ask and answer from your own Claude Code, join it with the
				handle you will use.
			</p>
			<form method="post" action={`/dashboard/teams/${props.team_id}/invites`} class="inline">
				<input type="hidden" name="invitee" value="owner" />
				<input type="text" name="handle" placeholder="your handle, e.g. avni" required />
				<button type="submit">Join yourself</button>
			</form>
		</div>
	);
}

function TeamCard(props: { readonly team: TeamOverview }) {
	const invites = props.team.invites.filter((invite) => invite.status !== 'revoked');

	return (
		<section class="card">
			<h2>{props.team.name}</h2>
			{props.team.owner_invite === null && <JoinYourself team_id={props.team.team_id} />}
			{props.team.can_invite_teammate && (
				<form method="post" action={`/dashboard/teams/${props.team.team_id}/invites`} class="inline">
					<input type="text" name="handle" placeholder="teammate handle, e.g. ahmet" required />
					<button type="submit">Invite</button>
				</form>
			)}
			{props.team.can_invite_teammate === false && (
				<p class="muted">This team is full: up to 3 people, you included. Remove someone to invite another teammate.</p>
			)}
			{invites.length === 0 && <p class="muted">No teammates yet. Invite someone by the handle they will use.</p>}
			{invites.length > 0 && (
				<table>
					<tbody>
						{invites.map((invite) => {
							return (
								<tr>
									<td>
										@{invite.handle}
										{invite.invitee === 'owner' && <span class="muted"> (you)</span>}
									</td>
									<td>
										<span class={`status ${invite.status}`}>{STATUS_LABEL[invite.status]}</span>
									</td>
									<td style="text-align: right;">
										<form
											method="post"
											action={`/dashboard/teams/${props.team.team_id}/members/${invite.handle}/revoke`}
										>
											<button type="submit" class="quiet">
												Remove
											</button>
										</form>
									</td>
								</tr>
							);
						})}
					</tbody>
				</table>
			)}
		</section>
	);
}

function CreateTeam() {
	return (
		<section class="card">
			<h2>Create a team</h2>
			<p class="muted">You join it too: next you get a prompt to set Pigeon up in your own Claude Code.</p>
			<form method="post" action="/dashboard/teams" class="inline">
				<input type="text" name="name" placeholder="Team name" required maxlength={60} />
				<input type="text" name="handle" placeholder="Your handle, e.g. avni" required />
				<button type="submit">Create</button>
			</form>
		</section>
	);
}

/**
 * The owner's dashboard: their teams, invites and, while they may create one, a form to create a team.
 *
 * @param props - The owner, their teams, whether they may create a team and an error from the last action, if any.
 * @returns The page.
 */
export function DashboardPage(props: {
	readonly owner: Owner;
	readonly teams: ReadonlyArray<TeamOverview>;
	readonly can_create_team: boolean;
	readonly error: string | null;
}) {
	return (
		<Layout title="Dashboard · Pigeon">
			<main class="page">
				<Header owner={props.owner} />
				{props.error && <p class="error">{props.error}</p>}
				{props.teams.map((team) => (
					<TeamCard team={team} />
				))}
				{props.can_create_team && <CreateTeam />}
			</main>
		</Layout>
	);
}

const WATCH_SCRIPT = `
const status = document.getElementById('status');
const copy = document.getElementById('copy');
copy.addEventListener('click', async () => {
	await navigator.clipboard.writeText(document.getElementById('prompt').textContent);
	copy.textContent = 'Copied';
});
const labels = { claimed: status.dataset.claimed, connected: status.dataset.connected, expired: status.dataset.expired };
const final_states = ['connected', 'expired'];
async function poll() {
	const response = await fetch(status.dataset.url, { headers: { accept: 'application/json' } });
	if (response.ok) {
		const invites = await response.json();
		const invite = invites.find((item) => item.handle === status.dataset.handle);
		if (invite && labels[invite.status]) {
			status.textContent = labels[invite.status];
			if (final_states.includes(invite.status)) {
				return;
			}
		}
	}
	setTimeout(poll, 3000);
}
poll();
`;

/** What the invite page says, depending on whether the owner invited a teammate or themselves. */
function invite_copy(invitee: Invitee, handle: string, team_name: string) {
	if (invitee === 'owner') {
		return {
			title: `Set up Pigeon on your machine`,
			instructions: `Paste this into your own Claude Code. Your agent sets everything up and joins ${team_name} as @${handle}. It works once, for 7 days, and is shown only now.`,
			waiting: 'Waiting for your agent to pick up the prompt…',
			claimed: 'Your agent is setting things up…',
			connected: `Connected. You are in ${team_name} as @${handle}.`,
			expired: 'This invite expired. Join again from the dashboard for a new prompt.',
		};
	}

	return {
		title: `Invite @${handle} to ${team_name}`,
		instructions: `Send this to @${handle}. They paste it into Claude Code, and their agent sets everything up. It works once, for 7 days, and is shown only now.`,
		waiting: 'Waiting for their agent to pick up the prompt…',
		claimed: 'Their agent is setting things up…',
		connected: `Connected. @${handle} is in.`,
		expired: 'This invite expired. Invite them again for a new prompt.',
	};
}

/**
 * Shown once after an invite is created: the setup prompt, and live progress of the agent that uses it. For the
 * owner's own invite (after creating a team, or "join yourself"), it tells the owner to run it themselves.
 *
 * @param props - The team, the invited handle, who the invite is for and the setup prompt (contains the one-time
 *   invite code).
 * @returns The page.
 */
export function InviteCreatedPage(props: {
	readonly owner: Owner;
	readonly team_id: string;
	readonly team_name: string;
	readonly handle: string;
	readonly invitee: Invitee;
	readonly prompt: string;
}) {
	const copy = invite_copy(props.invitee, props.handle, props.team_name);

	return (
		<Layout title="Invite · Pigeon">
			<main class="page">
				<Header owner={props.owner} />
				<section class="card">
					<h2>{copy.title}</h2>
					<p class="muted">{copy.instructions}</p>
					<pre class="prompt" id="prompt">
						{props.prompt}
					</pre>
					<p>
						<button type="button" id="copy">
							Copy
						</button>
					</p>
					<p
						id="status"
						data-url={`/dashboard/teams/${props.team_id}/invites`}
						data-handle={props.handle}
						data-claimed={copy.claimed}
						data-connected={copy.connected}
						data-expired={copy.expired}
					>
						{copy.waiting}
					</p>
					<p>
						<a href="/dashboard">Back to dashboard</a>
					</p>
				</section>
				<script dangerouslySetInnerHTML={{ __html: WATCH_SCRIPT }} />
			</main>
		</Layout>
	);
}
