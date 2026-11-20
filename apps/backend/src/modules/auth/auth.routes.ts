import { Router } from "express";
import { authenticate } from "../../middleware/auth.middleware.js";
import { validateBody } from "../../middleware/validate.middleware.js";
import { authController } from "./auth.controller.js";
import { loginRateLimiter, registerRateLimiter } from "./auth.limiter.js";
import { loginSchema, registerSchema } from "./auth.schema.js";

const authRouter = Router();

authRouter.post(
  "/register",
  registerRateLimiter,
  validateBody(registerSchema),
  (req, res, next) => {
    authController.register(req, res, next);
  }
);

authRouter.post(
  "/login",
  loginRateLimiter,
  validateBody(loginSchema),
  (req, res, next) => {
    authController.login(req, res, next);
  }
);

authRouter.get(
  "/me",
  authenticate,
  (req, res, next) => {
    authController.me(req, res, next);
  }
);

export default authRouter;
