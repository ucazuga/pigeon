import { raw } from 'hono/html';
import type { Child } from 'hono/jsx';

const STYLES = `
@view-transition { navigation: auto; }
::view-transition-old(root), ::view-transition-new(root) { animation-duration: 180ms; }
:root { --ink: #1F2A44; --muted: #5B6478; --line: #E2E8F0; --soft: #F6F8FB; --danger: #B8323A; --focus: #6C8CFF; --ease: cubic-bezier(0.2, 0.8, 0.2, 1); }
* { box-sizing: border-box; }
body { margin: 0; background: #F7F9FC; color: var(--ink); font: 15px/1.5 system-ui, -apple-system, sans-serif; -webkit-font-smoothing: antialiased; }
a { color: inherit; }
.page { max-width: 720px; margin: 0 auto; padding: 32px 20px 64px; }
.top { display: flex; align-items: center; gap: 12px; margin-bottom: 32px; view-transition-name: top; }
.top img { width: 36px; height: 36px; }
.top .grow { flex: 1; font-weight: 700; font-size: 18px; }
.muted { color: var(--muted); }
.card { background: #fff; border: 1px solid var(--line); border-radius: 16px; padding: 24px; margin-bottom: 20px; box-shadow: 0 1px 2px rgb(31 42 68 / 4%); animation: rise 420ms var(--ease) both; }
.card:nth-of-type(2) { animation-delay: 70ms; }
.card:nth-of-type(3) { animation-delay: 140ms; }
.card-head { display: flex; align-items: center; justify-content: space-between; gap: 12px; margin-bottom: 16px; }
.card-head h2 { margin: 0; }
h1 { font-size: 24px; margin: 0 0 8px; }
h2 { font-size: 18px; margin: 0 0 12px; }
form.inline { display: flex; gap: 8px; flex-wrap: wrap; }
input[type=text], input[type=email] { flex: 1; min-width: 180px; padding: 9px 12px; border: 1px solid #C3CEDB; border-radius: 10px; font: inherit; background: #fff; transition: border-color 160ms, box-shadow 160ms; }
input[type=text]:focus, input[type=email]:focus { outline: none; border-color: var(--focus); box-shadow: 0 0 0 3px rgb(108 140 255 / 20%); }
button, .button { display: inline-flex; align-items: center; gap: 6px; padding: 9px 16px; border: 0; border-radius: 10px; background: var(--ink); color: #fff; font: inherit; text-decoration: none; cursor: pointer; transition: background 160ms, color 160ms, opacity 160ms, transform 120ms var(--ease); }
button:hover, .button:hover { background: #2E3D63; }
button:active, .button:active { transform: scale(0.97); }
button:disabled { opacity: 0.6; cursor: progress; }
:focus-visible { outline: 2px solid var(--focus); outline-offset: 2px; }
button.quiet { background: transparent; color: var(--danger); padding: 5px 10px; font-size: 14px; }
button.quiet:hover { background: #FBE4E5; }
button.quiet.neutral { color: var(--muted); }
button.quiet.neutral:hover { background: var(--soft); color: var(--ink); }
button.quiet.armed { background: var(--danger); color: #fff; }
button.copied { background: #1B6B35; }
.seats { display: flex; align-items: center; gap: 8px; font-size: 13px; color: var(--muted); }
.seat-bar { display: flex; gap: 3px; }
.seat-bar span { width: 16px; height: 6px; border-radius: 3px; background: var(--line); }
.seat-bar span.taken { background: var(--ink); }
.people { list-style: none; margin: 16px 0 0; padding: 0; }
.person { display: flex; align-items: center; gap: 12px; padding: 10px 0; border-top: 1px solid #EEF2F7; }
.person .who { flex: 1; font-weight: 500; }
.avatar { flex: none; width: 32px; height: 32px; border-radius: 50%; display: grid; place-items: center; background: #EEF3FF; color: #3B4D7A; font-size: 13px; font-weight: 600; }
.you { margin-left: 6px; padding: 1px 7px; border-radius: 6px; background: var(--soft); color: var(--muted); font-size: 12px; font-weight: 400; }
.status { display: inline-flex; align-items: center; gap: 6px; font-size: 13px; padding: 3px 10px; border-radius: 999px; background: #EEF2F7; white-space: nowrap; }
.status::before { content: ''; width: 7px; height: 7px; border-radius: 50%; background: currentColor; }
.status.pending { background: #FFF4DB; color: #8A5A00; }
.status.claimed { background: #E6EEFF; color: #2D4BB3; }
.status.pending::before, .status.claimed::before { animation: pulse 1.6s ease-in-out infinite; }
.status.connected { background: #DDF5E3; color: #1B6B35; }
.status.revoked, .status.expired { background: #FBE4E5; color: var(--danger); }
.empty { margin: 16px 0 0; padding: 16px; border: 1px dashed var(--line); border-radius: 12px; text-align: center; }
.error { background: #FBE4E5; color: var(--danger); padding: 10px 14px; border-radius: 10px; margin-bottom: 20px; animation: drop 300ms var(--ease) both; }
.notice { background: #EEF3FF; padding: 14px 16px; border-radius: 12px; margin-bottom: 16px; }
.notice p { margin: 0 0 10px; }
.full { margin: 0; padding: 12px 14px; border-radius: 10px; background: var(--soft); }
[hidden] { display: none !important; }
.back { display: inline-block; margin: -16px 0 12px; color: var(--muted); font-size: 14px; text-decoration: none; }
.back:hover { color: var(--ink); }
.invite h1 { font-size: 22px; margin-bottom: 4px; }
.prompt-box { display: flex; align-items: center; gap: 12px; margin-top: 20px; padding: 10px 10px 10px 16px; border: 1px solid var(--line); border-radius: 12px; background: var(--soft); cursor: copy; transition: border-color 160ms; }
.prompt-box:hover { border-color: #C3CEDB; }
.prompt-box code { flex: 1; min-width: 0; overflow: hidden; white-space: nowrap; text-overflow: ellipsis; color: var(--muted); font-size: 13px; }
.prompt-box button { flex: none; }
.invite:has(.watch[data-status=claimed], .watch[data-status=connected], .watch[data-status=expired]) .prompt-box { opacity: 0.45; pointer-events: none; transition: opacity 300ms; }
.fine { margin: 8px 0 0; font-size: 13px; }
.watch { display: flex; align-items: center; gap: 10px; margin-top: 24px; padding: 14px 16px; border-radius: 12px; background: #FFF8E8; color: #6B4A00; transition: background 300ms, color 300ms; }
.watch #status { flex: 1; }
.watch .dot { flex: none; width: 10px; height: 10px; border-radius: 50%; background: #D99A00; animation: pulse 1.6s ease-in-out infinite; }
.watch[data-status=claimed] { background: #E9F0FF; color: #23408F; }
.watch[data-status=claimed] .dot { background: #3D63D6; }
.watch[data-status=connected] { background: #E4F6EA; color: #1B6B35; font-weight: 500; }
.watch[data-status=connected] .dot { width: 22px; height: 22px; display: grid; place-items: center; background: #1B6B35; animation: none; }
.watch[data-status=connected] .dot::after { content: '\\2713'; color: #fff; font-size: 13px; font-weight: 700; }
.watch[data-status=expired] { background: #FBE4E5; color: var(--danger); }
.watch[data-status=expired] .dot { background: var(--danger); animation: none; }
.center { min-height: 100vh; display: grid; place-items: center; padding: 20px; }
.center .card { width: 100%; max-width: 420px; text-align: center; padding: 32px 28px; }
.center form.inline { justify-content: center; }
.center img { animation: rise 520ms var(--ease) both; }
@keyframes rise { from { opacity: 0; transform: translateY(8px); } }
@keyframes drop { from { opacity: 0; transform: translateY(-6px); } }
@keyframes pulse { 50% { opacity: 0.35; transform: scale(0.7); } }
@media (prefers-reduced-motion: reduce) {
	@view-transition { navigation: none; }
	*, ::before, ::after { animation: none !important; transition: none !important; }
}
`;

/** Props for the page shell. */
type LayoutProps = {
	/** Document title. */
	readonly title: string;

	/** Page content. */
	readonly children: Child;
};

/**
 * Shared HTML shell for the sign-in and dashboard pages.
 *
 * @param props - Title and content.
 * @returns The full HTML document.
 */
export function Layout(props: LayoutProps) {
	return (
		<>
			{raw('<!DOCTYPE html>')}
			<html lang="en">
				<head>
					<meta charset="utf-8" />
					<meta name="viewport" content="width=device-width, initial-scale=1" />
					<link rel="icon" type="image/svg+xml" href="/favicon.svg" />
					<title>{props.title}</title>
					<style dangerouslySetInnerHTML={{ __html: STYLES }} />
					<script type="module" src="/js/pigeon.js" />
				</head>
				<body>{props.children}</body>
			</html>
		</>
	);
}
