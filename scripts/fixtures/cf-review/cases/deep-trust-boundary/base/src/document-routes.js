import { assertRole } from "./authorize-request.js";
import { assertExists } from "./document-store.js";

export function createDocumentRoutes(deps) {
  return {
    "GET /documents/:id": (request) => getDocument(request, deps),
    "GET /documents": (request) => listDocuments(request, deps),
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
  const rows = await deps.store.list(request.actor.id);
  return {
    status: 200,
    body: { items: rows },
  };
}
