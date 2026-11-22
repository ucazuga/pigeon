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

/** A new setup prompt can be made only for an invite nobody has used yet. */
const PROMPT_ACTION: Readonly<Record<Invite['status'], string | null>> = {
	pending: 'New prompt',
	claimed: null,
	connected: null,
	revoked: null,
	expired: 'Renew',
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
				<button type="submit" data-pending="Joining…">
					Join yourself
				</button>
			</form>
		</div>
	);
}

function Seats(props: { readonly seats: TeamOverview['seats'] }) {
	const seat_numbers = Array.from({ length: props.seats.total }, (_, index) => index + 1);

	return (
		<span class="seats">
			<span class="seat-bar" aria-hidden="true">
				{seat_numbers.map((seat_number) => {
					let seat_class = '';

					if (seat_number <= props.seats.taken) {
						seat_class = 'taken';
					}

					return <span class={seat_class} />;
				})}
			</span>
			{props.seats.taken} of {props.seats.total} seats
		</span>
	);
}

function Person(props: { readonly team_id: string; readonly invite: Invite }) {
	const handle = props.invite.handle;

	return (
		<li class="person" data-handle={handle}>
			<span class="avatar" aria-hidden="true">
				{handle.slice(0, 1).toUpperCase()}
			</span>
			<span class="who">
				@{handle}
				{props.invite.invitee === 'owner' && <span class="you">you</span>}
			</span>
			<span class={`status ${props.invite.status}`} data-status={props.invite.status}>
				{STATUS_LABEL[props.invite.status]}
			</span>
			{PROMPT_ACTION[props.invite.status] && (
				<form method="post" action={`/dashboard/teams/${props.team_id}/members/${handle}/prompt`}>
					<button type="submit" class="quiet neutral" data-pending="…">
						{PROMPT_ACTION[props.invite.status]}
					</button>
				</form>
			)}
			<form method="post" action={`/dashboard/teams/${props.team_id}/members/${handle}/revoke`}>
				<button type="submit" class="quiet" data-confirm="Remove?">
					Remove
				</button>
			</form>
		</li>
	);
}

function TeamCard(props: { readonly team: TeamOverview }) {
	const team = props.team;

	return (
		<section
			class="card team"
			data-invites-url={`/dashboard/teams/${team.team_id}/invites`}
			data-labels={JSON.stringify(STATUS_LABEL)}
		>
			<div class="card-head">
				<h2>{team.name}</h2>
				<Seats seats={team.seats} />
			</div>
			{team.owner_invite === null && <JoinYourself team_id={team.team_id} />}
			{team.can_invite_teammate && (
				<form method="post" action={`/dashboard/teams/${team.team_id}/invites`} class="inline">
					<input type="text" name="handle" placeholder="teammate handle, e.g. ahmet" required />
					<button type="submit" data-pending="Inviting…">
						Invite
					</button>
				</form>
			)}
			{team.can_invite_teammate === false && (
				<p class="full muted">
					This team is full: up to {team.seats.total} people, you included. Remove someone to invite another teammate.
				</p>
			)}
			{team.people.length === 0 && (
				<p class="empty muted">No one here yet. Invite a teammate by the handle they will use.</p>
			)}
			{team.people.length > 0 && (
				<ul class="people">
					{team.people.map((invite) => {
						return <Person team_id={team.team_id} invite={invite} />;
					})}
				</ul>
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
				<button type="submit" data-pending="Creating…">
					Create
				</button>
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

/** What the invite page says, depending on whether the owner invited a teammate or themselves. */
function invite_copy(invitee: Invitee, handle: string, team_name: string) {
	if (invitee === 'owner') {
		return {
			title: 'Set up Pigeon on your machine',
			instructions: `Paste this into your Claude Code. Your agent does the rest and joins ${team_name} as @${handle}.`,
			waiting: 'Waiting for your agent…',
			claimed: 'Your agent is setting up Pigeon…',
			connected: `You are in ${team_name} as @${handle}.`,
			expired: 'This prompt expired. Get a new one from the dashboard.',
		};
	}

	return {
		title: `Invite @${handle}`,
		instructions: `Send this to @${handle}. They paste it into Claude Code, and their agent does the rest.`,
		waiting: `Waiting for @${handle}'s agent…`,
		claimed: `@${handle}'s agent is setting up Pigeon…`,
		connected: `@${handle} is in ${team_name}.`,
		expired: 'This prompt expired. Get a new one from the dashboard.',
	};
}

/**
 * Shown after an invite is created or renewed: the setup prompt to copy, and live progress of the agent that uses it.
 * For the owner's own invite (after creating a team, or "join yourself"), it tells the owner to run it themselves.
 *
 * @param props - The team, the invited handle, who the invite is for, whether it replaces an earlier prompt and the
 *   setup prompt (contains the one-time invite code).
 * @returns The page.
 */
export function InviteCreatedPage(props: {
	readonly owner: Owner;
	readonly team_id: string;
	readonly team_name: string;
	readonly handle: string;
	readonly invitee: Invitee;
	readonly earlier_prompt: 'none' | 'replaced';
	readonly prompt: string;
}) {
	const copy = invite_copy(props.invitee, props.handle, props.team_name);
	let fine_print = 'Works once and expires in 7 days. Lost it? Get a new one from the dashboard.';

	if (props.earlier_prompt === 'replaced') {
		fine_print = `New prompt: the earlier one for @${props.handle} no longer works. This one works once and expires in 7 days.`;
	}

	return (
		<Layout title="Invite · Pigeon">
			<main class="page">
				<Header owner={props.owner} />
				<a class="back" href="/dashboard">
					← {props.team_name}
				</a>
				<section
					class="card invite"
					data-invites-url={`/dashboard/teams/${props.team_id}/invites`}
					data-handle={props.handle}
					data-claimed={copy.claimed}
					data-connected={copy.connected}
					data-expired={copy.expired}
				>
					<h1>{copy.title}</h1>
					<p class="muted">{copy.instructions}</p>
					<div class="prompt-box">
						<code id="prompt">{props.prompt}</code>
						<button type="button" id="copy" data-copied="Copied ✓">
							Copy
						</button>
					</div>
					<p class="fine muted">{fine_print}</p>
					<div class="watch" data-status="pending" aria-live="polite">
						<span class="dot" aria-hidden="true" />
						<span id="status">{copy.waiting}</span>
						<a class="button" href="/dashboard" id="done" hidden>
							Done
						</a>
					</div>
				</section>
			</main>
		</Layout>
	);
}
