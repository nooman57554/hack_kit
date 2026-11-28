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
  COURSES_READ: {
    key: "courses.read",
    description: "Read courses and course rule versions",
  },
  COURSES_MANAGE: {
    key: "courses.manage",
    description: "Create courses and publish rule versions",
  },
  BATCHES_IMPORT: {
    key: "batches.import",
    description: "Import candidate batches via CSV",
  },
  BATCHES_READ: {
    key: "batches.read",
    description: "Read batches and candidate qualification results",
  },
  BATCHES_SUBMIT: {
    key: "batches.submit",
    description: "Submit draft batches for review",
  },
  CANDIDATES_REVIEW: {
    key: "candidates.review",
    description: "Approve or reject qualified batch candidates",
  },
  CERTIFICATES_ISSUE: {
    key: "certificates.issue",
    description: "Issue certificates for approved candidates",
  },
  CERTIFICATES_REVOKE: {
    key: "certificates.revoke",
    description: "Revoke issued certificates",
  },
  PARTNER_KEYS_READ: {
    key: "partner_keys.read",
    description: "List partner API key metadata",
  },
  PARTNER_KEYS_MANAGE: {
    key: "partner_keys.manage",
    description: "Create and revoke partner API keys",
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
  STATE_OFFICE: "STATE_OFFICE",
  TRAINING_CENTER: "TRAINING_CENTER",
  DISTRICT_OFFICER: "DISTRICT_OFFICER",
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
  [DEFAULT_ROLES.STATE_OFFICE]: [
    PERMISSIONS.COURSES_READ.key,
    PERMISSIONS.COURSES_MANAGE.key,
    PERMISSIONS.BATCHES_READ.key,
    PERMISSIONS.CANDIDATES_REVIEW.key,
    PERMISSIONS.CERTIFICATES_ISSUE.key,
    PERMISSIONS.CERTIFICATES_REVOKE.key,
    PERMISSIONS.PARTNER_KEYS_READ.key,
    PERMISSIONS.PARTNER_KEYS_MANAGE.key,
  ],
  [DEFAULT_ROLES.TRAINING_CENTER]: [
    PERMISSIONS.COURSES_READ.key,
    PERMISSIONS.BATCHES_IMPORT.key,
    PERMISSIONS.BATCHES_READ.key,
    PERMISSIONS.BATCHES_SUBMIT.key,
  ],
  [DEFAULT_ROLES.DISTRICT_OFFICER]: [],
};
