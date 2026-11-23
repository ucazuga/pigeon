import { spring, stagger } from 'motion';
import { animate } from 'motion/mini';

/*
 * The landing page demo, bundled to `public/js/landing.js` (see `build` in wrangler.jsonc). Two acts play one after the
 * other: "Today", where Dan and Maya copy a question and its answer between their Claudes through team chat, and "With
 * Pigeon", where the pigeon carries it. The tabs restart the demo at either act; an act that is skipped to runs
 * instantly. With reduced motion on, only the second act is shown, already finished.
 */

type Person = 'dan' | 'maya';
type Act = 'today' | 'pigeon';
type Point = { readonly x: number; readonly y: number };
type FlightPoint = Point & { readonly r: number };
type Box = Point & { readonly w: number; readonly h: number };

const REDUCED_MOTION = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
const NARROW = window.matchMedia('(max-width: 760px)');

const QUESTION = 'will billing refund a single item from an order?';
const DAN_ASKS = `I can do the checkout side. But ${QUESTION} That logic is in billing-worker, which I can't see.`;
const MAYA_ANSWERS =
	'Mostly. refund() already takes an amount. But the nightly invoice job closes an order after any refund, so that needs a small change first (src/invoices/close.ts).';
const SPINNER = '⠋⠙⠹⠸⠼⠴⠦⠧⠇⠏';
const CURSOR =
	'<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 2l15 9.5-6.6 1.3L16 20l-3 1.4-3.6-7.2L4 19z" fill="#fff" stroke="#0B1428" stroke-width="1.6" stroke-linejoin="round"/></svg>';
/** The bird's height over its width, from its SVG view box. */
const BIRD_ASPECT = 270 / 350;

const AVATARS: Readonly<Record<Person, { readonly bg: string; readonly skin: string; readonly hair: string; readonly shirt: string; readonly cut: string }>> = {
	dan: { bg: '#C9D6FF', skin: '#F1C7A5', hair: '#3B2A20', shirt: '#4A6CF0', cut: 'M10 13c0-5 3-7.5 6-7.5s6 2.2 6 6.5c-2.2-1.6-5-1.8-6.4-3.4C14.3 10.4 12.3 12 10 13z' },
	maya: {
		bg: '#FFE1B8',
		skin: '#C98E67',
		hair: '#231A2E',
		shirt: '#E08A00',
		cut: 'M9 16c0-6.5 3-10 7-10s7 3.5 7 10v5c-1.2-.8-2-2-2-3.5v-3.2c-2.3 0-4.8-1.3-6-3.3-1 2-3 3.3-5 3.3v3.2c0 1.5-.8 2.7-1 3.5z',
	},
};

/** Thrown out of a running act when the demo was restarted, so the old act stops where it is. */
const CANCELLED = Symbol('cancelled');

function find<Found extends Element = HTMLElement>(selector: string, root: ParentNode = document): Found {
	const element = root.querySelector<Found>(selector);

	if (element === null) {
		throw new Error(`landing: missing ${selector}`);
	}

	return element;
}

const stage = find('.stage');
const trail = find<SVGSVGElement>('.trail');
const bird = find('.bird');
const score = find('.score');
const chat = find('#chat');
const chat_body = find('.chat-body', chat);
const clock = find('.clock', chat);
const chat_status = find('.status', chat);
const composer = find('.composer', chat);
const composer_field = find('.field', composer);
const tabs = [...document.querySelectorAll<HTMLButtonElement>('.tab')];
const terminals: Readonly<Record<Person, HTMLElement>> = { dan: find('#dan'), maya: find('#maya') };

/** The current run; a run that is no longer current stops at its next wait. */
let current_run = {};
/** Set while the first act is skipped through to reach the second. */
let skipping = false;
/** Where the bird sits. */
let perched_at: Person = 'dan';
/** Minutes past ten on the chat clock. */
let minute = 2;

function instant(): boolean {
	return REDUCED_MOTION || skipping;
}

async function wait(ms: number): Promise<void> {
	const run = current_run;

	if (instant() === false) {
		await new Promise((resolve) => window.setTimeout(resolve, ms));
	}

	if (run !== current_run) {
		throw CANCELLED;
	}
}

function appear(element: Element): void {
	if (instant() === false) {
		animate(element, { opacity: [0, 1], translate: ['0 4px', '0 0'] }, { duration: 0.28, ease: 'easeOut' });
	}
}

function pop(element: Element): void {
	if (instant() === false) {
		animate(element, { scale: [0.9, 1] }, { type: spring, bounce: 0.45, duration: 0.45 });
	}
}

// Terminals

function terminal_input(person: Person): HTMLElement {
	return find('.input', terminals[person]);
}

function typed_text(person: Person): HTMLElement {
	return find('.input .typed', terminals[person]);
}

/** Add a line above the prompt. `markup` is trusted HTML written in this file. */
function print(person: Person, text: string, kind = '', as: 'text' | 'markup' = 'text'): HTMLElement {
	const line = document.createElement('div');

	line.className = `line ${kind}`;

	if (as === 'markup') {
		line.innerHTML = text;
	} else {
		line.textContent = text;
	}

	find('.body', terminals[person]).insertBefore(line, terminal_input(person));
	appear(line);

	return line;
}

async function type(person: Person, text: string): Promise<void> {
	if (instant()) {
		typed_text(person).textContent = text;

		return;
	}

	for (const character of text) {
		typed_text(person).textContent += character;

		let pause = 18 + Math.random() * 26;

		if (character === ' ') {
			pause = 40;
		}

		await wait(pause);
	}
}

/** Press enter: what was typed becomes a command line. */
function enter(person: Person): HTMLElement {
	const line = print(person, typed_text(person).textContent ?? '', 'cmd');

	typed_text(person).textContent = '';

	return line;
}

function clear_terminals(): void {
	for (const person of ['dan', 'maya'] as const) {
		for (const line of find('.body', terminals[person]).querySelectorAll('.line:not(.input)')) {
			line.remove();
		}

		typed_text(person).textContent = '';
	}
}

// Layout

function box_in_stage(element: Element): Box {
	const box = element.getBoundingClientRect();
	const stage_box = stage.getBoundingClientRect();

	return { x: box.left - stage_box.left, y: box.top - stage_box.top, w: box.width, h: box.height };
}

/** On narrow screens only one panel shows at a time: the one being used. */
function show(panel: Person | 'chat'): void {
	if (stage.dataset.show === panel) {
		return;
	}

	stage.dataset.show = panel;

	if (NARROW.matches) {
		appear(find(`#${panel}`));
	}
}

/** Select text, carry it as a clipboard card to where it is pasted, then deselect. */
async function copy_paste(from: Element, to: Element, text: string): Promise<void> {
	from.classList.add('sel');
	await wait(350);

	if (instant() || NARROW.matches) {
		await wait(500);
		from.classList.remove('sel');

		return;
	}

	const card = document.createElement('div');

	card.className = 'clip';
	card.innerHTML = `<span></span>${CURSOR}`;
	find('span', card).textContent = text;

	const keys = document.createElement('i');

	keys.className = 'kbd';
	keys.style.cssText = 'position:absolute;top:-10px;left:-8px;font-style:normal;margin:0';
	keys.textContent = '⌘C';
	card.append(keys);

	const from_box = box_in_stage(from);
	const to_box = box_in_stage(to);
	const start = { x: from_box.x + Math.min(from_box.w, 260) / 2 - 95, y: from_box.y - 6 };
	const end = { x: to_box.x + to_box.w / 2 - 95, y: to_box.y + to_box.h / 2 - 24 };
	const peak = Math.min(start.y, end.y) - 40;
	let tilt = -4;

	if (end.x > start.x) {
		tilt = 4;
	}

	card.style.transform = `translate(${start.x}px, ${start.y}px)`;
	card.style.opacity = '0';
	stage.append(card);

	await animate(card, { opacity: [0, 1], scale: [0.9, 1] }, { duration: 0.18 }).finished;
	card.style.opacity = '1';
	await animate(
		card,
		{
			transform: [
				`translate(${start.x}px, ${start.y}px) rotate(0deg)`,
				`translate(${(start.x + end.x) / 2}px, ${peak}px) rotate(${tilt}deg)`,
				`translate(${end.x}px, ${end.y}px) rotate(0deg)`,
			],
		},
		{ duration: 1.1, ease: [0.5, 0, 0.3, 1] },
	).finished;
	keys.textContent = '⌘V';
	pop(keys);
	await wait(250);
	await animate(card, { opacity: 0, scale: 0.9 }, { duration: 0.18 }).finished;
	card.remove();
	from.classList.remove('sel');
}

// Team chat

function clock_text(minutes: number): string {
	return `10:${String(minutes).padStart(2, '0')}`;
}

/** Run the chat clock forward to `to` minutes past ten over `ms`. */
async function advance_clock(to: number, ms: number): Promise<void> {
	const from = minute;
	let steps = 1;

	if (instant() === false) {
		steps = Math.max(1, Math.min(to - from, Math.round(ms / 45)));
	}

	for (let step = 1; step <= steps; step++) {
		minute = Math.round(from + ((to - from) * step) / steps);
		clock.textContent = clock_text(minute);
		await wait(ms / steps);
	}
}

function avatar(person: Person): string {
	const look = AVATARS[person];

	return (
		`<svg viewBox="0 0 32 32" aria-hidden="true"><rect width="32" height="32" fill="${look.bg}"/>` +
		`<path d="M5 33c1-6.5 5.5-9.5 11-9.5S26 26.5 27 33z" fill="${look.shirt}"/><circle cx="16" cy="14.5" r="6" fill="${look.skin}"/>` +
		`<path d="${look.cut}" fill="${look.hair}"/></svg>`
	);
}

/** Post a chat message and return its text element. */
function post(person: Person, text: string): HTMLElement {
	const message = document.createElement('div');

	message.className = 'msg';
	message.innerHTML = `<span class="pic">${avatar(person)}</span><div><b></b><time></time><p></p></div>`;
	find('b', message).textContent = person;
	find('time', message).textContent = clock_text(minute);
	find('p', message).textContent = text;
	chat_body.append(message);
	appear(message);

	return find('p', message);
}

function typing_note(text: string): HTMLElement {
	const note = document.createElement('div');

	note.className = 'typing';
	note.textContent = text;
	chat_body.append(note);
	appear(note);

	return note;
}

// The pigeon

async function spin(line: HTMLElement, ms: number): Promise<void> {
	for (let elapsed = 0, frame = 0; elapsed < ms && instant() === false; elapsed += 80, frame++) {
		find('.spin', line).textContent = SPINNER.charAt(frame % SPINNER.length);
		await wait(80);
	}
}

/** Where the bird sits on a terminal: on its top edge, toward the middle of the stage. */
function perch(person: Person): Point {
	const terminal = box_in_stage(terminals[person]);
	const width = bird.offsetWidth;
	const height = width * BIRD_ASPECT;
	let left = terminal.x + 96;

	if (person === 'dan') {
		left = terminal.x + terminal.w - width - 28;
	}

	return { x: left, y: terminal.y - height * 0.9 };
}

function place(point: Point): void {
	bird.style.transform = `translate(${point.x}px, ${point.y}px)`;
}

/** Face the bird toward the middle: right on Dan's terminal, left on Maya's. */
function face_middle(person: Person): void {
	bird.dataset.face = 'left';

	if (person === 'dan') {
		bird.dataset.face = 'right';
	}
}

async function fly_along(points: ReadonlyArray<FlightPoint>, duration: number): Promise<void> {
	await animate(bird, { transform: points.map((point) => `translate(${point.x}px, ${point.y}px) rotate(${point.r}deg)`) }, { duration, ease: [0.45, 0, 0.35, 1] }).finished;

	const [landing_point] = points.slice(-1);

	if (landing_point) {
		place(landing_point);
	}

	await wait(0);
}

/** Off-screen on the side of a narrow stage that belongs to `person`. */
function off_screen_x(person: Person): number {
	if (person === 'maya') {
		return stage.offsetWidth + 40;
	}

	return -bird.offsetWidth - 40;
}

async function fly_to(person: Person): Promise<void> {
	const from = perch(perched_at);
	const to = perch(person);
	const leaving: Person = perched_at;

	perched_at = person;

	if (instant()) {
		show(person);
		place(to);
		face_middle(person);

		return;
	}

	// Face the way it flies.
	bird.dataset.face = 'left';

	if (person === 'maya') {
		bird.dataset.face = 'right';
	}

	bird.classList.add('flying');

	try {
		if (NARROW.matches) {
			// One terminal shows at a time: fly off one side, switch, fly in from the other.
			await fly_along(
				[
					{ ...from, r: 0 },
					{ x: off_screen_x(person), y: from.y - 50, r: 0 },
				],
				0.7,
			);
			show(person);
			await fly_along(
				[
					{ x: off_screen_x(leaving), y: to.y - 50, r: 0 },
					{ ...to, r: 0 },
				],
				0.7,
			);
		} else {
			let bank = 8;

			if (person === 'maya') {
				bank = -8;
			}

			await fly_along(
				[
					{ ...from, r: 0 },
					{ x: (from.x + to.x) / 2, y: Math.min(from.y, to.y) - 36, r: bank },
					{ ...to, r: 0 },
				],
				1.7,
			);
		}
	} finally {
		bird.classList.remove('flying');
	}

	bird.classList.add('landing');
	await wait(200);
	face_middle(person);
	animate(find('.flip', bird), { translate: ['0 0', '0 -10px', '0 0'] }, { duration: 0.5, ease: 'easeOut' });
	await wait(320);
	bird.classList.remove('landing');
}

/** The dotted arc between the two perches. */
function draw_trail(): void {
	const width = bird.offsetWidth;
	const half_height = (width * BIRD_ASPECT) / 2;
	const dan = perch('dan');
	const maya = perch('maya');
	const start = { x: dan.x + width + 6, y: dan.y + half_height };
	const end = { x: maya.x - 6, y: maya.y + half_height };
	// The control point that puts the curve's top at the flight's peak.
	const control_y = 2 * (Math.min(dan.y, maya.y) - 36 + half_height) - (start.y + end.y) / 2;

	find('path', trail).setAttribute('d', `M ${start.x} ${start.y} Q ${(start.x + end.x) / 2} ${control_y} ${end.x} ${end.y}`);
}

// Acts

function press_tab(act: Act): void {
	for (const tab of tabs) {
		tab.setAttribute('aria-pressed', String(tab.dataset.act === act));
	}
}

function reset(): void {
	for (const element of [bird, chat]) {
		for (const animation of element.getAnimations()) {
			animation.cancel();
		}
	}

	for (const card of stage.querySelectorAll('.clip')) {
		card.remove();
	}

	clear_terminals();
	chat_body.replaceChildren(find('.day', chat_body));
	chat.dataset.presence = 'away';
	chat_status.textContent = '📅 In a meeting';
	composer.classList.remove('filled');
	composer_field.textContent = 'Message maya';
	chat.style.opacity = '1';
	chat.style.transform = '';

	for (const animation of trail.getAnimations()) {
		animation.cancel();
	}

	trail.style.opacity = '0';
	minute = 2;
	clock.textContent = clock_text(minute);
	score.textContent = '';
	perched_at = 'dan';
	stage.dataset.show = 'dan';
	stage.classList.remove('done');
	bird.classList.remove('flying', 'landing');
	// Jump to Dan's perch without the flip animating.
	bird.classList.add('still');
	face_middle('dan');
	place(perch('dan'));
	void bird.offsetWidth;
	bird.classList.remove('still');
	bird.style.opacity = '0';
}

/** Act one: the question and its answer go through team chat, copied and pasted by hand. */
async function today(): Promise<void> {
	press_tab('today');
	await wait(500);
	await type('dan', 'add single-item cancellation to orders');
	await wait(250);
	enter('dan');
	await wait(500);

	const dan_asks = print('dan', DAN_ASKS, 'claude');

	await wait(1200);
	await copy_paste(dan_asks, composer, DAN_ASKS);
	show('chat');
	composer_field.textContent = DAN_ASKS;
	composer.classList.add('filled');
	pop(composer);
	await wait(700);
	composer.classList.remove('filled');
	composer_field.textContent = 'Message maya';
	await advance_clock(4, 200);
	post('dan', DAN_ASKS);
	await wait(600);
	await advance_clock(30, 1700);
	chat.dataset.presence = 'active';
	chat_status.textContent = 'Active';
	pop(chat_status);
	await advance_clock(31, 200);
	await wait(500);
	await copy_paste(find('.msg:last-child p', chat_body), terminal_input('maya'), DAN_ASKS);
	show('maya');
	typed_text('maya').textContent = DAN_ASKS;
	pop(terminal_input('maya'));
	await wait(300);
	enter('maya').insertAdjacentHTML('afterbegin', '<span class="tag">pasted</span>');
	await wait(600);

	const maya_answers = print('maya', MAYA_ANSWERS, 'claude');

	await wait(1300);
	await copy_paste(maya_answers, chat_body, MAYA_ANSWERS);
	show('chat');

	const typing = typing_note('maya is typing…');

	await advance_clock(46, 600);
	typing.remove();

	const answer_in_chat = post('maya', MAYA_ANSWERS);

	await wait(900);
	await advance_clock(49, 300);
	await copy_paste(answer_in_chat, terminal_input('dan'), MAYA_ANSWERS);
	show('dan');
	typed_text('dan').textContent = MAYA_ANSWERS;
	pop(terminal_input('dan'));
	await wait(300);
	enter('dan').insertAdjacentHTML('afterbegin', '<span class="tag">pasted</span>');
	await wait(400);
	print('dan', 'Thanks. Starting with close.ts, then checkout.', 'claude');
	await wait(2800);
}

/** Act two: the pigeon carries the question, Maya's read-only Claude drafts, Maya approves. */
async function with_pigeon(): Promise<void> {
	press_tab('pigeon');
	clear_terminals();
	show('dan');

	if (instant()) {
		chat.style.opacity = '0';
	} else {
		animate(chat, { opacity: [1, 0], transform: ['translateY(0) scale(1)', 'translateY(24px) scale(0.94)'] }, { duration: 0.5, ease: 'easeIn' }).finished.then(
			() => {
				chat.style.opacity = '0';
			},
			() => undefined,
		);
	}

	draw_trail();
	await wait(300);
	bird.style.opacity = '1';
	trail.style.opacity = '1';

	if (instant() === false) {
		animate(bird, { opacity: [0, 1] }, { duration: 0.4 });
		animate(trail, { opacity: [0, 1] }, { duration: 0.6 });
	}

	await wait(800);
	await type('dan', 'add single-item cancellation to orders');
	await wait(250);
	enter('dan');
	await wait(500);

	const asked = print('dan', `<span class="dot"></span>Billing is Maya's. Asked @maya: ${QUESTION}`, 'dim', 'markup');

	await wait(700);
	await fly_to('maya');
	pop(print('maya', 'pigeon: @dan asked you a question. Run /pigeon:inbox to see it.', 'pigeon'));
	await wait(900);
	await type('maya', '/pigeon:inbox');
	await wait(250);
	enter('maya');
	await wait(300);
	print('maya', `<span class="dim">@dan asks:</span> ${QUESTION}`, '', 'markup');
	await wait(500);
	print('maya', '<span class="dim">Which repository should answer?</span> billing-worker', '', 'markup');
	await wait(400);

	const drafting = print('maya', '<span class="spin">⠋</span> Drafting with a read-only Claude…', 'dim', 'markup');

	await spin(drafting, 1400);
	drafting.innerHTML = '<span class="ok">✓</span> Draft ready';
	print('maya', MAYA_ANSWERS, 'quote');
	await wait(900);

	const choice = print('maya', '<span class="dim">Send to @dan?</span>  <span class="choice"><span>Yes</span> <span>Edit</span> <span>Decline</span></span>', '', 'markup');

	await wait(1000);

	const send = find('.choice span', choice);

	send.classList.add('on');
	pop(send);
	await wait(500);
	print('maya', '✓ Sent to @dan', 'ok');
	await wait(400);
	await fly_to('dan');
	asked.className = 'line pigeon';
	asked.textContent = 'pigeon: @maya answered your question.';
	pop(asked);
	await wait(400);
	print('dan', `${MAYA_ANSWERS} Starting with close.ts.`, 'claude');
	await wait(400);
}

/** Play the demo from the start of `act`. Starting again cancels the run that is playing. */
async function play(act: Act): Promise<void> {
	const run = {};

	current_run = run;
	reset();

	try {
		skipping = act === 'pigeon';
		await today();
		skipping = false;
		await with_pigeon();
		stage.classList.add('done');

		const replay = document.createElement('button');

		replay.className = 'replay';
		replay.type = 'button';
		replay.textContent = '↻ Replay';
		replay.addEventListener('click', () => void play('today'));
		score.append(replay);
		appear(replay);
	} catch (error) {
		if (error !== CANCELLED && run === current_run) {
			throw error;
		}
	} finally {
		skipping = false;
	}
}

find('.chat-head .pic', chat).insertAdjacentHTML('afterbegin', avatar('maya'));

for (const tab of tabs) {
	tab.addEventListener('click', () => {
		let act: Act = 'today';

		if (tab.dataset.act === 'pigeon') {
			act = 'pigeon';
		}

		void play(act);
	});
}

window.addEventListener('resize', () => {
	if (bird.classList.contains('flying') === false) {
		place(perch(perched_at));
	}

	draw_trail();
});

if (REDUCED_MOTION === false) {
	const rising = document.querySelectorAll('[data-rise]');

	animate(rising, { opacity: [0, 1], translate: ['0 14px', '0 0'] }, { duration: 0.6, ease: [0.2, 0.8, 0.2, 1], delay: stagger(0.08) }).finished.then(() => {
		for (const element of rising) {
			(element as HTMLElement).style.opacity = '1';
		}
	});
}

if (REDUCED_MOTION) {
	void play('pigeon');
} else {
	void play('today');
}
