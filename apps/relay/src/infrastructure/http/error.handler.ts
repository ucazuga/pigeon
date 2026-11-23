import type { Context } from 'hono';
import { HTTPException } from 'hono/http-exception';
import type { ContentfulStatusCode } from 'hono/utils/http-status';
import * as zod from 'zod';
import { type ErrorCode, PigeonError } from '../../pigeon-error';

/** The HTTP status for each error code. */
const STATUS_BY_CODE: Record<ErrorCode, ContentfulStatusCode> = {
	invalid_input: 400,
	unauthorized: 401,
	forbidden: 403,
	not_found: 404,
	conflict: 409,
	rate_limited: 429,
	unavailable: 503,
};

/**
 * Hono `onError` handler: the one place where thrown errors become HTTP responses.
 * `PigeonError` and Zod parse failures are expected and returned to the caller; anything else is logged and hidden.
 */
export function handle_error(error: Error, context: Context): Response {
	if (error instanceof PigeonError) {
		return context.json({ error: error.code, message: error.message }, STATUS_BY_CODE[error.code]);
	}

	// Raised by Hono's own middleware, e.g. 403 from the CSRF check.
	if (error instanceof HTTPException) {
		return error.getResponse();
	}

	if (error instanceof zod.core.$ZodError) {
		return context.json({ error: 'invalid_input', message: zod.prettifyError(error) }, 400);
	}

	console.error(JSON.stringify({ event: 'unhandled_error', name: error.name, message: error.message }));

	return context.json({ error: 'internal' }, 500);
}
