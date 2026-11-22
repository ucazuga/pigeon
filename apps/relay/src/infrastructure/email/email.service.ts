import { env } from 'cloudflare:workers';
import { PigeonError } from '../../pigeon-error';
import { read_config } from '../config/config';

/**
 * Send a one-time sign-in link through Cloudflare Email Sending. In local development with
 * `MAGIC_LINK_DELIVERY=console` the link is printed to the wrangler console instead.
 *
 * @param to - Recipient email.
 * @param link - The sign-in URL.
 * @throws {PigeonError} `unavailable` when email is not set up on this relay or the provider rejects the message.
 */
export async function send_magic_link(to: string, link: URL): Promise<void> {
	const config = read_config();

	if (config.log_magic_links) {
		console.log(`[local] sign-in link for ${to}: ${link}`);

		return;
	}

	if (config.email_from === null) {
		throw new PigeonError('unavailable', 'Sign-in email is not set up on this relay yet');
	}

	const text = ['Sign in to Pigeon:', '', link.toString(), '', 'The link works once and expires in 15 minutes. If you did not ask for it, ignore this email.'].join('\n');

	try {
		await env.EMAIL.send({
			to,
			from: { email: config.email_from, name: 'Pigeon' },
			subject: 'Sign in to Pigeon',
			text,
			html: `<p>Sign in to Pigeon:</p><p><a href="${link}">Sign in</a></p><p>The link works once and expires in 15 minutes. If you did not ask for it, ignore this email.</p>`,
		});
	} catch (error) {
		throw new PigeonError('unavailable', 'Could not send the sign-in email; try again in a minute', { cause: error });
	}
}
