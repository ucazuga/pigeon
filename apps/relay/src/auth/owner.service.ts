import { env } from 'cloudflare:workers';

/*
 * Team owners: the people who sign in to the dashboard and create teams. Teammates are not owners; they are members,
 * created when they claim an invite.
 */

/** A team owner's account. */
export type Owner = {
	/** The owner's account ID. */
	readonly owner_id: string;

	/** The owner's email, which is how they sign in. */
	readonly email: string;
};

/**
 * Load an owner by ID, for an existing session.
 *
 * @param owner_id - The owner's ID from the session cookie.
 * @returns The owner, or null when the account no longer exists.
 */
export async function find(owner_id: string): Promise<Owner | null> {
	return env.DB.prepare('SELECT owner_id, email FROM owners WHERE owner_id = ?').bind(owner_id).first<Owner>();
}

/**
 * Load the owner with this email, creating the account on their first sign-in.
 *
 * @param email - A verified email address.
 * @returns The owner.
 */
export async function find_or_create(email: string): Promise<Owner> {
	const owner = await env.DB.prepare(
		`INSERT INTO owners (owner_id, email, created_at) VALUES (?, ?, ?)
		 ON CONFLICT (email) DO UPDATE SET email = excluded.email
		 RETURNING owner_id, email`,
	)
		.bind(crypto.randomUUID(), email, new Date().toISOString())
		.first<Owner>();

	if (owner === null) {
		throw new Error('Owner upsert returned no row');
	}

	return owner;
}
