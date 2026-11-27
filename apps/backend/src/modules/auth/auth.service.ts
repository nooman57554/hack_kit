import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { Prisma } from "@prisma/client";
import { prisma } from "../../config/database.js";
import { env } from "../../config/env.js";
import { DEFAULT_ROLES } from "../../permissions/permission.registry.js";
import {
  AppError,
  ConflictError,
  NotFoundError,
  UnauthorizedError,
} from "../../utils/errors.js";
import { LoginInput, RegisterInput } from "./auth.schema.js";

const BCRYPT_COST = 10;
// Precomputed dummy hash (cost 10) to equalize login timing when an email is unknown
const DUMMY_PASSWORD_HASH =
  "$2b$10$1u.D6pxLC6ySptBBh8rFHuF41UZaqosewqJZv7q8BapUQclXU2uTC";

export interface SafeUser {
  id: string;
  name: string;
  email: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface AuthResponse {
  user: SafeUser;
  token: string;
}

export interface CurrentUserResponse {
  user: SafeUser & {
    roles: string[];
    permissions: string[];
  };
}

export class AuthService {
  async register(input: RegisterInput): Promise<AuthResponse> {
    const { name, email, password } = input;

    // Check if user already exists
    const existingUser = await prisma.user.findUnique({
      where: { email },
    });
    if (existingUser) {
      throw new ConflictError("Email address is already registered");
    }

    const memberRole = await prisma.role.findUnique({
      where: { name: DEFAULT_ROLES.MEMBER },
    });
    if (!memberRole) {
      throw new AppError("Default MEMBER role not found in database", 500);
    }

    const hashedPassword = await bcrypt.hash(password, BCRYPT_COST);

    try {
      const user = await prisma.user.create({
        data: {
          name,
          email,
          password: hashedPassword,
          userRoles: {
            create: {
              roleId: memberRole.id,
            },
          },
        },
        select: {
          id: true,
          name: true,
          email: true,
          createdAt: true,
          updatedAt: true,
        },
      });

      const token = jwt.sign({ userId: user.id }, env.JWT_SECRET, {
        algorithm: "HS256",
        expiresIn: "1h",
      });

      return { user, token };
    } catch (error) {
      // Handle concurrent duplicate registrations safely
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === "P2002"
      ) {
        throw new ConflictError("Email address is already registered");
      }
      throw error;
    }
  }

  async login(input: LoginInput): Promise<AuthResponse> {
    const { email, password } = input;

    const user = await prisma.user.findUnique({
      where: { email },
    });

    const passwordHashToCompare = user?.password ?? DUMMY_PASSWORD_HASH;
    const isPasswordValid = await bcrypt.compare(password, passwordHashToCompare);

    if (!user || !isPasswordValid) {
      throw new UnauthorizedError("Invalid email or password");
    }

    const token = jwt.sign({ userId: user.id }, env.JWT_SECRET, {
      algorithm: "HS256",
      expiresIn: "1h",
    });

    return {
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        createdAt: user.createdAt,
        updatedAt: user.updatedAt,
      },
      token,
    };
  }

  async getCurrentUser(userId: string): Promise<CurrentUserResponse> {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        name: true,
        email: true,
        createdAt: true,
        updatedAt: true,
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
      throw new NotFoundError("User not found");
    }

    const roles: string[] = [];
    const permissionsSet = new Set<string>();

    for (const ur of user.userRoles) {
      roles.push(ur.role.name);
      for (const rp of ur.role.rolePermissions) {
        permissionsSet.add(rp.permission.key);
      }
    }

    return {
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        createdAt: user.createdAt,
        updatedAt: user.updatedAt,
        roles,
        permissions: Array.from(permissionsSet),
      },
    };
  }
}

export const authService = new AuthService();
