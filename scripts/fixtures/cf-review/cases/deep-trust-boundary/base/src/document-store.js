export class NotFoundError extends Error {
  constructor(id) {
    super(`document '${id}' does not exist`);
    this.name = "NotFoundError";
    this.status = 404;
  }
}

export class DocumentStore {
  constructor(db) {
    this.db = db;
  }

  async get(id) {
    const rows = await this.db.query(
      "SELECT id, title, owner_id, locked FROM documents WHERE id = ?",
      [id],
    );
    if (rows.length === 0) {
      return null;
    }
    const row = rows[0];
    return {
      id: row.id,
      title: row.title,
      ownerId: row.owner_id,
      locked: row.locked === 1,
    };
  }

  async list(ownerId) {
    return this.db.query(
      "SELECT id, title FROM documents WHERE owner_id = ? ORDER BY updated_at DESC",
      [ownerId],
    );
  }
}

export function assertExists(document, id) {
  if (document === null || document === undefined) {
    throw new NotFoundError(id);
  }
  return document;
}
