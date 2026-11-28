import { Request, Response } from "express";
import { UnauthorizedError } from "../../utils/errors.js";
import { coursesService } from "./courses.service.js";

export class CoursesController {
  listCourses = async (_req: Request, res: Response): Promise<void> => {
    const courses = await coursesService.listCourses();
    res.status(200).json({
      success: true,
      data: { courses },
    });
  };

  createCourse = async (req: Request, res: Response): Promise<void> => {
    if (!req.user?.id) {
      throw new UnauthorizedError("User is not authenticated");
    }
    const result = await coursesService.createCourse(req.user.id, req.body);
    res.status(201).json({
      success: true,
      data: result,
    });
  };

  publishRuleVersion = async (req: Request, res: Response): Promise<void> => {
    if (!req.user?.id) {
      throw new UnauthorizedError("User is not authenticated");
    }
    const courseId = String(req.params.courseId);
    const ruleVersion = await coursesService.publishRuleVersion(
      req.user.id,
      courseId,
      req.body
    );
    res.status(201).json({
      success: true,
      data: { ruleVersion },
    });
  };

  listCourseRules = async (req: Request, res: Response): Promise<void> => {
    const courseId = String(req.params.courseId);
    const result = await coursesService.listCourseRules(courseId);
    res.status(200).json({
      success: true,
      data: result,
    });
  };
}

export const coursesController = new CoursesController();
