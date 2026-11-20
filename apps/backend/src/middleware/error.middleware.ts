import { Request, Response, NextFunction } from "express";
import { ZodError } from "zod";
import { env } from "../config/env.js";
import { AppError } from "../utils/errors.js";

export function errorHandler(
  err: unknown,
  _req: Request,
  res: Response,
  _next: NextFunction
): void {
  // Handle Zod validation errors (HTTP 400)
  if (err instanceof ZodError) {
    res.status(400).json({
      success: false,
      error: {
        message: "Validation error",
        details: err.flatten().fieldErrors,
      },
    });
    return;
  }

  // Handle known operational application errors
  if (err instanceof AppError) {
    res.status(err.statusCode).json({
      success: false,
      error: {
        message: err.message,
        ...(err.details !== undefined ? { details: err.details } : {}),
      },
    });
    return;
  }

  // Handle unexpected internal server errors (HTTP 500)
  // Never expose internal error details, credentials or stack traces in production
  if (env.NODE_ENV !== "production") {
    console.error("Unhandled error:", err);
  }

  res.status(500).json({
    success: false,
    error: {
      message: "Internal server error",
    },
  });
}
