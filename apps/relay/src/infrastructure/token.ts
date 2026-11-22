/**
 * A new random secret: 32 bytes, base64url. Uses only `A-Z a-z 0-9 - _`, which the plugin scripts accept as an ID.
 *
 * @returns The token. Store only its hash.
 */
export function create_token(): string {
	const bytes = crypto.getRandomValues(new Uint8Array(32));

	return btoa(String.fromCharCode(...bytes))
		.replaceAll('+', '-')
		.replaceAll('/', '_')
		.replaceAll('=', '');
}

/**
 * Hex-encoded SHA-256 of a token, which is what D1 stores for member tokens, invite codes and login links.
 *
 * @param token - The raw token.
 * @returns The hash.
 */
export async function hash_token(token: string): Promise<string> {
	const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(token));

	return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('');
}
