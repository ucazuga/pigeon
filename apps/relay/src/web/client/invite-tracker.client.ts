import { fade_in, pop } from './animations.client';
import { poll_invite_statuses, SETTLED_STATUSES, status_of } from './invite-status.client';

/*
 * The invite page: copy the setup prompt (the button, or anywhere on the prompt box), then follow the agent that uses
 * it (pending → claimed → connected) until it connects or the invite expires.
 */

const COPIED_FOR_MS = 2000;

function copy_prompt_on_click(box: HTMLElement, button: HTMLButtonElement, prompt: Element): void {
	const idle_label = button.textContent ?? '';
	let reset_timer = 0;

	box.addEventListener('click', async () => {
		await navigator.clipboard.writeText(prompt.textContent ?? '');

		window.clearTimeout(reset_timer);
		button.classList.add('copied');
		button.textContent = button.dataset.copied ?? idle_label;
		pop(button);

		reset_timer = window.setTimeout(() => {
			button.classList.remove('copied');
			button.textContent = idle_label;
		}, COPIED_FOR_MS);
	});
}

function show_status(invite: HTMLElement, watch: HTMLElement, status_line: HTMLElement, status: string): void {
	const label = invite.dataset[status] ?? null;
	const dot = watch.querySelector('.dot');
	const done = watch.querySelector<HTMLElement>('#done');

	watch.dataset.status = status;

	if (label) {
		status_line.textContent = label;
		fade_in(status_line);
	}

	if (dot) {
		pop(dot);
	}

	if (status === 'connected' && done) {
		done.hidden = false;
		pop(done);
	}
}

/** Start the invite page's copy button and live status, if the current page is the invite page. */
export function start_invite_tracker(): void {
	const invite = document.querySelector<HTMLElement>('.invite');

	if (invite === null) {
		return;
	}

	const box = invite.querySelector<HTMLElement>('.prompt-box');
	const copy_button = invite.querySelector<HTMLButtonElement>('#copy');
	const prompt = invite.querySelector('#prompt');
	const watch = invite.querySelector<HTMLElement>('.watch');
	const status_line = invite.querySelector<HTMLElement>('#status');
	const url = invite.dataset.invitesUrl ?? null;
	const handle = invite.dataset.handle ?? null;

	if (box && copy_button && prompt) {
		copy_prompt_on_click(box, copy_button, prompt);
	}

	if (watch === null || status_line === null || url === null || handle === null) {
		return;
	}

	poll_invite_statuses(url, (statuses) => {
		const status = status_of(statuses, handle);

		if (status && status !== watch.dataset.status) {
			show_status(invite, watch, status_line, status);
		}

		return SETTLED_STATUSES.includes(status ?? '') === false;
	});
}
