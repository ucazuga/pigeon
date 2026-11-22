import { Layout } from './layout';

/**
 * Email form for owner sign-in.
 *
 * @param props - An error to show, if the last attempt failed.
 * @returns The page.
 */
export function LoginPage(props: { readonly error: string | null }) {
	return (
		<Layout title="Sign in · Pigeon">
			<main class="center">
				<div class="card">
					<img src="/pigeon-mark.svg" alt="Pigeon" width="88" height="88" />
					<h1>Sign in to Pigeon</h1>
					<p class="muted">We will email you a link. No password needed.</p>
					{props.error && <p class="error">{props.error}</p>}
					<form method="post" action="/" class="inline">
						<input type="email" name="email" placeholder="you@company.com" required autofocus />
						<button type="submit" data-pending="Sending…">
							Email me a link
						</button>
					</form>
				</div>
			</main>
		</Layout>
	);
}

/**
 * Shown after a sign-in link was requested.
 *
 * @param props - The address the link went to.
 * @returns The page.
 */
export function CheckInboxPage(props: { readonly email: string }) {
	return (
		<Layout title="Check your inbox · Pigeon">
			<main class="center">
				<div class="card">
					<img src="/pigeon-mark.svg" alt="Pigeon" width="88" height="88" />
					<h1>Check your inbox</h1>
					<p class="muted">We sent a sign-in link to {props.email}. It works once and expires in 15 minutes.</p>
				</div>
			</main>
		</Layout>
	);
}

/**
 * The page a sign-in link opens. Signing in takes a button press, so email scanners that open links
 * cannot use up the link.
 *
 * @param props - The token from the link.
 * @returns The page.
 */
export function ConfirmSignInPage(props: { readonly token: string }) {
	return (
		<Layout title="Sign in · Pigeon">
			<main class="center">
				<div class="card">
					<img src="/pigeon-mark.svg" alt="Pigeon" width="88" height="88" />
					<h1>Sign in to Pigeon</h1>
					<form method="post" action="/verify">
						<input type="hidden" name="token" value={props.token} />
						<button type="submit" data-pending="Signing in…">
							Sign in
						</button>
					</form>
				</div>
			</main>
		</Layout>
	);
}
