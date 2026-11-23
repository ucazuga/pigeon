import { spring, stagger } from 'motion';
import { animate } from 'motion/mini';

/*
 * The few motions the pages use, so they feel the same everywhere. `motion/mini` runs them on the browser's own
 * animation engine (WAAPI), which keeps the script small. With reduced motion on, nothing moves.
 */

const REDUCED_MOTION = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

/**
 * A small spring "pop", for something that just changed: a status, a button label, a step.
 *
 * @param elements - What changed. Several elements pop one after another.
 */
export function pop(elements: Element | Element[]): void {
	if (REDUCED_MOTION) {
		return;
	}

	animate(elements, { scale: [0.8, 1], opacity: [0.5, 1] }, { type: spring, bounce: 0.45, duration: 0.45, delay: stagger(0.08) });
}

/** Fade new text in from just below. */
export function fade_in(element: Element): void {
	if (REDUCED_MOTION) {
		return;
	}

	animate(element, { opacity: [0, 1], translate: ['0 4px', '0 0'] }, { duration: 0.3, ease: 'easeOut' });
}

/** Slide something out to the right, before it is removed. Returns when the motion has finished; at once with reduced motion. */
export async function slide_out(element: Element): Promise<void> {
	if (REDUCED_MOTION) {
		return;
	}

	await animate(element, { opacity: 0, translate: '24px 0' }, { duration: 0.22, ease: 'easeIn' }).finished;
}
