-- AlterTable
ALTER TABLE "users" ADD COLUMN     "districtId" TEXT,
ADD COLUMN     "trainingCenterId" TEXT;

-- CreateTable
CREATE TABLE "districts" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "districts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "training_centers" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "districtId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "training_centers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "courses" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "currentRuleVersionId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "courses_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "course_rule_versions" (
    "id" TEXT NOT NULL,
    "courseId" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "minAttendancePercent" DOUBLE PRECISION NOT NULL,
    "minMarksPercent" DOUBLE PRECISION NOT NULL,
    "practicalRequired" BOOLEAN NOT NULL,
    "minPracticalPercent" DOUBLE PRECISION,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "course_rule_versions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "candidates" (
    "id" TEXT NOT NULL,
    "trainingCenterId" TEXT NOT NULL,
    "candidateRef" TEXT NOT NULL,
    "fullName" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "candidates_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "batches" (
    "id" TEXT NOT NULL,
    "trainingCenterId" TEXT NOT NULL,
    "courseId" TEXT NOT NULL,
    "ruleVersionId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "submittedAt" TIMESTAMP(3),

    CONSTRAINT "batches_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "batch_candidates" (
    "id" TEXT NOT NULL,
    "batchId" TEXT NOT NULL,
    "candidateId" TEXT NOT NULL,
    "candidateRefSnapshot" TEXT NOT NULL,
    "fullNameSnapshot" TEXT NOT NULL,
    "phoneSnapshot" TEXT NOT NULL,
    "attendancePercent" DOUBLE PRECISION NOT NULL,
    "marksPercent" DOUBLE PRECISION NOT NULL,
    "practicalPercent" DOUBLE PRECISION,
    "qualified" BOOLEAN NOT NULL,
    "qualificationReasons" JSONB NOT NULL,

    CONSTRAINT "batch_candidates_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "audit_logs" (
    "id" TEXT NOT NULL,
    "actorId" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "entityType" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "details" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audit_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "outbox_events" (
    "id" TEXT NOT NULL,
    "eventType" TEXT NOT NULL,
    "aggregateId" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "publishedAt" TIMESTAMP(3),
    "attempts" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "outbox_events_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "districts_code_key" ON "districts"("code");

-- CreateIndex
CREATE UNIQUE INDEX "training_centers_code_key" ON "training_centers"("code");

-- CreateIndex
CREATE INDEX "training_centers_districtId_idx" ON "training_centers"("districtId");

-- CreateIndex
CREATE UNIQUE INDEX "courses_code_key" ON "courses"("code");

-- CreateIndex
CREATE UNIQUE INDEX "courses_currentRuleVersionId_key" ON "courses"("currentRuleVersionId");

-- CreateIndex
CREATE INDEX "course_rule_versions_courseId_idx" ON "course_rule_versions"("courseId");

-- CreateIndex
CREATE INDEX "course_rule_versions_createdById_idx" ON "course_rule_versions"("createdById");

-- CreateIndex
CREATE UNIQUE INDEX "course_rule_versions_courseId_version_key" ON "course_rule_versions"("courseId", "version");

-- CreateIndex
CREATE INDEX "candidates_trainingCenterId_idx" ON "candidates"("trainingCenterId");

-- CreateIndex
CREATE UNIQUE INDEX "candidates_trainingCenterId_candidateRef_key" ON "candidates"("trainingCenterId", "candidateRef");

-- CreateIndex
CREATE INDEX "batches_trainingCenterId_idx" ON "batches"("trainingCenterId");

-- CreateIndex
CREATE INDEX "batches_courseId_idx" ON "batches"("courseId");

-- CreateIndex
CREATE INDEX "batches_ruleVersionId_idx" ON "batches"("ruleVersionId");

-- CreateIndex
CREATE INDEX "batches_createdById_idx" ON "batches"("createdById");

-- CreateIndex
CREATE INDEX "batch_candidates_candidateId_idx" ON "batch_candidates"("candidateId");

-- CreateIndex
CREATE UNIQUE INDEX "batch_candidates_batchId_candidateId_key" ON "batch_candidates"("batchId", "candidateId");

-- CreateIndex
CREATE INDEX "audit_logs_actorId_idx" ON "audit_logs"("actorId");

-- CreateIndex
CREATE INDEX "audit_logs_entityType_entityId_idx" ON "audit_logs"("entityType", "entityId");

-- CreateIndex
CREATE INDEX "audit_logs_createdAt_idx" ON "audit_logs"("createdAt");

-- CreateIndex
CREATE INDEX "outbox_events_publishedAt_createdAt_idx" ON "outbox_events"("publishedAt", "createdAt");

-- CreateIndex
CREATE INDEX "outbox_events_aggregateId_idx" ON "outbox_events"("aggregateId");

-- CreateIndex
CREATE INDEX "users_districtId_idx" ON "users"("districtId");

-- CreateIndex
CREATE INDEX "users_trainingCenterId_idx" ON "users"("trainingCenterId");

-- AddForeignKey
ALTER TABLE "training_centers" ADD CONSTRAINT "training_centers_districtId_fkey" FOREIGN KEY ("districtId") REFERENCES "districts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "users" ADD CONSTRAINT "users_districtId_fkey" FOREIGN KEY ("districtId") REFERENCES "districts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "users" ADD CONSTRAINT "users_trainingCenterId_fkey" FOREIGN KEY ("trainingCenterId") REFERENCES "training_centers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "courses" ADD CONSTRAINT "courses_currentRuleVersionId_fkey" FOREIGN KEY ("currentRuleVersionId") REFERENCES "course_rule_versions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "course_rule_versions" ADD CONSTRAINT "course_rule_versions_courseId_fkey" FOREIGN KEY ("courseId") REFERENCES "courses"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "course_rule_versions" ADD CONSTRAINT "course_rule_versions_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "candidates" ADD CONSTRAINT "candidates_trainingCenterId_fkey" FOREIGN KEY ("trainingCenterId") REFERENCES "training_centers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "batches" ADD CONSTRAINT "batches_trainingCenterId_fkey" FOREIGN KEY ("trainingCenterId") REFERENCES "training_centers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "batches" ADD CONSTRAINT "batches_courseId_fkey" FOREIGN KEY ("courseId") REFERENCES "courses"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "batches" ADD CONSTRAINT "batches_ruleVersionId_fkey" FOREIGN KEY ("ruleVersionId") REFERENCES "course_rule_versions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "batches" ADD CONSTRAINT "batches_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "batch_candidates" ADD CONSTRAINT "batch_candidates_batchId_fkey" FOREIGN KEY ("batchId") REFERENCES "batches"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "batch_candidates" ADD CONSTRAINT "batch_candidates_candidateId_fkey" FOREIGN KEY ("candidateId") REFERENCES "candidates"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
