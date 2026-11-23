const REDACTED_TEXT = '<redacted>';

/** A secret that never prints itself. Call `unwrap()` only where the raw value is needed. */
export type Redacted<T> = {
	/** Read the raw secret. Do not log or persist it in plain text. */
	readonly unwrap: () => T;

	/** Always `<redacted>`. */
	readonly toString: () => string;

	/** Always `<redacted>`, so secrets never end up in JSON logs. */
	readonly toJSON: () => string;
};

/**
 * Wrap a secret so that string conversion and JSON serialization never reveal it.
 *
 * @template T - The secret's type.
 */
export function redact<T>(value: T): Redacted<T> {
	return Object.freeze({
		unwrap: () => value,
		toString: () => REDACTED_TEXT,
		toJSON: () => REDACTED_TEXT,
	});
}
