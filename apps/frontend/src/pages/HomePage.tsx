import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  AlertCircle,
  ArrowRight,
  CheckCircle2,
  FileSpreadsheet,
  Loader2,
  Upload,
} from "lucide-react";
import { useState, type ChangeEvent, type FormEvent } from "react";
import { Link } from "react-router-dom";
import { ApiError } from "../api/auth";
import { importBatchCsv, listBatches, listCourses } from "../api/batches";
import { useAuth } from "../auth/auth-context";
import { AppHeader } from "../components/AppHeader";

interface CsvRowError {
  row: number;
  field: string;
  message: string;
}

function isCsvRowErrorList(details: unknown): details is CsvRowError[] {
  return (
    Array.isArray(details) &&
    details.every(
      (item) =>
        item &&
        typeof item === "object" &&
        "row" in item &&
        "field" in item &&
        "message" in item
    )
  );
}

const SAMPLE_CSV = [
  "candidateRef,fullName,phone,attendancePercent,marksPercent,practicalPercent",
  "CAND-1001,Asha Verma,+919876543210,85,78,80",
  "CAND-1002,Rohan Das,+919876543211,70,58,65",
].join("\n");

export function HomePage() {
  const { token, user } = useAuth();
  const queryClient = useQueryClient();

  const [page, setPage] = useState(1);
  const [showImport, setShowImport] = useState(false);
  const [selectedCourseId, setSelectedCourseId] = useState("");
  const [csvText, setCsvText] = useState("");
  const [importSuccessMessage, setImportSuccessMessage] = useState<string | null>(
    null
  );

  const permissions = new Set(user?.permissions ?? []);
  const canReadBatches = permissions.has("batches.read");
  const canImportBatches = permissions.has("batches.import");

  const batchesQuery = useQuery({
    queryKey: ["batches", page],
    queryFn: () => listBatches(token!, page, 10),
    enabled: Boolean(token && canReadBatches),
  });

  const coursesQuery = useQuery({
    queryKey: ["courses"],
    queryFn: () => listCourses(token!),
    enabled: Boolean(token && canImportBatches && showImport),
  });

  const activeCourseId =
    selectedCourseId || coursesQuery.data?.[0]?.id || "";

  const importMutation = useMutation({
    mutationFn: ({ courseId, csv }: { courseId: string; csv: string }) =>
      importBatchCsv(token!, courseId, csv),
    onSuccess: (createdBatch) => {
      setImportSuccessMessage(
        `Imported batch for ${createdBatch.course.code} with ${createdBatch.candidates.length} candidate(s).`
      );
      setCsvText("");
      setShowImport(false);
      setPage(1);
      void queryClient.invalidateQueries({ queryKey: ["batches"] });
    },
  });

  if (!user) {
    return null;
  }

  const handleFileChange = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    const text = await file.text();
    setCsvText(text);
  };

  const handleImportSubmit = (event: FormEvent) => {
    event.preventDefault();
    if (!activeCourseId) return;
    setImportSuccessMessage(null);
    importMutation.mutate({ courseId: activeCourseId, csv: csvText });
  };

  const batches = batchesQuery.data?.batches ?? [];
  const pagination = batchesQuery.data?.pagination;

  return (
    <main className="min-h-screen bg-slate-950 text-slate-100 p-6 sm:p-10">
      <div className="mx-auto max-w-5xl space-y-6">
        <AppHeader />

        {importSuccessMessage && (
          <div
            role="status"
            className="flex items-center gap-2.5 rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-4 text-sm text-emerald-300"
          >
            <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-400" />
            <span>{importSuccessMessage}</span>
          </div>
        )}

        <section className="rounded-2xl border border-slate-800 bg-slate-900 p-6 shadow-xl space-y-5">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div>
              <h1 className="text-xl font-bold text-white">Batches</h1>
              <p className="mt-1 text-sm text-slate-400">
                Review imported candidate batches, submission state, and certificates.
              </p>
            </div>

            {canImportBatches && (
              <button
                type="button"
                onClick={() => {
                  setShowImport((prev) => !prev);
                  importMutation.reset();
                }}
                className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-blue-500 cursor-pointer"
              >
                <Upload className="h-4 w-4" />
                {showImport ? "Hide CSV Import" : "Import Batch CSV"}
              </button>
            )}
          </div>

          {canImportBatches && showImport && (
            <form
              onSubmit={handleImportSubmit}
              className="rounded-xl border border-slate-800 bg-slate-950/70 p-5 space-y-4"
            >
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h2 className="text-sm font-semibold text-white">
                  Import Candidate Batch (CSV)
                </h2>
                <button
                  type="button"
                  onClick={() => setCsvText(SAMPLE_CSV)}
                  className="text-xs font-medium text-blue-400 hover:text-blue-300 cursor-pointer"
                >
                  Load sample CSV
                </button>
              </div>

              {importMutation.isError && (
                <div
                  role="alert"
                  className="rounded-xl border border-red-500/30 bg-red-500/10 p-3.5 text-sm text-red-300 space-y-2"
                >
                  <div className="flex items-center gap-2 font-medium">
                    <AlertCircle className="h-4 w-4 shrink-0 text-red-400" />
                    <span>
                      {importMutation.error instanceof Error
                        ? importMutation.error.message
                        : "CSV import failed."}
                    </span>
                  </div>
                  {importMutation.error instanceof ApiError &&
                    isCsvRowErrorList(importMutation.error.details) && (
                      <ul className="list-disc pl-6 text-xs text-red-200 space-y-1">
                        {importMutation.error.details.map((err, idx) => (
                          <li key={`${err.row}-${err.field}-${idx}`}>
                            Row {err.row} ({err.field}): {err.message}
                          </li>
                        ))}
                      </ul>
                    )}
                </div>
              )}

              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <label
                    htmlFor="import-course"
                    className="block text-xs font-medium uppercase tracking-wider text-slate-400"
                  >
                    Course
                  </label>
                  <select
                    id="import-course"
                    value={activeCourseId}
                    onChange={(e) => setSelectedCourseId(e.target.value)}
                    disabled={coursesQuery.isLoading}
                    className="mt-1.5 w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-slate-100 focus:border-blue-400 focus:outline-none"
                  >
                    {coursesQuery.isLoading && <option value="">Loading courses...</option>}
                    {coursesQuery.data?.map((course) => (
                      <option key={course.id} value={course.id}>
                        {course.code} — {course.name}
                        {course.currentRuleVersion
                          ? ` (Rule v${course.currentRuleVersion.version})`
                          : " (No rule)"}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label
                    htmlFor="import-file"
                    className="block text-xs font-medium uppercase tracking-wider text-slate-400"
                  >
                    Upload .csv file (optional)
                  </label>
                  <input
                    id="import-file"
                    type="file"
                    accept=".csv,text/csv"
                    onChange={(e) => {
                      void handleFileChange(e);
                    }}
                    className="mt-1.5 block w-full text-xs text-slate-300 file:mr-3 file:rounded-lg file:border-0 file:bg-slate-800 file:px-3 file:py-2 file:text-xs file:font-semibold file:text-slate-200 hover:file:bg-slate-700"
                  />
                </div>
              </div>

              <div>
                <label
                  htmlFor="import-csv-text"
                  className="block text-xs font-medium uppercase tracking-wider text-slate-400"
                >
                  CSV Content
                </label>
                <textarea
                  id="import-csv-text"
                  rows={5}
                  value={csvText}
                  onChange={(e) => setCsvText(e.target.value)}
                  placeholder="candidateRef,fullName,phone,attendancePercent,marksPercent,practicalPercent"
                  className="mt-1.5 w-full rounded-lg border border-slate-700 bg-slate-900 p-3 font-mono text-xs text-slate-100 placeholder:text-slate-500 focus:border-blue-400 focus:outline-none"
                />
              </div>

              <div className="flex justify-end gap-3">
                <button
                  type="button"
                  onClick={() => setShowImport(false)}
                  className="rounded-lg border border-slate-700 bg-slate-800 px-4 py-2 text-sm font-medium text-slate-200 hover:bg-slate-700 cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={importMutation.isPending || !activeCourseId}
                  className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-blue-500 disabled:cursor-not-allowed disabled:opacity-60 cursor-pointer"
                >
                  {importMutation.isPending ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin" />
                      Importing...
                    </>
                  ) : (
                    <>
                      <FileSpreadsheet className="h-4 w-4" />
                      Import Batch
                    </>
                  )}
                </button>
              </div>
            </form>
          )}

          {!canReadBatches && (
            <div className="rounded-xl border border-slate-800 bg-slate-950/60 p-8 text-center">
              <p className="text-sm font-medium text-slate-200">
                No batch permissions assigned to your account.
              </p>
              <p className="mt-1 text-xs text-slate-400">
                Sign in as a Training Centre or State Office user to manage batches and certificates.
              </p>
            </div>
          )}

          {canReadBatches && batchesQuery.isLoading && (
            <div className="flex items-center justify-center gap-2 py-12 text-sm text-slate-400">
              <Loader2 className="h-5 w-5 animate-spin text-blue-400" />
              Loading batches...
            </div>
          )}

          {canReadBatches && batchesQuery.isError && (
            <div
              role="alert"
              className="flex items-center justify-between gap-3 rounded-xl border border-red-500/30 bg-red-500/10 p-4 text-sm text-red-300"
            >
              <div className="flex items-center gap-2">
                <AlertCircle className="h-4 w-4 shrink-0 text-red-400" />
                <span>
                  {batchesQuery.error instanceof Error
                    ? batchesQuery.error.message
                    : "Failed to load batches."}
                </span>
              </div>
              <button
                type="button"
                onClick={() => {
                  void batchesQuery.refetch();
                }}
                className="rounded-lg border border-red-400/30 px-3 py-1 text-xs font-semibold hover:bg-red-500/20 cursor-pointer"
              >
                Retry
              </button>
            </div>
          )}

          {canReadBatches && !batchesQuery.isLoading && !batchesQuery.isError && batches.length === 0 && (
            <div className="rounded-xl border border-slate-800 bg-slate-950/60 p-10 text-center">
              <p className="text-sm font-medium text-slate-300">No batches found.</p>
              <p className="mt-1 text-xs text-slate-500">
                {canImportBatches
                  ? "Import a candidate CSV batch to begin."
                  : "Submitted and draft batches will appear here once imported."}
              </p>
            </div>
          )}

          {canReadBatches && batches.length > 0 && (
            <div className="overflow-x-auto rounded-xl border border-slate-800">
              <table className="min-w-full divide-y divide-slate-800 text-left text-sm">
                <thead className="bg-slate-950/70 text-xs uppercase tracking-wider text-slate-400">
                  <tr>
                    <th className="px-4 py-3">Course</th>
                    <th className="px-4 py-3">Training Centre</th>
                    <th className="px-4 py-3">Rule</th>
                    <th className="px-4 py-3">Status</th>
                    <th className="px-4 py-3">Candidates</th>
                    <th className="px-4 py-3">Created</th>
                    <th className="px-4 py-3 text-right">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/80 bg-slate-900">
                  {batches.map((batch) => (
                    <tr key={batch.id} className="hover:bg-slate-800/40 transition">
                      <td className="px-4 py-3.5">
                        <p className="font-semibold text-white">{batch.course.name}</p>
                        <p className="text-xs text-slate-400">{batch.course.code}</p>
                      </td>
                      <td className="px-4 py-3.5">
                        <p className="text-slate-200">{batch.trainingCenter.name}</p>
                        <p className="text-xs text-slate-400">{batch.trainingCenter.code}</p>
                      </td>
                      <td className="px-4 py-3.5 text-slate-300">
                        v{batch.ruleVersion.version}
                      </td>
                      <td className="px-4 py-3.5">
                        <span
                          className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-semibold ${
                            batch.status === "SUBMITTED"
                              ? "border border-emerald-500/30 bg-emerald-500/10 text-emerald-300"
                              : "border border-amber-500/30 bg-amber-500/10 text-amber-300"
                          }`}
                        >
                          {batch.status}
                        </span>
                      </td>
                      <td className="px-4 py-3.5 text-slate-200">
                        {batch.candidateCount}
                      </td>
                      <td className="px-4 py-3.5 text-xs text-slate-400">
                        {new Date(batch.createdAt).toLocaleString()}
                      </td>
                      <td className="px-4 py-3.5 text-right">
                        <Link
                          to={`/batches/${batch.id}`}
                          className="inline-flex items-center gap-1.5 rounded-lg border border-slate-700 bg-slate-800 px-3 py-1.5 text-xs font-semibold text-slate-100 hover:border-blue-500/40 hover:bg-blue-500/10 hover:text-blue-300 transition"
                        >
                          Open
                          <ArrowRight className="h-3.5 w-3.5" />
                        </Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {pagination && pagination.totalPages > 1 && (
            <div className="flex items-center justify-between pt-2 text-xs text-slate-400">
              <span>
                Page {pagination.page} of {pagination.totalPages} ({pagination.total} total)
              </span>
              <div className="flex gap-2">
                <button
                  type="button"
                  disabled={pagination.page <= 1}
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  className="rounded-lg border border-slate-700 bg-slate-800 px-3 py-1.5 font-semibold text-slate-200 disabled:opacity-50 cursor-pointer"
                >
                  Previous
                </button>
                <button
                  type="button"
                  disabled={pagination.page >= pagination.totalPages}
                  onClick={() => setPage((p) => p + 1)}
                  className="rounded-lg border border-slate-700 bg-slate-800 px-3 py-1.5 font-semibold text-slate-200 disabled:opacity-50 cursor-pointer"
                >
                  Next
                </button>
              </div>
            </div>
          )}
        </section>
      </div>
    </main>
  );
}
