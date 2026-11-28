import { Prisma } from "@prisma/client";
import { prisma } from "../../config/database.js";
import {
  ConflictError,
  ForbiddenError,
  NotFoundError,
  UnauthorizedError,
} from "../../utils/errors.js";
import { CreateCourseInput, CreateCourseRuleInput } from "./courses.schema.js";

const ruleVersionSelect = {
  id: true,
  courseId: true,
  version: true,
  minAttendancePercent: true,
  minMarksPercent: true,
  practicalRequired: true,
  minPracticalPercent: true,
  createdById: true,
  createdAt: true,
} as const;

export class CoursesService {
  private async assertStateOfficeScope(actorId: string): Promise<void> {
    const actor = await prisma.user.findUnique({
      where: { id: actorId },
      select: {
        id: true,
        districtId: true,
        trainingCenterId: true,
      },
    });

    if (!actor) {
      throw new UnauthorizedError("Authenticated user no longer exists");
    }

    if (actor.districtId !== null || actor.trainingCenterId !== null) {
      throw new ForbiddenError(
        "Only State Office users without centre or district scope can manage courses and rules"
      );
    }
  }

  async listCourses() {
    return prisma.course.findMany({
      orderBy: { code: "asc" },
      select: {
        id: true,
        code: true,
        name: true,
        currentRuleVersionId: true,
        createdAt: true,
        updatedAt: true,
        currentRuleVersion: {
          select: ruleVersionSelect,
        },
      },
    });
  }

  async createCourse(actorId: string, input: CreateCourseInput) {
    await this.assertStateOfficeScope(actorId);

    const minPracticalPercent = input.practicalRequired
      ? input.minPracticalPercent!
      : null;

    try {
      return await prisma.$transaction(async (tx) => {
        const existing = await tx.course.findUnique({
          where: { code: input.code },
          select: { id: true },
        });
        if (existing) {
          throw new ConflictError(`Course code '${input.code}' already exists`);
        }

        const course = await tx.course.create({
          data: {
            code: input.code,
            name: input.name,
            currentRuleVersionId: null,
          },
        });

        const ruleVersion = await tx.courseRuleVersion.create({
          data: {
            courseId: course.id,
            version: 1,
            minAttendancePercent: input.minAttendancePercent,
            minMarksPercent: input.minMarksPercent,
            practicalRequired: input.practicalRequired,
            minPracticalPercent,
            createdById: actorId,
          },
          select: ruleVersionSelect,
        });

        const updatedCourse = await tx.course.update({
          where: { id: course.id },
          data: { currentRuleVersionId: ruleVersion.id },
          select: {
            id: true,
            code: true,
            name: true,
            currentRuleVersionId: true,
            createdAt: true,
            updatedAt: true,
          },
        });

        await tx.auditLog.create({
          data: {
            actorId,
            action: "COURSE_CREATED",
            entityType: "COURSE",
            entityId: updatedCourse.id,
            details: {
              code: updatedCourse.code,
              name: updatedCourse.name,
              ruleVersionId: ruleVersion.id,
              version: ruleVersion.version,
            },
          },
        });

        return {
          course: updatedCourse,
          ruleVersion,
        };
      });
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === "P2002"
      ) {
        throw new ConflictError(`Course code '${input.code}' already exists`);
      }
      throw error;
    }
  }

  async publishRuleVersion(
    actorId: string,
    courseId: string,
    input: CreateCourseRuleInput
  ) {
    await this.assertStateOfficeScope(actorId);

    const minPracticalPercent = input.practicalRequired
      ? input.minPracticalPercent!
      : null;

    return prisma.$transaction(async (tx) => {
      // Lock the course row to serialize rule version numbering and pointer updates
      const lockedCourses = await tx.$queryRaw<Array<{ id: string }>>`
        SELECT id FROM "courses" WHERE id = ${courseId} FOR UPDATE
      `;

      if (lockedCourses.length === 0) {
        throw new NotFoundError("Course not found");
      }

      const maxVersionResult = await tx.courseRuleVersion.aggregate({
        where: { courseId },
        _max: { version: true },
      });

      const nextVersion = (maxVersionResult._max.version ?? 0) + 1;

      const ruleVersion = await tx.courseRuleVersion.create({
        data: {
          courseId,
          version: nextVersion,
          minAttendancePercent: input.minAttendancePercent,
          minMarksPercent: input.minMarksPercent,
          practicalRequired: input.practicalRequired,
          minPracticalPercent,
          createdById: actorId,
        },
        select: ruleVersionSelect,
      });

      await tx.course.update({
        where: { id: courseId },
        data: { currentRuleVersionId: ruleVersion.id },
      });

      await tx.auditLog.create({
        data: {
          actorId,
          action: "COURSE_RULE_PUBLISHED",
          entityType: "COURSE_RULE_VERSION",
          entityId: ruleVersion.id,
          details: {
            courseId,
            version: ruleVersion.version,
            minAttendancePercent: ruleVersion.minAttendancePercent,
            minMarksPercent: ruleVersion.minMarksPercent,
            practicalRequired: ruleVersion.practicalRequired,
            minPracticalPercent: ruleVersion.minPracticalPercent,
          },
        },
      });

      return ruleVersion;
    });
  }

  async listCourseRules(courseId: string) {
    const course = await prisma.course.findUnique({
      where: { id: courseId },
      select: {
        id: true,
        code: true,
        name: true,
        currentRuleVersionId: true,
      },
    });

    if (!course) {
      throw new NotFoundError("Course not found");
    }

    const rules = await prisma.courseRuleVersion.findMany({
      where: { courseId },
      orderBy: { version: "desc" },
      select: ruleVersionSelect,
    });

    return {
      course,
      rules,
    };
  }
}

export const coursesService = new CoursesService();
