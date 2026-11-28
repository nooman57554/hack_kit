import bcrypt from "bcryptjs";
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
  [DEFAULT_ROLES.STATE_OFFICE]:
    "State Office authority for courses, qualifying rules, and cross-centre batch visibility",
  [DEFAULT_ROLES.TRAINING_CENTER]:
    "Training Centre operator for centre-scoped batch CSV imports and result viewing",
  [DEFAULT_ROLES.DISTRICT_OFFICER]:
    "District Officer authority (no Phase 1 course or batch actions)",
};

const DEMO_PASSWORD_PLAINTEXT = process.env.DEMO_USER_PASSWORD || "SkillPassDemo123!";

async function main(): Promise<void> {
  console.log("Seeding database permissions, roles, and Phase 1 demo data...");

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
  const roleMap = new Map<DefaultRole, string>();
  for (const roleName of Object.values(DEFAULT_ROLES)) {
    const roleRecord = await prisma.role.upsert({
      where: { name: roleName },
      update: { description: ROLE_DESCRIPTIONS[roleName] },
      create: { name: roleName, description: ROLE_DESCRIPTIONS[roleName] },
    });
    roleMap.set(roleName, roleRecord.id);

    const expectedKeys = ROLE_PERMISSIONS_MATRIX[roleName];
    const expectedPermissionIds = expectedKeys.map((key) => {
      const id = permissionMap.get(key);
      if (!id) {
        throw new Error(`Permission key '${key}' not found in registry`);
      }
      return id;
    });

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

  // 3. Upsert demo districts
  const northDistrict = await prisma.district.upsert({
    where: { code: "DIST-NORTH" },
    update: { name: "North District" },
    create: { code: "DIST-NORTH", name: "North District" },
  });

  const southDistrict = await prisma.district.upsert({
    where: { code: "DIST-SOUTH" },
    update: { name: "South District" },
    create: { code: "DIST-SOUTH", name: "South District" },
  });

  // 4. Upsert demo training centres
  const northCenter = await prisma.trainingCenter.upsert({
    where: { code: "TC-NORTH-01" },
    update: { name: "North Skill Academy", districtId: northDistrict.id },
    create: {
      code: "TC-NORTH-01",
      name: "North Skill Academy",
      districtId: northDistrict.id,
    },
  });

  const southCenter = await prisma.trainingCenter.upsert({
    where: { code: "TC-SOUTH-01" },
    update: { name: "South Technical Institute", districtId: southDistrict.id },
    create: {
      code: "TC-SOUTH-01",
      name: "South Technical Institute",
      districtId: southDistrict.id,
    },
  });

  // 5. Upsert scoped demo users
  const demoPasswordHash = await bcrypt.hash(DEMO_PASSWORD_PLAINTEXT, 10);

  const demoUsers: Array<{
    name: string;
    email: string;
    role: DefaultRole;
    districtId: string | null;
    trainingCenterId: string | null;
  }> = [
    {
      name: "State Office Officer",
      email: "state.officer@skillpass.local",
      role: DEFAULT_ROLES.STATE_OFFICE,
      districtId: null,
      trainingCenterId: null,
    },
    {
      name: "North Centre Operator",
      email: "centre.north@skillpass.local",
      role: DEFAULT_ROLES.TRAINING_CENTER,
      districtId: null,
      trainingCenterId: northCenter.id,
    },
    {
      name: "South Centre Operator",
      email: "centre.south@skillpass.local",
      role: DEFAULT_ROLES.TRAINING_CENTER,
      districtId: null,
      trainingCenterId: southCenter.id,
    },
    {
      name: "North District Officer",
      email: "district.north@skillpass.local",
      role: DEFAULT_ROLES.DISTRICT_OFFICER,
      districtId: northDistrict.id,
      trainingCenterId: null,
    },
  ];

  let stateOfficeUserId: string | null = null;

  for (const demo of demoUsers) {
    const user = await prisma.user.upsert({
      where: { email: demo.email },
      update: {
        name: demo.name,
        districtId: demo.districtId,
        trainingCenterId: demo.trainingCenterId,
      },
      create: {
        name: demo.name,
        email: demo.email,
        password: demoPasswordHash,
        districtId: demo.districtId,
        trainingCenterId: demo.trainingCenterId,
      },
    });

    if (demo.role === DEFAULT_ROLES.STATE_OFFICE) {
      stateOfficeUserId = user.id;
    }

    const roleId = roleMap.get(demo.role);
    if (!roleId) {
      throw new Error(`Role '${demo.role}' missing`);
    }

    await prisma.userRole.upsert({
      where: {
        userId_roleId: {
          userId: user.id,
          roleId,
        },
      },
      update: {},
      create: {
        userId: user.id,
        roleId,
      },
    });
  }

  // 6. Seed demo courses with initial rule version idempotently
  if (stateOfficeUserId) {
    const demoCourses = [
      {
        code: "FSWD-101",
        name: "Full-Stack Web Development",
        minAttendancePercent: 75,
        minMarksPercent: 60,
        practicalRequired: true,
        minPracticalPercent: 70,
      },
      {
        code: "DATA-101",
        name: "Data Analytics Foundations",
        minAttendancePercent: 80,
        minMarksPercent: 65,
        practicalRequired: false,
        minPracticalPercent: null,
      },
    ];

    for (const c of demoCourses) {
      const existing = await prisma.course.findUnique({ where: { code: c.code } });
      if (!existing) {
        await prisma.$transaction(async (tx) => {
          const course = await tx.course.create({
            data: {
              code: c.code,
              name: c.name,
              currentRuleVersionId: null,
            },
          });

          const ruleVersion = await tx.courseRuleVersion.create({
            data: {
              courseId: course.id,
              version: 1,
              minAttendancePercent: c.minAttendancePercent,
              minMarksPercent: c.minMarksPercent,
              practicalRequired: c.practicalRequired,
              minPracticalPercent: c.minPracticalPercent,
              createdById: stateOfficeUserId!,
            },
          });

          await tx.course.update({
            where: { id: course.id },
            data: { currentRuleVersionId: ruleVersion.id },
          });
        });
      }
    }
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
