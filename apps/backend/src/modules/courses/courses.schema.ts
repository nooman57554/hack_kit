import { z } from "zod";

export const courseIdParamsSchema = z.object({
  courseId: z.string().uuid("courseId must be a valid UUID"),
});

const ruleThresholdFields = {
  minAttendancePercent: z
    .number({ message: "minAttendancePercent must be a number" })
    .finite()
    .min(0, "minAttendancePercent must be at least 0")
    .max(100, "minAttendancePercent must be at most 100"),
  minMarksPercent: z
    .number({ message: "minMarksPercent must be a number" })
    .finite()
    .min(0, "minMarksPercent must be at least 0")
    .max(100, "minMarksPercent must be at most 100"),
  practicalRequired: z.boolean({ message: "practicalRequired must be a boolean" }),
  minPracticalPercent: z
    .number({ message: "minPracticalPercent must be a number" })
    .finite()
    .min(0, "minPracticalPercent must be at least 0")
    .max(100, "minPracticalPercent must be at most 100")
    .nullable()
    .optional(),
};

function validatePracticalThreshold(
  data: {
    practicalRequired: boolean;
    minPracticalPercent?: number | null;
  },
  ctx: z.RefinementCtx
): void {
  if (data.practicalRequired && (data.minPracticalPercent === null || data.minPracticalPercent === undefined)) {
    ctx.addIssue({
      code: "custom",
      path: ["minPracticalPercent"],
      message: "minPracticalPercent is required when practicalRequired is true",
    });
  }
}

export const createCourseSchema = z
  .object({
    code: z
      .string()
      .trim()
      .min(1, "Course code is required")
      .max(50, "Course code must be at most 50 characters"),
    name: z
      .string()
      .trim()
      .min(1, "Course name is required")
      .max(200, "Course name must be at most 200 characters"),
    ...ruleThresholdFields,
  })
  .superRefine(validatePracticalThreshold);

export const createCourseRuleSchema = z
  .object({
    ...ruleThresholdFields,
  })
  .superRefine(validatePracticalThreshold);

export type CreateCourseInput = z.infer<typeof createCourseSchema>;
export type CreateCourseRuleInput = z.infer<typeof createCourseRuleSchema>;
