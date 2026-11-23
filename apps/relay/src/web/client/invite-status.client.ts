/** One invite's handle and onboarding status, as `GET /dashboard/teams/:team_id/invites` returns them, newest first. */
export type InviteStatus = { readonly handle: string; readonly status: string };

/** Statuses that no longer change by themselves, so there is nothing left to poll for. */
export const SETTLED_STATUSES: ReadonlyArray<string> = ['connected', 'expired', 'revoked'];

const POLL_INTERVAL_MS = 3000;

async function fetch_statuses(url: string): Promise<ReadonlyArray<InviteStatus> | null> {
	try {
		const response = await fetch(url, { headers: { accept: 'application/json' } });

		if (response.ok === false) {
			return null;
		}

		return await response.json();
	} catch {
		// Offline, or the session ended and the response is the sign-in page: try again next round.
		return null;
	}
}

/**
 * Poll a team's invite statuses until `on_statuses` says to stop. Rounds are skipped while the tab is hidden, and a failed request is tried again next round.
 *
 * @param on_statuses - Called with every response; returns whether to keep polling.
 */
export function poll_invite_statuses(url: string, on_statuses: (statuses: ReadonlyArray<InviteStatus>) => boolean): void {
	async function poll_round() {
		let keep_polling = true;

		if (document.visibilityState === 'visible') {
			const statuses = await fetch_statuses(url);

			if (statuses) {
				keep_polling = on_statuses(statuses);
			}
		}

		if (keep_polling) {
			window.setTimeout(poll_round, POLL_INTERVAL_MS);
		}
	}

	window.setTimeout(poll_round, POLL_INTERVAL_MS);
}

/** The newest status of one handle's invite. Returns the status, or null when the team has no invite for that handle. */
export function status_of(statuses: ReadonlyArray<InviteStatus>, handle: string): string | null {
	const invite_status = statuses.find((candidate) => candidate.handle === handle) ?? null;

	if (invite_status === null) {
		return null;
	}

	return invite_status.status;
}
