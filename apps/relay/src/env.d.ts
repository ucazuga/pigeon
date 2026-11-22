import type { TeamRoom } from './threads/team-room';

declare global {
	namespace Cloudflare {
		/** Worker bindings from `wrangler.jsonc`, available anywhere via `import { env } from 'cloudflare:workers'`. */
		interface Env {
			/** Public origin, e.g. `https://pigeon.example`. */
			readonly PUBLIC_URL: string;

			/** Sender address for sign-in emails, on a domain onboarded to Cloudflare Email Sending. Unset: no email. */
			readonly EMAIL_FROM?: string;

			/** `console` logs sign-in links instead of emailing them. Honoured only when PUBLIC_URL is localhost. */
			readonly MAGIC_LINK_DELIVERY?: string;

			/** Cloudflare Email Sending. */
			readonly EMAIL: SendEmail;

			/** Limits sign-in emails per IP and per address. */
			readonly LOGIN_LIMITER: RateLimit;

			/** Limits invite claims per IP. */
			readonly JOIN_LIMITER: RateLimit;

			/** Secret used to sign owner session cookies. */
			readonly SESSION_SIGNING_KEY: string;

			/** Owners, teams, invites and member credentials. */
			readonly DB: D1Database;

			/** One room per team: live connections and thread history. */
			readonly TEAM_ROOM: DurableObjectNamespace<TeamRoom>;
		}
	}
}
