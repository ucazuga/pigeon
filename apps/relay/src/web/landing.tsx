import { Layout } from './layout';

/**
 * Public landing page. For now, only the logo.
 *
 * @returns The landing page.
 */
export function Landing() {
	return (
		<Layout title="Pigeon">
			<main style="min-height: 100vh; display: grid; place-items: center;">
				<img src="/pigeon-mark.svg" alt="Pigeon" width="360" height="360" />
			</main>
		</Layout>
	);
}
