import { read_config } from '../config/config';
import { not_yet_implemented } from '../defects';

/**
 * Send a one-time sign-in link through Cloudflare Email Service.
 *
 * @param _to - Recipient email.
 * @param _link - The sign-in URL.
 * @throws {PigeonError} `unavailable` when the email provider rejects or cannot be reached.
 */
export async function send_magic_link(_to: string, _link: URL): Promise<void> {
	not_yet_implemented(`send magic link from ${read_config().email_from}`);
}
