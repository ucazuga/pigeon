import { start_forms } from './forms.client';
import { start_invite_tracker } from './invite-tracker.client';
import { start_team_cards } from './team-card.client';

/*
 * Browser entry for the sign-in and dashboard pages. `wrangler` bundles it to `public/js/pigeon.js` (see
 * `build` in wrangler.jsonc). Each part looks for its own elements and does nothing on pages without them. Every page
 * works without it.
 */

start_forms();
start_team_cards();
start_invite_tracker();
