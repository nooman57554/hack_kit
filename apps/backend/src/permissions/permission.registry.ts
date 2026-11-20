export const PERMISSIONS = {
  USERS_READ: {
    key: "users.read",
    description: "Read user accounts and profiles",
  },
  USERS_CREATE: {
    key: "users.create",
    description: "Create new user accounts",
  },
  USERS_UPDATE: {
    key: "users.update",
    description: "Update existing user accounts",
  },
  USERS_DELETE: {
    key: "users.delete",
    description: "Delete user accounts",
  },
  TASKS_READ: {
    key: "tasks.read",
    description: "Read tasks",
  },
  TASKS_CREATE: {
    key: "tasks.create",
    description: "Create new tasks",
  },
  TASKS_UPDATE: {
    key: "tasks.update",
    description: "Update tasks",
  },
  TASKS_DELETE: {
    key: "tasks.delete",
    description: "Delete tasks",
  },
  ROLES_MANAGE: {
    key: "roles.manage",
    description: "Manage system roles and their permission mappings",
  },
  PERMISSIONS_MANAGE: {
    key: "permissions.manage",
    description: "Manage system permissions",
  },
} as const;

export type PermissionDefinition = (typeof PERMISSIONS)[keyof typeof PERMISSIONS];
export type PermissionKey = PermissionDefinition["key"];

export const ALL_PERMISSIONS: readonly PermissionDefinition[] = Object.values(PERMISSIONS);
export const ALL_PERMISSION_KEYS: readonly PermissionKey[] = ALL_PERMISSIONS.map((p) => p.key);

export const DEFAULT_ROLES = {
  ADMIN: "ADMIN",
  MANAGER: "MANAGER",
  MEMBER: "MEMBER",
} as const;

export type DefaultRole = (typeof DEFAULT_ROLES)[keyof typeof DEFAULT_ROLES];

export const ROLE_PERMISSIONS_MATRIX: Record<DefaultRole, readonly PermissionKey[]> = {
  [DEFAULT_ROLES.ADMIN]: ALL_PERMISSION_KEYS,
  [DEFAULT_ROLES.MANAGER]: [
    PERMISSIONS.USERS_READ.key,
    PERMISSIONS.TASKS_READ.key,
    PERMISSIONS.TASKS_CREATE.key,
    PERMISSIONS.TASKS_UPDATE.key,
    PERMISSIONS.TASKS_DELETE.key,
  ],
  [DEFAULT_ROLES.MEMBER]: [
    PERMISSIONS.TASKS_READ.key,
    PERMISSIONS.TASKS_CREATE.key,
    PERMISSIONS.TASKS_UPDATE.key,
  ],
};
