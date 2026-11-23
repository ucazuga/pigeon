import { zValidator } from '@hono/zod-validator';
import type { Context, ValidationTargets } from 'hono';
import type * as zod from 'zod';

/** Answers a request whose input did not parse, e.g. by re-rendering the form with the reason. */
type InvalidInputResponder = (error: zod.core.$ZodError, context: Context) => Response | Promise<Response>;

function throw_to_error_handler(error: zod.core.$ZodError): never {
	throw error;
}

/**
 * Hono middleware that parses one part of the request with a Zod schema before the handler runs. Handlers read the parsed value with `context.req.valid(target)` and never parse
 * input themselves.
 */
export function validate<Target extends keyof ValidationTargets, Schema extends zod.ZodType>(
	target: Target,
	schema: Schema,
	on_invalid: InvalidInputResponder = throw_to_error_handler,
) {
	return zValidator(target, schema, (result, context) => {
		if (result.success === false) {
			return on_invalid(result.error, context);
		}
	});
}
