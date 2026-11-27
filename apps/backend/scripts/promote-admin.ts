import { prisma } from "../src/config/database.js";
import { DEFAULT_ROLES } from "../src/permissions/permission.registry.js";
import "../src/config/env.js";

async function promoteUserToAdmin(): Promise<void> {
  const emailArg = process.argv[2];

  if (!emailArg || !emailArg.trim()) {
    console.error("Error: Please provide a user email address.");
    console.error("Usage: npm run user:promote-admin -- <email>");
    process.exitCode = 1;
    return;
  }

  const normalizedEmail = emailArg.trim().toLowerCase();

  const user = await prisma.user.findUnique({
    where: { email: normalizedEmail },
    select: { id: true, name: true, email: true },
  });

  if (!user) {
    console.error(`Error: User with email '${normalizedEmail}' not found.`);
    process.exitCode = 1;
    return;
  }

  const adminRole = await prisma.role.findUnique({
    where: { name: DEFAULT_ROLES.ADMIN },
  });

  if (!adminRole) {
    console.error(
      `Error: Role '${DEFAULT_ROLES.ADMIN}' not found in the database. Please run the seed script first.`
    );
    process.exitCode = 1;
    return;
  }

  // Idempotently assign ADMIN role without removing existing roles
  await prisma.userRole.upsert({
    where: {
      userId_roleId: {
        userId: user.id,
        roleId: adminRole.id,
      },
    },
    update: {},
    create: {
      userId: user.id,
      roleId: adminRole.id,
    },
  });

  console.log(
    `Success: User '${user.name}' (${user.email}) has been successfully granted the ADMIN role.`
  );
}

promoteUserToAdmin()
  .catch((err) => {
    console.error("Unexpected error during admin promotion:", err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
