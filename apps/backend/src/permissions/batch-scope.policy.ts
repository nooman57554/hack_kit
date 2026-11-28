import { Request } from "express";
import { ForbiddenError, UnauthorizedError } from "../utils/errors.js";
import {
  DEFAULT_ROLES,
  PERMISSIONS,
  type PermissionKey,
} from "./permission.registry.js";

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

function hasCrossCenterRole(roles: readonly string[] = []): boolean {
  return (
    roles.includes(DEFAULT_ROLES.STATE_OFFICE) ||
    roles.includes(DEFAULT_ROLES.ADMIN)
  );
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

  if (!hasCrossCenterRole(actor.roles)) {
    throw new ForbiddenError("Insufficient scope to view this batch");
  }

  return { crossCenter: true };
}

function resolveCentreScopedAction(
  actor: UserAuthorizationContext,
  requiredPermission: PermissionKey,
  errorMessage: string
): string {
  if (!actor.id) {
    throw new UnauthorizedError("User is not authenticated");
  }

  if (!actor.permissions?.has(requiredPermission)) {
    throw new ForbiddenError(
      `Forbidden: Missing required permission '${requiredPermission}'`
    );
  }

  const districtId = actor.districtId ?? null;
  const trainingCenterId = actor.trainingCenterId ?? null;

  if (districtId !== null || trainingCenterId === null) {
    throw new ForbiddenError(errorMessage);
  }

  return trainingCenterId;
}

export function resolveBatchImportCenterId(
  actor: UserAuthorizationContext
): string {
  return resolveCentreScopedAction(
    actor,
    PERMISSIONS.BATCHES_IMPORT.key,
    "Only Training Centre users with an assigned centre scope can import batches"
  );
}

export function resolveBatchSubmitCenterId(
  actor: UserAuthorizationContext
): string {
  return resolveCentreScopedAction(
    actor,
    PERMISSIONS.BATCHES_SUBMIT.key,
    "Only Training Centre users with an assigned centre scope can submit batches"
  );
}

export function resolveCrossCenterActionScope(
  actor: UserAuthorizationContext,
  requiredPermission: PermissionKey
): { crossCenter: true } {
  if (!actor.id) {
    throw new UnauthorizedError("User is not authenticated");
  }

  if (!actor.permissions?.has(requiredPermission)) {
    throw new ForbiddenError(
      `Forbidden: Missing required permission '${requiredPermission}'`
    );
  }

  const districtId = actor.districtId ?? null;
  const trainingCenterId = actor.trainingCenterId ?? null;

  if (districtId !== null || trainingCenterId !== null) {
    throw new ForbiddenError(
      "Scoped centre or district users cannot perform cross-centre review or certificate actions"
    );
  }

  if (!hasCrossCenterRole(actor.roles)) {
    throw new ForbiddenError(
      "Insufficient authority for cross-centre review or certificate actions"
    );
  }

  return { crossCenter: true };
}

function toAuthContext(req: Request): UserAuthorizationContext {
  if (!req.user) {
    throw new UnauthorizedError("User is not authenticated");
  }

  return {
    id: req.user.id,
    roles: req.user.roles,
    districtId: req.user.districtId,
    trainingCenterId: req.user.trainingCenterId,
    permissions: req.userPermissions,
  };
}

export function getBatchReadScopeFromRequest(req: Request): BatchReadScope {
  return resolveBatchReadScope(toAuthContext(req));
}

export function getBatchImportCenterIdFromRequest(req: Request): string {
  return resolveBatchImportCenterId(toAuthContext(req));
}

export function getBatchSubmitCenterIdFromRequest(req: Request): string {
  return resolveBatchSubmitCenterId(toAuthContext(req));
}

export function getCrossCenterActionScopeFromRequest(
  req: Request,
  requiredPermission: PermissionKey
): { crossCenter: true } {
  return resolveCrossCenterActionScope(toAuthContext(req), requiredPermission);
}
