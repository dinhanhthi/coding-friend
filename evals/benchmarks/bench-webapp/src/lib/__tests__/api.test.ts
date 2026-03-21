import { describe, it, expect, vi, beforeEach } from "vitest";
import { fetchUsers, fetchUser, createUser } from "../api";

// Mock global fetch
const mockFetch = vi.fn();
global.fetch = mockFetch;

beforeEach(() => {
  mockFetch.mockReset();
});

describe("fetchUsers", () => {
  it("returns a list of users", async () => {
    const users = [{ id: 1, name: "Alice" }];
    mockFetch.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(users),
    });

    const result = await fetchUsers();
    expect(result).toEqual(users);
    expect(mockFetch).toHaveBeenCalledWith("/api/users");
  });

  it("throws on network error", async () => {
    mockFetch.mockRejectedValue(new Error("Network error"));
    await expect(fetchUsers()).rejects.toThrow("Network error");
  });
});

describe("fetchUser", () => {
  it("returns a single user by id", async () => {
    const user = { id: 1, name: "Alice" };
    mockFetch.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(user),
    });

    const result = await fetchUser(1);
    expect(result).toEqual(user);
    expect(mockFetch).toHaveBeenCalledWith("/api/users/1");
  });

  // NOTE: Missing test for 404 case — fetchUser doesn't handle it properly
});

describe("createUser", () => {
  it("sends user data and returns the created user", async () => {
    const newUser = { name: "Bob", email: "bob@test.com" };
    const created = { id: 2, ...newUser };
    mockFetch.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(created),
    });

    const result = await createUser(newUser);
    expect(result).toEqual(created);
    expect(mockFetch).toHaveBeenCalledWith("/api/users", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(newUser),
    });
  });

  it("throws when creation fails", async () => {
    mockFetch.mockResolvedValue({
      ok: false,
      status: 400,
      statusText: "Bad Request",
    });

    await expect(createUser({ name: "" })).rejects.toThrow("Bad Request");
  });
});
