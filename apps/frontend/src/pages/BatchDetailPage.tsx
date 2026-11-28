import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  AlertCircle,
  ArrowLeft,
  Award,
  Ban,
  CheckCircle2,
  Download,
  Loader2,
  Send,
  XCircle,
} from "lucide-react";
import { useState } from "react";
import { Link, useParams } from "react-router-dom";
import {
  downloadCertificatePdf,
  getBatchById,
  issueCertificate,
  reviewBatchCandidate,
  revokeCertificate,
  submitBatch,
  type BatchCandidateItem,
} from "../api/batches";
import { useAuth } from "../auth/auth-context";
import { AppHeader } from "../components/AppHeader";

export function BatchDetailPage() {
  const { batchId } = useParams<{ batchId: string }>();
  const { token, user } = useAuth();
  const queryClient = useQueryClient();

  const [actionSuccess, setActionSuccess] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  const [rejectingCandidateId, setRejectingCandidateId] = useState<string | null>(
    null
  );
  const [rejectReason, setRejectReason] = useState("");

  const [revokingCertificateId, setRevokingCertificateId] = useState<string | null>(
    null
  );
  const [revokeReason, setRevokeReason] = useState("");
  const [downloadingCertificateId, setDownloadingCertificateId] = useState<
    string | null
  >(null);

  const permissions = new Set(user?.permissions ?? []);
  const canSubmit = permissions.has("batches.submit");
  const canReview = permissions.has("candidates.review");
  const canIssue = permissions.has("certificates.issue");
  const canRevoke = permissions.has("certificates.revoke");

  const batchQuery = useQuery({
    queryKey: ["batches", batchId],
    queryFn: () => getBatchById(token!, batchId!),
    enabled: Boolean(token && batchId),
  });

  const invalidateBatchQueries = async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ["batches", batchId] }),
      queryClient.invalidateQueries({ queryKey: ["batches"] }),
    ]);
  };

  const submitMutation = useMutation({
    mutationFn: () => submitBatch(token!, batchId!),
    onSuccess: async () => {
      setActionError(null);
      setActionSuccess("Batch submitted for review.");
      await invalidateBatchQueries();
    },
    onError: (err) => {
      setActionSuccess(null);
      setActionError(
        err instanceof Error ? err.message : "Failed to submit batch."
      );
    },
  });

  const reviewMutation = useMutation({
    mutationFn: ({
      batchCandidateId,
      status,
      reason,
    }: {
      batchCandidateId: string;
      status: "APPROVED" | "REJECTED";
      reason?: string;
    }) => reviewBatchCandidate(token!, batchId!, batchCandidateId, { status, reason }),
    onSuccess: async (updated) => {
      setActionError(null);
      setActionSuccess(
        `Candidate ${updated.candidateRef} marked as ${updated.reviewStatus}.`
      );
      setRejectingCandidateId(null);
      setRejectReason("");
      await invalidateBatchQueries();
    },
    onError: (err) => {
      setActionSuccess(null);
      setActionError(
        err instanceof Error ? err.message : "Failed to review candidate."
      );
    },
  });

  const issueMutation = useMutation({
    mutationFn: (batchCandidateId: string) =>
      issueCertificate(token!, batchId!, batchCandidateId),
    onSuccess: async (cert) => {
      setActionError(null);
      setActionSuccess(
        `Certificate issued (${cert.verificationCode}).`
      );
      await invalidateBatchQueries();
    },
    onError: (err) => {
      setActionSuccess(null);
      setActionError(
        err instanceof Error ? err.message : "Failed to issue certificate."
      );
    },
  });

  const revokeMutation = useMutation({
    mutationFn: ({
      certificateId,
      reason,
    }: {
      certificateId: string;
      reason: string;
    }) => revokeCertificate(token!, certificateId, reason),
    onSuccess: async (cert) => {
      setActionError(null);
      setActionSuccess(
        `Certificate ${cert.verificationCode} revoked.`
      );
      setRevokingCertificateId(null);
      setRevokeReason("");
      await invalidateBatchQueries();
    },
    onError: (err) => {
      setActionSuccess(null);
      setActionError(
        err instanceof Error ? err.message : "Failed to revoke certificate."
      );
    },
  });

  const handleDownload = async (candidate: BatchCandidateItem) => {
    if (!candidate.certificate || !token) return;
    setActionError(null);
    setDownloadingCertificateId(candidate.certificate.id);
    try {
      await downloadCertificatePdf(
        token,
        candidate.certificate.id,
        `certificate-${candidate.certificate.verificationCode}.pdf`
      );
    } catch (err) {
      setActionError(
        err instanceof Error ? err.message : "Failed to download PDF."
      );
    } finally {
      setDownloadingCertificateId(null);
    }
  };

  if (!user) {
    return null;
  }

  const batch = batchQuery.data;

  return (
    <main className="min-h-screen bg-slate-950 text-slate-100 p-6 sm:p-10">
      <div className="mx-auto max-w-6xl space-y-6">
        <AppHeader />

        <div className="flex items-center justify-between">
          <Link
            to="/"
            className="inline-flex items-center gap-2 text-sm font-medium text-slate-300 hover:text-white transition"
          >
            <ArrowLeft className="h-4 w-4" />
            Back to batches
          </Link>
        </div>

        {actionSuccess && (
          <div
            role="status"
            className="flex items-center gap-2.5 rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-4 text-sm text-emerald-300"
          >
            <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-400" />
            <span>{actionSuccess}</span>
          </div>
        )}

        {actionError && (
          <div
            role="alert"
            className="flex items-center gap-2.5 rounded-xl border border-red-500/30 bg-red-500/10 p-4 text-sm text-red-300"
          >
            <AlertCircle className="h-4 w-4 shrink-0 text-red-400" />
            <span>{actionError}</span>
          </div>
        )}

        {batchQuery.isLoading && (
          <div className="flex items-center justify-center gap-2 rounded-2xl border border-slate-800 bg-slate-900 py-16 text-sm text-slate-400">
            <Loader2 className="h-5 w-5 animate-spin text-blue-400" />
            Loading batch details...
          </div>
        )}

        {batchQuery.isError && (
          <div
            role="alert"
            className="flex items-center justify-between rounded-2xl border border-red-500/30 bg-red-500/10 p-6 text-sm text-red-300"
          >
            <div className="flex items-center gap-2">
              <AlertCircle className="h-5 w-5 shrink-0 text-red-400" />
              <span>
                {batchQuery.error instanceof Error
                  ? batchQuery.error.message
                  : "Failed to load batch details."}
              </span>
            </div>
            <button
              type="button"
              onClick={() => {
                void batchQuery.refetch();
              }}
              className="rounded-lg border border-red-400/30 px-3 py-1.5 text-xs font-semibold hover:bg-red-500/20 cursor-pointer"
            >
              Retry
            </button>
          </div>
        )}

        {batch && (
          <>
            <section className="rounded-2xl border border-slate-800 bg-slate-900 p-6 shadow-xl space-y-5">
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div>
                  <div className="flex items-center gap-3">
                    <h1 className="text-xl font-bold text-white">
                      {batch.course.name} ({batch.course.code})
                    </h1>
                    <span
                      className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-semibold ${
                        batch.status === "SUBMITTED"
                          ? "border border-emerald-500/30 bg-emerald-500/10 text-emerald-300"
                          : "border border-amber-500/30 bg-amber-500/10 text-amber-300"
                      }`}
                    >
                      {batch.status}
                    </span>
                  </div>
                  <p className="mt-1 text-sm text-slate-400">
                    {batch.trainingCenter.name} ({batch.trainingCenter.code})
                  </p>
                </div>

                {canSubmit && batch.status === "DRAFT" && (
                  <button
                    type="button"
                    disabled={submitMutation.isPending}
                    onClick={() => submitMutation.mutate()}
                    className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-blue-500 disabled:cursor-not-allowed disabled:opacity-60 cursor-pointer"
                  >
                    {submitMutation.isPending ? (
                      <>
                        <Loader2 className="h-4 w-4 animate-spin" />
                        Submitting...
                      </>
                    ) : (
                      <>
                        <Send className="h-4 w-4" />
                        Submit Batch
                      </>
                    )}
                  </button>
                )}
              </div>

              <div className="grid gap-4 sm:grid-cols-3 text-sm">
                <div className="rounded-xl border border-slate-800 bg-slate-950/60 p-4">
                  <p className="text-xs font-medium uppercase tracking-wider text-slate-400">
                    Captured Rule Version
                  </p>
                  <p className="mt-1.5 font-semibold text-white">
                    Version {batch.ruleVersion.version}
                  </p>
                  <p className="mt-1 text-xs text-slate-400">
                    Attendance &ge; {batch.ruleVersion.minAttendancePercent}% · Marks &ge;{" "}
                    {batch.ruleVersion.minMarksPercent}% · Practical:{" "}
                    {batch.ruleVersion.practicalRequired
                      ? `>= ${batch.ruleVersion.minPracticalPercent}%`
                      : "Optional"}
                  </p>
                </div>

                <div className="rounded-xl border border-slate-800 bg-slate-950/60 p-4">
                  <p className="text-xs font-medium uppercase tracking-wider text-slate-400">
                    Imported At
                  </p>
                  <p className="mt-1.5 font-medium text-slate-200">
                    {new Date(batch.createdAt).toLocaleString()}
                  </p>
                </div>

                <div className="rounded-xl border border-slate-800 bg-slate-950/60 p-4">
                  <p className="text-xs font-medium uppercase tracking-wider text-slate-400">
                    Submitted At
                  </p>
                  <p className="mt-1.5 font-medium text-slate-200">
                    {batch.submittedAt
                      ? new Date(batch.submittedAt).toLocaleString()
                      : "Not submitted yet"}
                  </p>
                </div>
              </div>
            </section>

            <section className="rounded-2xl border border-slate-800 bg-slate-900 p-6 shadow-xl space-y-4">
              <h2 className="text-lg font-bold text-white">
                Candidates ({batch.candidates.length})
              </h2>

              {batch.candidates.length === 0 ? (
                <p className="text-sm text-slate-400">No candidates in this batch.</p>
              ) : (
                <div className="space-y-4">
                  {batch.candidates.map((candidate) => {
                    const isRejecting = rejectingCandidateId === candidate.id;
                    const cert = candidate.certificate;
                    const isRevoking = cert && revokingCertificateId === cert.id;

                    return (
                      <div
                        key={candidate.id}
                        className="rounded-xl border border-slate-800 bg-slate-950/60 p-5 space-y-4"
                      >
                        <div className="flex flex-wrap items-start justify-between gap-4">
                          <div className="space-y-1">
                            <div className="flex flex-wrap items-center gap-2.5">
                              <p className="font-semibold text-white">
                                {candidate.fullName}
                              </p>
                              <code className="rounded bg-slate-900 px-2 py-0.5 text-xs text-slate-300 border border-slate-800">
                                {candidate.candidateRef}
                              </code>
                              <span
                                className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${
                                  candidate.qualified
                                    ? "border border-emerald-500/30 bg-emerald-500/10 text-emerald-300"
                                    : "border border-red-500/30 bg-red-500/10 text-red-300"
                                }`}
                              >
                                {candidate.qualified ? "Qualified" : "Not Qualified"}
                              </span>
                              <span
                                className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${
                                  candidate.reviewStatus === "APPROVED"
                                    ? "border border-blue-500/30 bg-blue-500/10 text-blue-300"
                                    : candidate.reviewStatus === "REJECTED"
                                      ? "border border-red-500/30 bg-red-500/10 text-red-300"
                                      : "border border-slate-700 bg-slate-800 text-slate-300"
                                }`}
                              >
                                Review: {candidate.reviewStatus}
                              </span>
                            </div>

                            <p className="text-xs text-slate-400">
                              Phone: {candidate.phone} · Attendance: {candidate.attendancePercent}% ·
                              Marks: {candidate.marksPercent}% · Practical:{" "}
                              {candidate.practicalPercent !== null
                                ? `${candidate.practicalPercent}%`
                                : "—"}
                            </p>

                            {candidate.qualificationReasons.length > 0 && (
                              <ul className="mt-1.5 list-disc pl-5 text-xs text-red-300 space-y-0.5">
                                {candidate.qualificationReasons.map((reason) => (
                                  <li key={reason.code}>{reason.message}</li>
                                ))}
                              </ul>
                            )}

                            {candidate.reviewStatus === "REJECTED" &&
                              candidate.reviewReason && (
                                <p className="mt-1 text-xs text-red-300">
                                  Rejection reason: {candidate.reviewReason}
                                </p>
                              )}

                            {cert && (
                              <div className="mt-2 flex flex-wrap items-center gap-3 rounded-lg border border-slate-800 bg-slate-900/80 px-3 py-2 text-xs">
                                <span
                                  className={`font-semibold ${
                                    cert.status === "ISSUED"
                                      ? "text-emerald-300"
                                      : "text-red-300"
                                  }`}
                                >
                                  Certificate: {cert.status}
                                </span>
                                <span className="font-mono text-slate-200">
                                  Code: {cert.verificationCode}
                                </span>
                                <span className="text-slate-400">
                                  Issued: {new Date(cert.issuedAt).toLocaleString()}
                                </span>
                                {cert.status === "REVOKED" && cert.revocationReason && (
                                  <span className="text-red-300">
                                    Revoked ({cert.revocationReason})
                                  </span>
                                )}
                              </div>
                            )}
                          </div>

                          <div className="flex flex-wrap items-center gap-2">
                            {canReview &&
                              batch.status === "SUBMITTED" &&
                              candidate.reviewStatus === "PENDING" && (
                                <>
                                  {candidate.qualified && (
                                    <button
                                      type="button"
                                      disabled={reviewMutation.isPending}
                                      onClick={() =>
                                        reviewMutation.mutate({
                                          batchCandidateId: candidate.id,
                                          status: "APPROVED",
                                        })
                                      }
                                      className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-emerald-500 disabled:opacity-60 cursor-pointer"
                                    >
                                      <CheckCircle2 className="h-3.5 w-3.5" />
                                      Approve
                                    </button>
                                  )}
                                  <button
                                    type="button"
                                    disabled={reviewMutation.isPending}
                                    onClick={() => {
                                      setRejectingCandidateId(
                                        isRejecting ? null : candidate.id
                                      );
                                      setRejectReason("");
                                    }}
                                    className="inline-flex items-center gap-1.5 rounded-lg border border-red-500/40 bg-red-500/10 px-3 py-1.5 text-xs font-semibold text-red-300 transition hover:bg-red-500/20 disabled:opacity-60 cursor-pointer"
                                  >
                                    <XCircle className="h-3.5 w-3.5" />
                                    Reject
                                  </button>
                                </>
                              )}

                            {canIssue &&
                              batch.status === "SUBMITTED" &&
                              candidate.qualified &&
                              candidate.reviewStatus === "APPROVED" &&
                              !cert && (
                                <button
                                  type="button"
                                  disabled={issueMutation.isPending}
                                  onClick={() => issueMutation.mutate(candidate.id)}
                                  className="inline-flex items-center gap-1.5 rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-blue-500 disabled:opacity-60 cursor-pointer"
                                >
                                  {issueMutation.isPending ? (
                                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                                  ) : (
                                    <Award className="h-3.5 w-3.5" />
                                  )}
                                  Issue Certificate
                                </button>
                              )}

                            {cert && (
                              <button
                                type="button"
                                disabled={downloadingCertificateId === cert.id}
                                onClick={() => {
                                  void handleDownload(candidate);
                                }}
                                className="inline-flex items-center gap-1.5 rounded-lg border border-slate-700 bg-slate-800 px-3 py-1.5 text-xs font-semibold text-slate-200 transition hover:bg-slate-700 disabled:opacity-60 cursor-pointer"
                              >
                                {downloadingCertificateId === cert.id ? (
                                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                                ) : (
                                  <Download className="h-3.5 w-3.5" />
                                )}
                                Download PDF
                              </button>
                            )}

                            {canRevoke && cert && cert.status === "ISSUED" && (
                              <button
                                type="button"
                                disabled={revokeMutation.isPending}
                                onClick={() => {
                                  setRevokingCertificateId(
                                    isRevoking ? null : cert.id
                                  );
                                  setRevokeReason("");
                                }}
                                className="inline-flex items-center gap-1.5 rounded-lg border border-red-500/40 bg-red-500/10 px-3 py-1.5 text-xs font-semibold text-red-300 transition hover:bg-red-500/20 disabled:opacity-60 cursor-pointer"
                              >
                                <Ban className="h-3.5 w-3.5" />
                                Revoke
                              </button>
                            )}
                          </div>
                        </div>

                        {isRejecting && (
                          <form
                            onSubmit={(e) => {
                              e.preventDefault();
                              if (!rejectReason.trim()) return;
                              reviewMutation.mutate({
                                batchCandidateId: candidate.id,
                                status: "REJECTED",
                                reason: rejectReason.trim(),
                              });
                            }}
                            className="flex flex-wrap items-center gap-2 rounded-lg border border-slate-800 bg-slate-900 p-3"
                          >
                            <input
                              type="text"
                              value={rejectReason}
                              onChange={(e) => setRejectReason(e.target.value)}
                              placeholder="Enter rejection reason (required)"
                              required
                              className="flex-1 min-w-[220px] rounded-lg border border-slate-700 bg-slate-950 px-3 py-1.5 text-xs text-slate-100 placeholder:text-slate-500 focus:border-blue-400 focus:outline-none"
                            />
                            <button
                              type="submit"
                              disabled={
                                reviewMutation.isPending || !rejectReason.trim()
                              }
                              className="rounded-lg bg-red-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-red-500 disabled:opacity-60 cursor-pointer"
                            >
                              Confirm Reject
                            </button>
                            <button
                              type="button"
                              onClick={() => setRejectingCandidateId(null)}
                              className="rounded-lg border border-slate-700 px-3 py-1.5 text-xs text-slate-300 hover:bg-slate-800 cursor-pointer"
                            >
                              Cancel
                            </button>
                          </form>
                        )}

                        {isRevoking && cert && (
                          <form
                            onSubmit={(e) => {
                              e.preventDefault();
                              if (!revokeReason.trim()) return;
                              revokeMutation.mutate({
                                certificateId: cert.id,
                                reason: revokeReason.trim(),
                              });
                            }}
                            className="flex flex-wrap items-center gap-2 rounded-lg border border-slate-800 bg-slate-900 p-3"
                          >
                            <input
                              type="text"
                              value={revokeReason}
                              onChange={(e) => setRevokeReason(e.target.value)}
                              placeholder="Enter revocation reason (required)"
                              required
                              className="flex-1 min-w-[220px] rounded-lg border border-slate-700 bg-slate-950 px-3 py-1.5 text-xs text-slate-100 placeholder:text-slate-500 focus:border-blue-400 focus:outline-none"
                            />
                            <button
                              type="submit"
                              disabled={
                                revokeMutation.isPending || !revokeReason.trim()
                              }
                              className="rounded-lg bg-red-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-red-500 disabled:opacity-60 cursor-pointer"
                            >
                              Confirm Revoke
                            </button>
                            <button
                              type="button"
                              onClick={() => setRevokingCertificateId(null)}
                              className="rounded-lg border border-slate-700 px-3 py-1.5 text-xs text-slate-300 hover:bg-slate-800 cursor-pointer"
                            >
                              Cancel
                            </button>
                          </form>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </section>
          </>
        )}
      </div>
    </main>
  );
}
