import { pop, slide_out } from './animations.client';
import { poll_invite_statuses, SETTLED_STATUSES, status_of } from './invite-status.client';

/*
 * The dashboard's team cards: status badges that follow each agent live, and "Remove" that asks for a second click.
 * Without JavaScript the badges are as rendered and Remove works on one click.
 */

const CONFIRM_WINDOW_MS = 3000;

function badges_still_changing(card: HTMLElement): boolean {
	const badges = Array.from(card.querySelectorAll<HTMLElement>('.status'));

	return badges.some((badge) => {
		return SETTLED_STATUSES.includes(badge.dataset.status ?? '') === false;
	});
}

function show_status(badge: HTMLElement, status: string, label: string): void {
	badge.className = `status ${status}`;
	badge.dataset.status = status;
	badge.textContent = label;
	pop(badge);
}

/** "New prompt" only works while nobody has used the invite; once their agent has claimed it, the action goes. */
function drop_prompt_action_once_used(person: HTMLElement, status: string): void {
	const prompt_form = person.querySelector('form[action$="/prompt"]');

	if (prompt_form && (status === 'claimed' || status === 'connected')) {
		prompt_form.remove();
	}
}

function watch_statuses(card: HTMLElement): void {
	const url = card.dataset.invitesUrl ?? null;

	if (url === null || badges_still_changing(card) === false) {
		return;
	}

	const labels: Readonly<Record<string, string>> = JSON.parse(card.dataset.labels ?? '{}');

	poll_invite_statuses(url, (statuses) => {
		for (const person of card.querySelectorAll<HTMLElement>('.person')) {
			const status = status_of(statuses, person.dataset.handle ?? '');
			const badge = person.querySelector<HTMLElement>('.status');

			if (status && badge && badge.dataset.status !== status) {
				show_status(badge, status, labels[status] ?? status);
				drop_prompt_action_once_used(person, status);
			}
		}

		return badges_still_changing(card);
	});
}

async function remove_person(button: HTMLButtonElement): Promise<void> {
	const person = button.closest('.person');

	button.disabled = true;

	if (person) {
		await slide_out(person);
	}

	if (button.form) {
		button.form.submit();
	}
}

function confirm_before_removing(button: HTMLButtonElement): void {
	const idle_label = button.textContent ?? '';
	let disarm_timer = 0;

	button.addEventListener('click', (event) => {
		event.preventDefault();

		if (button.classList.contains('armed')) {
			window.clearTimeout(disarm_timer);
			void remove_person(button);

			return;
		}

		button.classList.add('armed');
		button.textContent = button.dataset.confirm ?? idle_label;
		pop(button);

		disarm_timer = window.setTimeout(() => {
			button.classList.remove('armed');
			button.textContent = idle_label;
		}, CONFIRM_WINDOW_MS);
	});
}

/** Start every team card on the current page. */
export function start_team_cards(): void {
	for (const card of document.querySelectorAll<HTMLElement>('.team')) {
		watch_statuses(card);

		for (const button of card.querySelectorAll<HTMLButtonElement>('button[data-confirm]')) {
			confirm_before_removing(button);
		}
	}
}
