import { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";
import { env } from "../config/env.js";
import { UnauthorizedError } from "../utils/errors.js";

export interface JwtTokenPayload {
  userId: string;
  iat?: number;
  exp?: number;
}

export function authenticate(req: Request, _res: Response, next: NextFunction): void {
  const authHeader = req.headers.authorization;
  if (!authHeader) {
    return next(new UnauthorizedError("Authentication token is required"));
  }

  const parts = authHeader.split(" ");
  if (parts.length !== 2 || parts[0] !== "Bearer" || !parts[1] || /\s/.test(parts[1])) {
    return next(new UnauthorizedError("Invalid authorization format. Expected 'Bearer <token>'"));
  }

  const token = parts[1];

  try {
    const decoded = jwt.verify(token, env.JWT_SECRET, {
      algorithms: ["HS256"],
    }) as JwtTokenPayload;

    if (
      !decoded ||
      typeof decoded !== "object" ||
      typeof decoded.userId !== "string" ||
      !decoded.userId.trim() ||
      typeof decoded.exp !== "number" ||
      !Number.isFinite(decoded.exp)
    ) {
      return next(new UnauthorizedError("Invalid token payload"));
    }

    req.user = {
      id: decoded.userId,
    };

    next();
  } catch (error) {
    if (error instanceof jwt.TokenExpiredError) {
      return next(new UnauthorizedError("Token has expired"));
    }
    if (error instanceof jwt.JsonWebTokenError) {
      return next(new UnauthorizedError("Invalid token"));
    }
    return next(new UnauthorizedError("Authentication failed"));
  }
}
