/*
 * Form feedback: a submit button that says what is happening ("Sending…") and cannot be pressed twice, and an error
 * from the last action that does not come back on reload.
 */

function show_pending(button: HTMLButtonElement): void {
	const pending_label = button.dataset.pending ?? null;

	if (pending_label === null) {
		return;
	}

	button.dataset.label = button.textContent ?? '';
	button.textContent = pending_label;

	// Disabled on the next tick: disabling the submitter while its submit event runs would cancel the submission.
	window.setTimeout(() => {
		button.disabled = true;
	}, 0);
}

/** Back/forward cache restores the page as it was left, with the button still pending. */
function restore_pending_buttons(): void {
	for (const button of document.querySelectorAll<HTMLButtonElement>('button[data-label]')) {
		button.disabled = false;
		button.textContent = button.dataset.label ?? '';
		delete button.dataset.label;
	}
}

/** The dashboard shows an action's error from `?error=`. Drop it from the address so a reload does not repeat it. */
function forget_error_in_url(): void {
	const url = new URL(window.location.href);

	if (url.searchParams.has('error')) {
		url.searchParams.delete('error');
		window.history.replaceState(window.history.state, '', url);
	}
}

/** Start form feedback on the current page. */
export function start_forms(): void {
	document.addEventListener('submit', (event) => {
		const button = event.submitter;

		if (button instanceof HTMLButtonElement) {
			show_pending(button);
		}
	});

	window.addEventListener('pageshow', (event) => {
		if (event.persisted) {
			restore_pending_buttons();
		}
	});

	forget_error_in_url();
}
