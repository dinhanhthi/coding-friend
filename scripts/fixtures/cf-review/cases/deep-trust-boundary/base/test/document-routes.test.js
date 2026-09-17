import assert from "node:assert/strict";
import test from "node:test";

import { createDocumentRoutes } from "../src/document-routes.js";

function makeDeps(overrides = {}) {
  return {
    store: {
      get: async () => ({
        id: "doc-1",
        title: "Report",
        ownerId: "user-1",
        locked: false,
      }),
      list: async () => [{ id: "doc-1", title: "Report" }],
      ...overrides.store,
    },
    audit: overrides.audit || (() => {}),
  };
}

test("returns a document for a viewer", async () => {
  const routes = createDocumentRoutes(makeDeps());
  const response = await routes["GET /documents/:id"]({
    actor: { id: "user-1", role: "viewer" },
    params: { id: "doc-1" },
  });

  assert.equal(response.status, 200);
  assert.equal(response.body.id, "doc-1");
});

test("rejects a caller without a role", async () => {
  const routes = createDocumentRoutes(makeDeps());
  await assert.rejects(
    routes["GET /documents/:id"]({ actor: {}, params: { id: "doc-1" } }),
    /role 'viewer' is required/,
  );
});

test("lists the documents owned by the caller", async () => {
  const routes = createDocumentRoutes(makeDeps());
  const response = await routes["GET /documents"]({
    actor: { id: "user-1", role: "viewer" },
    params: {},
  });

  assert.equal(response.status, 200);
  assert.equal(response.body.items.length, 1);
});
