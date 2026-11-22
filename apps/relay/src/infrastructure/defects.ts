/**
 * Mark the end of an exhaustive switch over a union. Fails to compile when a case is missing.
 *
 * @param unexpected_case - The value TypeScript has narrowed to `never`.
 * @throws {Error} Always; reaching this at runtime means the union grew without the switch.
 */
export function cases_handled(unexpected_case: never): never {
	throw new Error(`Unhandled case: ${JSON.stringify(unexpected_case)}`);
}

/**
 * Mark a path that the skeleton declares but has not implemented yet.
 *
 * @param what - Which behavior is missing.
 * @throws {Error} Always.
 */
export function not_yet_implemented(what: string): never {
	throw new Error(`Not yet implemented: ${what}`);
}
