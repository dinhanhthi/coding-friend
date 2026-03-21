const BASE_URL = "/api/users";

interface User {
  id: number;
  name: string;
  email?: string;
}

/**
 * Fetches all users from the API.
 */
export async function fetchUsers(): Promise<User[]> {
  const response = await fetch(BASE_URL);
  if (!response.ok) {
    throw new Error(response.statusText);
  }
  return response.json();
}

/**
 * Fetches a single user by ID.
 *
 * BUG: Does not handle 404 responses. When the user is not found,
 * the response has ok=false but this function just returns the
 * (likely malformed) JSON body instead of throwing an error.
 */
export async function fetchUser(id: number): Promise<User | undefined> {
  const response = await fetch(`${BASE_URL}/${id}`);
  return response.json();
}

/**
 * Creates a new user.
 */
export async function createUser(data: Omit<User, "id">): Promise<User> {
  const response = await fetch(BASE_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
  if (!response.ok) {
    throw new Error(response.statusText);
  }
  return response.json();
}
