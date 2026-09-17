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
      listSorted: async () => [{ id: "doc-1", title: "Report" }],
      remove: async () => {},
      ...overrides.store,
    },
    fs: {
      readFile: async () => "DUMMY_EXPORT_BODY",
      ...overrides.fs,
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
    query: {},
  });

  assert.equal(response.status, 200);
  assert.equal(response.body.total, 1);
});

test("exports a document body for a viewer", async () => {
  const routes = createDocumentRoutes(makeDeps());
  const response = await routes["GET /documents/:id/export"]({
    actor: { id: "user-1", role: "viewer" },
    params: { id: "doc-1" },
    query: { file: "doc-1.txt" },
  });

  assert.equal(response.status, 200);
  assert.equal(response.body, "DUMMY_EXPORT_BODY");
  assert.equal(response.headers["content-type"], "text/plain");
});
