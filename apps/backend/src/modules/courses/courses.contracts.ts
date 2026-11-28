import { z } from "zod";
import {
  createSuccessResponseSchema,
  isoDateTimeSchema,
} from "../../utils/contracts.js";

export const courseRuleVersionContractSchema = z.object({
  id: z.string().uuid(),
  courseId: z.string().uuid(),
  version: z.number().int().positive(),
  minAttendancePercent: z.number().min(0).max(100),
  minMarksPercent: z.number().min(0).max(100),
  practicalRequired: z.boolean(),
  minPracticalPercent: z.number().min(0).max(100).nullable(),
  createdById: z.string().uuid(),
  createdAt: isoDateTimeSchema,
});

export const courseSummaryContractSchema = z.object({
  id: z.string().uuid(),
  code: z.string(),
  name: z.string(),
  currentRuleVersionId: z.string().uuid().nullable(),
  createdAt: isoDateTimeSchema,
  updatedAt: isoDateTimeSchema,
});

export const courseWithCurrentRuleContractSchema = courseSummaryContractSchema.extend({
  currentRuleVersion: courseRuleVersionContractSchema.nullable(),
});

// GET /api/courses
export const getCoursesResponseSchema = createSuccessResponseSchema(
  z.object({
    courses: z.array(courseWithCurrentRuleContractSchema),
  })
);

// POST /api/courses
export const createCourseResponseSchema = createSuccessResponseSchema(
  z.object({
    course: courseSummaryContractSchema,
    ruleVersion: courseRuleVersionContractSchema,
  })
);

// POST /api/courses/:courseId/rules
export const publishCourseRuleResponseSchema = createSuccessResponseSchema(
  z.object({
    ruleVersion: courseRuleVersionContractSchema,
  })
);

// GET /api/courses/:courseId/rules
export const getCourseRulesResponseSchema = createSuccessResponseSchema(
  z.object({
    course: z.object({
      id: z.string().uuid(),
      code: z.string(),
      name: z.string(),
      currentRuleVersionId: z.string().uuid().nullable(),
    }),
    rules: z.array(courseRuleVersionContractSchema),
  })
);

export type CourseRuleVersionDto = z.infer<typeof courseRuleVersionContractSchema>;
export type CourseSummaryDto = z.infer<typeof courseSummaryContractSchema>;
export type GetCoursesResponse = z.infer<typeof getCoursesResponseSchema>;
export type CreateCourseResponse = z.infer<typeof createCourseResponseSchema>;
export type PublishCourseRuleResponse = z.infer<typeof publishCourseRuleResponseSchema>;
export type GetCourseRulesResponse = z.infer<typeof getCourseRulesResponseSchema>;
