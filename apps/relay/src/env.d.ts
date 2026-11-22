import type { TeamRoom } from './threads/team-room';

declare global {
	namespace Cloudflare {
		/** Worker bindings from `wrangler.jsonc`, available anywhere via `import { env } from 'cloudflare:workers'`. */
		interface Env {
			/** Public origin, e.g. `https://pigeon.example`. */
			readonly PUBLIC_URL: string;

			/** Sender address for magic-link emails. */
			readonly EMAIL_FROM: string;

			/** Secret used to sign owner session cookies. */
			readonly SESSION_SIGNING_KEY: string;

			/** Owners, teams, invites and member credentials. */
			readonly DB: D1Database;

			/** One room per team: live connections and thread history. */
			readonly TEAM_ROOM: DurableObjectNamespace<TeamRoom>;
		}
	}
}
