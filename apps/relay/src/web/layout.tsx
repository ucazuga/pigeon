import { raw } from 'hono/html';
import type { Child } from 'hono/jsx';

/** Props for the page shell. */
type LayoutProps = {
	/** Document title. */
	readonly title: string;

	/** Page content. */
	readonly children: Child;
};

/**
 * Shared HTML shell for landing, login and dashboard.
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
					<style>{'body { margin: 0; background: #fff; }'}</style>
				</head>
				<body>{props.children}</body>
			</html>
		</>
	);
}
