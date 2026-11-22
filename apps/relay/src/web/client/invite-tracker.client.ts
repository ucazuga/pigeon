import { fade_in, pop } from './animations.client';
import { poll_invite_statuses, SETTLED_STATUSES, status_of } from './invite-status.client';

/*
 * The invite page: copy the setup prompt, then follow the agent that uses it through the steps
 * (pending → claimed → connected) until it connects or the invite expires.
 */

const COPIED_FOR_MS = 2000;

function copy_prompt_on_click(button: HTMLButtonElement, prompt: Element): void {
	const idle_label = button.textContent ?? '';
	let reset_timer = 0;

	button.addEventListener('click', async () => {
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

function show_step(invite: HTMLElement, steps: HTMLElement, status_line: HTMLElement, status: string): void {
	const label = invite.dataset[status] ?? null;

	steps.dataset.status = status;
	pop(Array.from(steps.querySelectorAll('.mark')));

	if (label) {
		status_line.textContent = label;
		fade_in(status_line);
	}

	const copy_button = invite.querySelector('#copy');
	const back = invite.querySelector('.button.secondary');

	// Once connected the prompt is spent: going back becomes the main action.
	if (status === 'connected' && copy_button && back) {
		copy_button.classList.add('secondary');
		back.classList.remove('secondary');
		pop(back);
	}
}

/** Start the invite page's copy button and progress, if the current page is the invite page. */
export function start_invite_tracker(): void {
	const invite = document.querySelector<HTMLElement>('.invite');

	if (invite === null) {
		return;
	}

	const copy_button = invite.querySelector<HTMLButtonElement>('#copy');
	const prompt = invite.querySelector('#prompt');
	const steps = invite.querySelector<HTMLElement>('.steps');
	const status_line = invite.querySelector<HTMLElement>('#status');
	const url = invite.dataset.invitesUrl ?? null;
	const handle = invite.dataset.handle ?? null;

	if (copy_button && prompt) {
		copy_prompt_on_click(copy_button, prompt);
	}

	if (steps === null || status_line === null || url === null || handle === null) {
		return;
	}

	poll_invite_statuses(url, (statuses) => {
		const status = status_of(statuses, handle);

		if (status && status !== steps.dataset.status) {
			show_step(invite, steps, status_line, status);
		}

		return SETTLED_STATUSES.includes(status ?? '') === false;
	});
}
