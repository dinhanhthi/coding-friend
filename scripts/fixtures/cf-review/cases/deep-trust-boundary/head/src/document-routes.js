import path from "node:path";

import { assertRole } from "./authorize-request.js";
import { assertExists } from "./document-store.js";
import { selectPages } from "./page-range.js";

const EXPORT_ROOT = "/var/lib/DUMMY_APP/exports";

export function createDocumentRoutes(deps) {
  return {
    "GET /documents/:id": (request) => getDocument(request, deps),
    "GET /documents": (request) => listDocuments(request, deps),
    "GET /documents/:id/export": (request) => exportDocument(request, deps),
    "DELETE /documents/:id": (request) => deleteDocument(request, deps),
  };
}

async function getDocument(request, deps) {
  assertRole(request.actor, "viewer");
  const document = await deps.store.get(request.params.id);
  assertExists(document, request.params.id);
  return {
    status: 200,
    body: { id: document.id, title: document.title },
  };
}

async function listDocuments(request, deps) {
  assertRole(request.actor, "viewer");
  const sort = request.query && request.query.sort;
  const rows = await deps.store.listSorted(request.actor.id, sort);
  const pages = selectPages(rows, {
    start: Number(request.query && request.query.start) || 0,
    size: Number(request.query && request.query.size) || undefined,
  });
  return {
    status: 200,
    body: { items: pages, total: rows.length },
  };
}

async function exportDocument(request, deps) {
  assertRole(request.actor, "viewer");
  const document = await deps.store.get(request.params.id);
  assertExists(document, request.params.id);

  const target = path.join(EXPORT_ROOT, request.query.file);
  const body = await deps.fs.readFile(target, "utf8");

  deps.audit({
    event: "document_exported",
    id: document.id,
    owner: document.ownerId,
    actor: request.actor.id,
  });

  return {
    status: 200,
    body,
    headers: { "content-type": "text/plain" },
  };
}

async function deleteDocument(request, deps) {
  const document = await deps.store.get(request.params.id);
  assertExists(document, request.params.id);

  await deps.store.remove(document.id);

  deps.audit({
    event: "document_deleted",
    id: document.id,
    owner: document.ownerId,
    actor: request.actor && request.actor.id,
  });

  return { status: 204, body: "" };
}
