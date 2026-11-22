import type { OwnerSession } from '../accounts/owner-login.service';
import type { Invite } from '../teams/invite';
import type { TeamOverview } from '../teams/team.service';
import { Layout } from './layout';

type InviteState = Invite['status'] | 'expired';

const STATUS_LABEL: Readonly<Record<InviteState, string>> = {
	pending: 'Waiting for their agent',
	claimed: 'Setting up',
	connected: 'Connected',
	revoked: 'Revoked',
	expired: 'Invite expired',
};

function state_of(invite: Invite): InviteState {
	if (invite.status === 'pending' && invite.expires_at.getTime() <= Date.now()) {
		return 'expired';
	}

	return invite.status;
}

function Header(props: { readonly owner: OwnerSession }) {
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

function TeamCard(props: { readonly team: TeamOverview }) {
	const invites = props.team.invites.filter((invite) => invite.status !== 'revoked');

	return (
		<section class="card">
			<h2>{props.team.name}</h2>
			<form method="post" action={`/dashboard/teams/${props.team.team_id}/invites`} class="inline">
				<input type="text" name="handle" placeholder="teammate handle, e.g. ahmet" required />
				<button type="submit">Invite</button>
			</form>
			{invites.length === 0 && <p class="muted">No teammates yet. Invite someone by the handle they will use.</p>}
			{invites.length > 0 && (
				<table>
					<tbody>
						{invites.map((invite) => {
							const state = state_of(invite);

							return (
								<tr>
									<td>@{invite.handle}</td>
									<td>
										<span class={`status ${state}`}>{STATUS_LABEL[state]}</span>
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

/**
 * The owner's dashboard: their teams, invites and a form to create a team.
 *
 * @param props - The owner, their teams and an error from the last action, if any.
 * @returns The page.
 */
export function DashboardPage(props: {
	readonly owner: OwnerSession;
	readonly teams: ReadonlyArray<TeamOverview>;
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
				<section class="card">
					<h2>Create a team</h2>
					<form method="post" action="/dashboard/teams" class="inline">
						<input type="text" name="name" placeholder="Team name" required maxlength={60} />
						<button type="submit">Create</button>
					</form>
				</section>
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
const labels = { claimed: 'Their agent is setting things up…', connected: 'Connected. @' + status.dataset.handle + ' is in.' };
async function poll() {
	const response = await fetch(status.dataset.url, { headers: { accept: 'application/json' } });
	if (response.ok) {
		const invites = await response.json();
		const invite = invites.find((item) => item.handle === status.dataset.handle);
		if (invite && labels[invite.status]) {
			status.textContent = labels[invite.status];
			if (invite.status === 'connected') {
				return;
			}
		}
	}
	setTimeout(poll, 3000);
}
poll();
`;

/**
 * Shown once after inviting a teammate: the setup prompt to hand over, and live progress of their agent.
 *
 * @param props - The team, the invited handle and the setup prompt (contains the one-time invite code).
 * @returns The page.
 */
export function InviteCreatedPage(props: {
	readonly owner: OwnerSession;
	readonly team_id: string;
	readonly team_name: string;
	readonly handle: string;
	readonly prompt: string;
}) {
	return (
		<Layout title="Invite · Pigeon">
			<main class="page">
				<Header owner={props.owner} />
				<section class="card">
					<h2>
						Invite @{props.handle} to {props.team_name}
					</h2>
					<p class="muted">
						Send this to @{props.handle}. They paste it into Claude Code, and their agent sets everything up. It works
						once, for 7 days, and is shown only now.
					</p>
					<pre class="prompt" id="prompt">
						{props.prompt}
					</pre>
					<p>
						<button type="button" id="copy">
							Copy
						</button>
					</p>
					<p id="status" data-url={`/dashboard/teams/${props.team_id}/invites`} data-handle={props.handle}>
						Waiting for their agent to pick up the prompt…
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
