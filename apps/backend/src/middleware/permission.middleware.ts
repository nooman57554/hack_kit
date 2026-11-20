import { Request, Response, NextFunction } from "express";
import { prisma } from "../config/database.js";
import { PermissionKey } from "../permissions/permission.registry.js";
import { ForbiddenError, UnauthorizedError } from "../utils/errors.js";

export function requirePermission(permissionKey: PermissionKey) {
  return async (req: Request, _res: Response, next: NextFunction): Promise<void> => {
    try {
      if (!req.user || !req.user.id) {
        return next(new UnauthorizedError("User is not authenticated"));
      }

      // Load user roles and permissions once per request
      if (!req.userPermissions) {
        const user = await prisma.user.findUnique({
          where: { id: req.user.id },
          select: {
            id: true,
            userRoles: {
              select: {
                role: {
                  select: {
                    name: true,
                    rolePermissions: {
                      select: {
                        permission: {
                          select: {
                            key: true,
                          },
                        },
                      },
                    },
                  },
                },
              },
            },
          },
        });

        if (!user) {
          return next(new UnauthorizedError("Authenticated user no longer exists"));
        }

        const permissions = new Set<string>();
        const roles: string[] = [];

        for (const ur of user.userRoles) {
          roles.push(ur.role.name);
          for (const rp of ur.role.rolePermissions) {
            permissions.add(rp.permission.key);
          }
        }

        req.user.roles = roles;
        req.userPermissions = permissions;
      }

      if (!req.userPermissions.has(permissionKey)) {
        return next(
          new ForbiddenError(`Forbidden: Missing required permission '${permissionKey}'`)
        );
      }

      next();
    } catch (error) {
      next(error);
    }
  };
}
