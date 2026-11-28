import { ApiError, parseApiResponse } from "./auth";

export interface CourseRuleSummary {
  id: string;
  courseId: string;
  version: number;
  minAttendancePercent: number;
  minMarksPercent: number;
  practicalRequired: boolean;
  minPracticalPercent: number | null;
  createdById: string;
  createdAt: string;
}

export interface CourseListItem {
  id: string;
  code: string;
  name: string;
  currentRuleVersionId: string | null;
  createdAt: string;
  updatedAt: string;
  currentRuleVersion: CourseRuleSummary | null;
}

export interface TrainingCenterSummary {
  id: string;
  code: string;
  name: string;
  districtId: string;
}

export interface CourseSummary {
  id: string;
  code: string;
  name: string;
}

export type BatchStatus = "DRAFT" | "SUBMITTED";
export type CandidateReviewStatus = "PENDING" | "APPROVED" | "REJECTED";
export type CertificateStatus = "ISSUED" | "REVOKED";

export interface QualificationReason {
  code: string;
  message: string;
}

export interface BatchCandidateCertificateSummary {
  id: string;
  verificationCode: string;
  status: CertificateStatus;
  issuedAt: string;
  revokedAt: string | null;
  revocationReason: string | null;
}

export interface BatchCandidateItem {
  id: string;
  candidateId: string;
  candidateRef: string;
  fullName: string;
  phone: string;
  attendancePercent: number;
  marksPercent: number;
  practicalPercent: number | null;
  qualified: boolean;
  qualificationReasons: QualificationReason[];
  reviewStatus: CandidateReviewStatus;
  reviewedById: string | null;
  reviewedAt: string | null;
  reviewReason: string | null;
  certificate: BatchCandidateCertificateSummary | null;
}

export interface BatchDetail {
  id: string;
  trainingCenterId: string;
  courseId: string;
  ruleVersionId: string;
  status: BatchStatus;
  createdById: string;
  createdAt: string;
  submittedAt: string | null;
  trainingCenter: TrainingCenterSummary;
  course: CourseSummary;
  ruleVersion: {
    id: string;
    version: number;
    minAttendancePercent: number;
    minMarksPercent: number;
    practicalRequired: boolean;
    minPracticalPercent: number | null;
    createdAt: string;
  };
  candidates: BatchCandidateItem[];
}

export interface BatchListItem {
  id: string;
  trainingCenterId: string;
  courseId: string;
  ruleVersionId: string;
  status: BatchStatus;
  createdById: string;
  createdAt: string;
  submittedAt: string | null;
  trainingCenter: TrainingCenterSummary;
  course: CourseSummary;
  ruleVersion: {
    id: string;
    version: number;
  };
  candidateCount: number;
}

export interface BatchListResponse {
  batches: BatchListItem[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}

export interface CertificateMetadata {
  id: string;
  batchCandidateId: string;
  verificationCode: string;
  status: CertificateStatus;
  issuedById: string;
  issuedAt: string;
  revokedById: string | null;
  revokedAt: string | null;
  revocationReason: string | null;
  createdAt: string;
  updatedAt: string;
}

export async function listCourses(token: string): Promise<CourseListItem[]> {
  const response = await fetch("/api/courses", {
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });

  const data = await parseApiResponse<{ courses: CourseListItem[] }>(response);
  return data.courses;
}

export async function listBatches(
  token: string,
  page: number = 1,
  limit: number = 20
): Promise<BatchListResponse> {
  const params = new URLSearchParams({
    page: String(page),
    limit: String(limit),
  });
  const response = await fetch(`/api/batches?${params.toString()}`, {
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });

  return parseApiResponse<BatchListResponse>(response);
}

export async function importBatchCsv(
  token: string,
  courseId: string,
  csvText: string
): Promise<BatchDetail> {
  const params = new URLSearchParams({ courseId });
  const response = await fetch(`/api/batches/import?${params.toString()}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "text/csv",
    },
    body: csvText,
  });

  const data = await parseApiResponse<{ batch: BatchDetail }>(response);
  return data.batch;
}

export async function getBatchById(
  token: string,
  batchId: string
): Promise<BatchDetail> {
  const response = await fetch(`/api/batches/${encodeURIComponent(batchId)}`, {
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });

  const data = await parseApiResponse<{ batch: BatchDetail }>(response);
  return data.batch;
}

export async function submitBatch(
  token: string,
  batchId: string
): Promise<BatchDetail> {
  const response = await fetch(
    `/api/batches/${encodeURIComponent(batchId)}/submit`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
      },
    }
  );

  const data = await parseApiResponse<{ batch: BatchDetail }>(response);
  return data.batch;
}

export async function reviewBatchCandidate(
  token: string,
  batchId: string,
  batchCandidateId: string,
  input: { status: "APPROVED" | "REJECTED"; reason?: string }
): Promise<BatchCandidateItem> {
  const response = await fetch(
    `/api/batches/${encodeURIComponent(batchId)}/candidates/${encodeURIComponent(batchCandidateId)}/review`,
    {
      method: "PATCH",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(input),
    }
  );

  const data = await parseApiResponse<{ candidate: BatchCandidateItem }>(response);
  return data.candidate;
}

export async function issueCertificate(
  token: string,
  batchId: string,
  batchCandidateId: string
): Promise<CertificateMetadata> {
  const response = await fetch(
    `/api/batches/${encodeURIComponent(batchId)}/candidates/${encodeURIComponent(batchCandidateId)}/certificate`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
      },
    }
  );

  const data = await parseApiResponse<{ certificate: CertificateMetadata }>(
    response
  );
  return data.certificate;
}

export async function downloadCertificatePdf(
  token: string,
  certificateId: string,
  fallbackFilename: string
): Promise<void> {
  const response = await fetch(
    `/api/certificates/${encodeURIComponent(certificateId)}/pdf`,
    {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    }
  );

  if (!response.ok) {
    await parseApiResponse<never>(response);
    throw new ApiError("Unable to download certificate PDF", response.status);
  }

  const blob = await response.blob();
  const disposition = response.headers.get("content-disposition");
  const filenameMatch = disposition?.match(/filename="([^"]+)"/);
  const filename = filenameMatch?.[1] ?? fallbackFilename;

  const objectUrl = URL.createObjectURL(blob);
  try {
    const link = document.createElement("a");
    link.href = objectUrl;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    link.remove();
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}

export async function revokeCertificate(
  token: string,
  certificateId: string,
  reason: string
): Promise<CertificateMetadata> {
  const response = await fetch(
    `/api/certificates/${encodeURIComponent(certificateId)}/revoke`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ reason }),
    }
  );

  const data = await parseApiResponse<{ certificate: CertificateMetadata }>(
    response
  );
  return data.certificate;
}
