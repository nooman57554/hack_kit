import { Request, Response } from "express";
import { UnauthorizedError } from "../../utils/errors.js";
import { authService } from "./auth.service.js";

export class AuthController {
  register = async (req: Request, res: Response): Promise<void> => {
    const result = await authService.register(req.body);
    res.status(201).json({
      success: true,
      data: result,
    });
  };

  login = async (req: Request, res: Response): Promise<void> => {
    const result = await authService.login(req.body);
    res.status(200).json({
      success: true,
      data: result,
    });
  };

  me = async (req: Request, res: Response): Promise<void> => {
    if (!req.user?.id) {
      throw new UnauthorizedError("User is not authenticated");
    }
    const result = await authService.getCurrentUser(req.user.id);
    res.status(200).json({
      success: true,
      data: result,
    });
  };
}

export const authController = new AuthController();
