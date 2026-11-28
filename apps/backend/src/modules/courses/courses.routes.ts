import { Router } from "express";
import { authenticate } from "../../middleware/auth.middleware.js";
import { requirePermission } from "../../middleware/permission.middleware.js";
import {
  validateBody,
  validateParams,
} from "../../middleware/validate.middleware.js";
import { PERMISSIONS } from "../../permissions/permission.registry.js";
import { coursesController } from "./courses.controller.js";
import {
  courseIdParamsSchema,
  createCourseRuleSchema,
  createCourseSchema,
} from "./courses.schema.js";

const coursesRouter = Router();

coursesRouter.get(
  "/",
  authenticate,
  requirePermission(PERMISSIONS.COURSES_READ.key),
  coursesController.listCourses
);

coursesRouter.post(
  "/",
  authenticate,
  requirePermission(PERMISSIONS.COURSES_MANAGE.key),
  validateBody(createCourseSchema),
  coursesController.createCourse
);

coursesRouter.post(
  "/:courseId/rules",
  authenticate,
  requirePermission(PERMISSIONS.COURSES_MANAGE.key),
  validateParams(courseIdParamsSchema),
  validateBody(createCourseRuleSchema),
  coursesController.publishRuleVersion
);

coursesRouter.get(
  "/:courseId/rules",
  authenticate,
  requirePermission(PERMISSIONS.COURSES_READ.key),
  validateParams(courseIdParamsSchema),
  coursesController.listCourseRules
);

export default coursesRouter;
