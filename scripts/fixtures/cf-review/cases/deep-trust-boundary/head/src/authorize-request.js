const ROLE_RANK = {
  viewer: 1,
  editor: 2,
  owner: 3,
};

export class AuthorizationError extends Error {
  constructor(message) {
    super(message);
    this.name = "AuthorizationError";
    this.status = 403;
  }
}

export function hasRole(actor, role) {
  const actorRank = ROLE_RANK[actor && actor.role] || 0;
  const requiredRank = ROLE_RANK[role] || Number.POSITIVE_INFINITY;
  return actorRank >= requiredRank;
}

export function assertRole(actor, role) {
  if (!hasRole(actor, role)) {
    throw new AuthorizationError(`role '${role}' is required`);
  }
}

export function canDelete(actor, document) {
  if (!hasRole(actor, "editor")) {
    return false;
  }
  if (document.locked === true) {
    return false;
  }
  return document.ownerId === (actor && actor.id) || hasRole(actor, "owner");
}
