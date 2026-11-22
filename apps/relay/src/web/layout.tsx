import { raw } from 'hono/html';
import type { Child } from 'hono/jsx';

const STYLES = `
* { box-sizing: border-box; }
body { margin: 0; background: #fff; color: #1F2A44; font: 15px/1.5 system-ui, -apple-system, sans-serif; }
.page { max-width: 720px; margin: 0 auto; padding: 32px 20px 64px; }
.top { display: flex; align-items: center; gap: 12px; margin-bottom: 32px; }
.top img { width: 36px; height: 36px; }
.top .grow { flex: 1; font-weight: 700; font-size: 18px; }
.muted { color: #5B6478; }
.card { border: 1px solid #E2E8F0; border-radius: 14px; padding: 20px; margin-bottom: 20px; }
h1 { font-size: 24px; margin: 0 0 8px; }
h2 { font-size: 18px; margin: 0 0 12px; }
form.inline { display: flex; gap: 8px; flex-wrap: wrap; }
input[type=text], input[type=email] { flex: 1; min-width: 180px; padding: 9px 12px; border: 1px solid #C3CEDB; border-radius: 10px; font: inherit; }
button { padding: 9px 16px; border: 0; border-radius: 10px; background: #1F2A44; color: #fff; font: inherit; cursor: pointer; }
button.quiet { background: transparent; color: #B8323A; padding: 4px 8px; }
table { width: 100%; border-collapse: collapse; margin-top: 12px; }
td { padding: 8px 4px; border-top: 1px solid #EEF2F7; }
.status { font-size: 13px; padding: 2px 8px; border-radius: 999px; background: #EEF2F7; }
.status.connected { background: #DDF5E3; color: #1B6B35; }
.status.revoked, .status.expired { background: #FBE4E5; color: #B8323A; }
.error { background: #FBE4E5; color: #B8323A; padding: 10px 14px; border-radius: 10px; margin-bottom: 20px; }
.notice { background: #EEF3FF; padding: 12px 14px; border-radius: 10px; margin-bottom: 16px; }
.notice p { margin: 0 0 10px; }
pre.prompt { white-space: pre-wrap; word-break: break-all; background: #F6F8FB; border: 1px solid #E2E8F0; border-radius: 10px; padding: 14px; font-size: 13px; }
.center { min-height: 100vh; display: grid; place-items: center; text-align: center; padding: 20px; }
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
				</head>
				<body>{props.children}</body>
			</html>
		</>
	);
}
