import { Request } from "express";
import { ForbiddenError, UnauthorizedError } from "../utils/errors.js";
import { DEFAULT_ROLES, PERMISSIONS } from "./permission.registry.js";

export type BatchReadScope =
  | { crossCenter: true }
  | { crossCenter: false; trainingCenterId: string };

export interface UserAuthorizationContext {
  id: string;
  roles?: string[];
  districtId?: string | null;
  trainingCenterId?: string | null;
  permissions?: ReadonlySet<string>;
}

export function resolveBatchReadScope(
  actor: UserAuthorizationContext
): BatchReadScope {
  if (!actor.id) {
    throw new UnauthorizedError("User is not authenticated");
  }

  if (!actor.permissions?.has(PERMISSIONS.BATCHES_READ.key)) {
    throw new ForbiddenError(
      `Forbidden: Missing required permission '${PERMISSIONS.BATCHES_READ.key}'`
    );
  }

  const districtId = actor.districtId ?? null;
  const trainingCenterId = actor.trainingCenterId ?? null;

  if (districtId !== null && trainingCenterId !== null) {
    throw new ForbiddenError("Invalid user scope configuration");
  }

  if (trainingCenterId !== null) {
    return {
      crossCenter: false,
      trainingCenterId,
    };
  }

  if (districtId !== null) {
    throw new ForbiddenError("Insufficient scope to view this batch");
  }

  const roles = actor.roles ?? [];
  const hasCrossCenterAccess =
    roles.includes(DEFAULT_ROLES.STATE_OFFICE) ||
    roles.includes(DEFAULT_ROLES.ADMIN);

  if (!hasCrossCenterAccess) {
    throw new ForbiddenError("Insufficient scope to view this batch");
  }

  return { crossCenter: true };
}

export function resolveBatchImportCenterId(
  actor: UserAuthorizationContext
): string {
  if (!actor.id) {
    throw new UnauthorizedError("User is not authenticated");
  }

  if (!actor.permissions?.has(PERMISSIONS.BATCHES_IMPORT.key)) {
    throw new ForbiddenError(
      `Forbidden: Missing required permission '${PERMISSIONS.BATCHES_IMPORT.key}'`
    );
  }

  const districtId = actor.districtId ?? null;
  const trainingCenterId = actor.trainingCenterId ?? null;

  if (districtId !== null || trainingCenterId === null) {
    throw new ForbiddenError(
      "Only Training Centre users with an assigned centre scope can import batches"
    );
  }

  return trainingCenterId;
}

export function getBatchReadScopeFromRequest(req: Request): BatchReadScope {
  if (!req.user) {
    throw new UnauthorizedError("User is not authenticated");
  }

  return resolveBatchReadScope({
    id: req.user.id,
    roles: req.user.roles,
    districtId: req.user.districtId,
    trainingCenterId: req.user.trainingCenterId,
    permissions: req.userPermissions,
  });
}

export function getBatchImportCenterIdFromRequest(req: Request): string {
  if (!req.user) {
    throw new UnauthorizedError("User is not authenticated");
  }

  return resolveBatchImportCenterId({
    id: req.user.id,
    roles: req.user.roles,
    districtId: req.user.districtId,
    trainingCenterId: req.user.trainingCenterId,
    permissions: req.userPermissions,
  });
}
