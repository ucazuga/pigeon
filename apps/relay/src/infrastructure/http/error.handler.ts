import type { Context } from 'hono';
import { HTTPException } from 'hono/http-exception';
import type { ContentfulStatusCode } from 'hono/utils/http-status';
import * as zod from 'zod';
import { type ErrorCode, PigeonError } from '../../pigeon-error';
import { cases_handled } from '../defects';

function status_of(code: ErrorCode): ContentfulStatusCode {
	switch (code) {
		case 'invalid_input':
			return 400;
		case 'unauthorized':
			return 401;
		case 'forbidden':
			return 403;
		case 'not_found':
			return 404;
		case 'conflict':
			return 409;
		case 'rate_limited':
			return 429;
		case 'unavailable':
			return 503;
		default:
			return cases_handled(code);
	}
}

/**
 * Hono `onError` handler: the one place where thrown errors become HTTP responses.
 * `PigeonError` and Zod parse failures are expected and returned to the caller; anything else is logged and hidden.
 *
 * @param error - The thrown error.
 * @param context - The Hono request context.
 * @returns The JSON error response.
 */
export function handle_error(error: Error, context: Context): Response {
	if (error instanceof PigeonError) {
		return context.json({ error: error.code, message: error.message }, status_of(error.code));
	}

	// Raised by Hono's own middleware, e.g. 403 from the CSRF check.
	if (error instanceof HTTPException) {
		return error.getResponse();
	}

	if (error instanceof zod.ZodError) {
		return context.json({ error: 'invalid_input', message: zod.prettifyError(error) }, 400);
	}

	console.error(JSON.stringify({ event: 'unhandled_error', name: error.name, message: error.message }));

	return context.json({ error: 'internal' }, 500);
}
