/** What kind of failure happened. The HTTP boundary maps each code to one status. */
export type ErrorCode = 'invalid_input' | 'unauthorized' | 'forbidden' | 'not_found' | 'conflict' | 'rate_limited' | 'unavailable';

/**
 * The single error type for expected failures. The message must be safe to show to the caller:
 * never include tokens, invite codes or raw user input.
 */
export class PigeonError extends Error {
	/**
	 * Create an expected failure.
	 *
	 * @param code - The kind of failure.
	 * @param message - Safe, human-readable description.
	 * @param options - Optional underlying cause, kept for logs only.
	 */
	constructor(
		readonly code: ErrorCode,
		message: string,
		options: { readonly cause?: unknown } = {},
	) {
		super(message, options);
	}
}
