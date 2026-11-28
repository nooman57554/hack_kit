-- AlterTable
ALTER TABLE "batch_candidates" ADD COLUMN     "reviewReason" TEXT,
ADD COLUMN     "reviewStatus" TEXT NOT NULL DEFAULT 'PENDING',
ADD COLUMN     "reviewedAt" TIMESTAMP(3),
ADD COLUMN     "reviewedById" TEXT;

-- CreateTable
CREATE TABLE "certificates" (
    "id" TEXT NOT NULL,
    "batchCandidateId" TEXT NOT NULL,
    "verificationCode" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'ISSUED',
    "issuedById" TEXT NOT NULL,
    "issuedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "pdfBytes" BYTEA NOT NULL,
    "revokedById" TEXT,
    "revokedAt" TIMESTAMP(3),
    "revocationReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "certificates_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "certificates_batchCandidateId_key" ON "certificates"("batchCandidateId");

-- CreateIndex
CREATE UNIQUE INDEX "certificates_verificationCode_key" ON "certificates"("verificationCode");

-- CreateIndex
CREATE INDEX "certificates_issuedById_idx" ON "certificates"("issuedById");

-- CreateIndex
CREATE INDEX "certificates_revokedById_idx" ON "certificates"("revokedById");

-- CreateIndex
CREATE INDEX "certificates_status_idx" ON "certificates"("status");

-- CreateIndex
CREATE INDEX "batch_candidates_reviewedById_idx" ON "batch_candidates"("reviewedById");

-- CreateIndex
CREATE INDEX "batch_candidates_batchId_reviewStatus_idx" ON "batch_candidates"("batchId", "reviewStatus");

-- AddForeignKey
ALTER TABLE "batch_candidates" ADD CONSTRAINT "batch_candidates_reviewedById_fkey" FOREIGN KEY ("reviewedById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "certificates" ADD CONSTRAINT "certificates_batchCandidateId_fkey" FOREIGN KEY ("batchCandidateId") REFERENCES "batch_candidates"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "certificates" ADD CONSTRAINT "certificates_issuedById_fkey" FOREIGN KEY ("issuedById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "certificates" ADD CONSTRAINT "certificates_revokedById_fkey" FOREIGN KEY ("revokedById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
