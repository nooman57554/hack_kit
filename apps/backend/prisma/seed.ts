import { PrismaClient } from "@prisma/client";
import {
  ALL_PERMISSIONS,
  DEFAULT_ROLES,
  DefaultRole,
  ROLE_PERMISSIONS_MATRIX,
} from "../src/permissions/permission.registry.js";
import "../src/config/env.js";

const prisma = new PrismaClient();

const ROLE_DESCRIPTIONS: Record<DefaultRole, string> = {
  [DEFAULT_ROLES.ADMIN]: "Administrator with full system access",
  [DEFAULT_ROLES.MANAGER]: "Manager with user viewing and task management permissions",
  [DEFAULT_ROLES.MEMBER]: "Standard member with personal task permissions",
};

async function main(): Promise<void> {
  console.log("Seeding database permissions and roles...");

  // 1. Upsert all registered permissions
  const permissionMap = new Map<string, string>();
  for (const perm of ALL_PERMISSIONS) {
    const record = await prisma.permission.upsert({
      where: { key: perm.key },
      update: { description: perm.description },
      create: { key: perm.key, description: perm.description },
    });
    permissionMap.set(record.key, record.id);
  }
  console.log(`Upserted ${permissionMap.size} permissions.`);

  // 2. Upsert default roles and assign permissions according to the matrix
  for (const roleName of Object.values(DEFAULT_ROLES)) {
    const roleRecord = await prisma.role.upsert({
      where: { name: roleName },
      update: { description: ROLE_DESCRIPTIONS[roleName] },
      create: { name: roleName, description: ROLE_DESCRIPTIONS[roleName] },
    });

    const expectedKeys = ROLE_PERMISSIONS_MATRIX[roleName];
    const expectedPermissionIds = expectedKeys.map((key) => {
      const id = permissionMap.get(key);
      if (!id) {
        throw new Error(`Permission key '${key}' not found in registry`);
      }
      return id;
    });

    // Upsert role-permission join records
    for (const permissionId of expectedPermissionIds) {
      await prisma.rolePermission.upsert({
        where: {
          roleId_permissionId: {
            roleId: roleRecord.id,
            permissionId,
          },
        },
        update: {},
        create: {
          roleId: roleRecord.id,
          permissionId,
        },
      });
    }

    // Clean up any revoked permissions for this default role without touching other records
    await prisma.rolePermission.deleteMany({
      where: {
        roleId: roleRecord.id,
        permissionId: {
          notIn: expectedPermissionIds,
        },
      },
    });

    console.log(
      `Role '${roleName}' configured with ${expectedPermissionIds.length} permissions.`
    );
  }

  console.log("Database seed completed successfully.");
}

main()
  .catch((e) => {
    console.error("Error during database seed:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
