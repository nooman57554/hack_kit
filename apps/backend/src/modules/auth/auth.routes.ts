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
  authController.register
);

authRouter.post(
  "/login",
  loginRateLimiter,
  validateBody(loginSchema),
  authController.login
);

authRouter.get("/me", authenticate, authController.me);

export default authRouter;
