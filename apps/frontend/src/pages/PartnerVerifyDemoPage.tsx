import {
  AlertCircle,
  Eye,
  EyeOff,
  Loader2,
  Play,
  ShieldAlert,
  Trash2,
} from "lucide-react";
import { useEffect, useState, type FormEvent } from "react";
import { Link } from "react-router-dom";
import { ApiError } from "../api/auth";
import {
  bulkVerifyCertificatesPartner,
  parseBulkVerificationCodesInput,
  summarizeBulkVerificationResults,
  type BulkVerifyResultItem,
} from "../api/verify";
import { useAuth } from "../auth/auth-context";
import { AppHeader } from "../components/AppHeader";

function formatDateTime(value?: string): string {
  if (!value) {
    return "—";
  }
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString();
}

export function PartnerVerifyDemoPage() {
  const { user } = useAuth();

  const roles = new Set(user?.roles ?? []);
  const canAccessDemo = roles.has("STATE_OFFICE") || roles.has("ADMIN");

  // Keep partner API key strictly in transient component state
  const [apiKey, setApiKey] = useState("");
  const [showApiKey, setShowApiKey] = useState(false);
  const [codesText, setCodesText] = useState("");
  const [validationError, setValidationError] = useState<string | null>(null);
  const [apiError, setApiError] = useState<{
    message: string;
    status?: number;
  } | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [results, setResults] = useState<BulkVerifyResultItem[] | null>(null);

  useEffect(() => {
    return () => {
      setApiKey("");
      setShowApiKey(false);
      setResults(null);
    };
  }, []);

  if (!user) {
    return null;
  }

  const handleClear = () => {
    setApiKey("");
    setShowApiKey(false);
    setCodesText("");
    setValidationError(null);
    setApiError(null);
    setResults(null);
  };

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    setValidationError(null);
    setApiError(null);

    const trimmedKey = apiKey.trim();
    if (!trimmedKey) {
      setValidationError("Enter a partner API key to authenticate the bulk request.");
      return;
    }

    const parsedCodes = parseBulkVerificationCodesInput(codesText);
    if (parsedCodes.error) {
      setValidationError(parsedCodes.error);
      return;
    }

    setIsSubmitting(true);
    try {
      const response = await bulkVerifyCertificatesPartner(
        trimmedKey,
        parsedCodes.codes
      );
      setResults(response.results);
    } catch (error) {
      if (error instanceof ApiError) {
        setApiError({
          message: error.message,
          status: error.status,
        });
      } else if (error instanceof Error) {
        setApiError({
          message: error.message || "Network error contacting partner API.",
        });
      } else {
        setApiError({
          message: "Unexpected error verifying certificate batch.",
        });
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  const summary = results ? summarizeBulkVerificationResults(results) : null;

  return (
    <main className="min-h-screen bg-slate-950 text-slate-100 p-6">
      <div className="mx-auto max-w-6xl space-y-6">
        <AppHeader />

        {!canAccessDemo ? (
          <section className="rounded-2xl border border-red-500/30 bg-slate-900 p-8 shadow-xl">
            <div className="flex items-start gap-3">
              <ShieldAlert className="h-6 w-6 text-red-400 shrink-0 mt-0.5" />
              <div>
                <h1 className="text-xl font-bold text-white">Access Denied</h1>
                <p className="mt-1.5 text-sm text-slate-300">
                  The partner bulk-verification demo page is restricted to{" "}
                  <span className="font-semibold text-white">STATE_OFFICE</span>{" "}
                  and <span className="font-semibold text-white">ADMIN</span>{" "}
                  users.
                </p>
                <Link
                  to="/"
                  className="mt-4 inline-flex rounded-lg border border-slate-700 bg-slate-800 px-4 py-2 text-sm font-semibold text-slate-200 hover:border-blue-500/40"
                >
                  Return to Console
                </Link>
              </div>
            </div>
          </section>
        ) : (
          <>
            <section className="rounded-2xl border border-slate-800 bg-slate-900 p-6 sm:p-8 shadow-xl space-y-5">
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div>
                  <span className="inline-flex items-center rounded-full border border-amber-500/40 bg-amber-500/10 px-2.5 py-0.5 text-xs font-semibold text-amber-300">
                    Demo / integration testing
                  </span>
                  <h1 className="mt-2 text-xl sm:text-2xl font-bold text-white">
                    Partner Bulk Verification Demo
                  </h1>
                  <p className="mt-1 text-sm text-slate-400 max-w-3xl">
                    Demonstrates external partner integration against the live{" "}
                    <code className="font-mono text-slate-200">
                      POST /api/partner/v1/certificates/verify-bulk
                    </code>{" "}
                    endpoint using <code className="font-mono text-slate-200">X-API-Key</code>.
                    The API key is held in memory only and cleared when leaving or
                    resetting this page.
                  </p>
                </div>

                <Link
                  to="/partner-keys"
                  className="rounded-lg border border-slate-700 bg-slate-800 px-3.5 py-2 text-xs font-semibold text-slate-200 hover:border-blue-500/40 hover:text-blue-300"
                >
                  Manage Partner Keys
                </Link>
              </div>

              <div className="rounded-xl border border-slate-800 bg-slate-950/70 p-4 text-xs text-slate-300 space-y-2">
                <p className="font-semibold text-slate-200">
                  Request contract (1–100 codes per request, 30 bulk requests / 15
                  minutes per API key)
                </p>
                <pre className="overflow-x-auto font-mono text-slate-300">
{`POST /api/partner/v1/certificates/verify-bulk
X-API-Key: <one-time-partner-api-key>
{ "verificationCodes": ["SP-12345678-12345678", "SP-87654321-87654321"] }`}
                </pre>
              </div>

              {validationError && (
                <div
                  role="alert"
                  className="flex items-start gap-2.5 rounded-xl border border-amber-500/40 bg-amber-500/10 p-3.5 text-sm text-amber-200"
                >
                  <AlertCircle className="h-4 w-4 text-amber-400 shrink-0 mt-0.5" />
                  <span>{validationError}</span>
                </div>
              )}

              {apiError && (
                <div
                  role="alert"
                  className="flex items-start gap-2.5 rounded-xl border border-red-500/40 bg-red-500/10 p-3.5 text-sm text-red-200"
                >
                  <AlertCircle className="h-4 w-4 text-red-400 shrink-0 mt-0.5" />
                  <div>
                    <p className="font-semibold text-white">
                      {apiError.status === 401 || apiError.status === 403
                        ? "Partner authentication / authorization failed"
                        : apiError.status === 429
                          ? "Rate limit exceeded (429)"
                          : apiError.status && apiError.status >= 500
                            ? `Server error (${apiError.status})`
                            : "Request failed"}
                    </p>
                    <p className="mt-0.5">{apiError.message}</p>
                  </div>
                </div>
              )}

              <form onSubmit={handleSubmit} noValidate className="space-y-4">
                <div>
                  <label
                    htmlFor="partnerApiKey"
                    className="block text-sm font-medium text-slate-300"
                  >
                    Partner API Key (`X-API-Key`)
                  </label>
                  <div className="relative mt-1.5">
                    <input
                      id="partnerApiKey"
                      type={showApiKey ? "text" : "password"}
                      autoComplete="off"
                      spellCheck={false}
                      value={apiKey}
                      onChange={(e) => setApiKey(e.target.value)}
                      placeholder="Paste a partner API key created in Partner API keys"
                      className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3.5 py-2.5 pr-10 font-mono text-sm text-slate-50 placeholder:text-slate-500 focus:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-500/30"
                    />
                    <button
                      type="button"
                      onClick={() => setShowApiKey((prev) => !prev)}
                      aria-label={showApiKey ? "Hide API key" : "Show API key"}
                      aria-pressed={showApiKey}
                      className="absolute inset-y-0 right-0 flex items-center px-3 text-slate-400 hover:text-slate-200 cursor-pointer"
                    >
                      {showApiKey ? (
                        <EyeOff className="h-4 w-4" aria-hidden="true" />
                      ) : (
                        <Eye className="h-4 w-4" aria-hidden="true" />
                      )}
                    </button>
                  </div>
                </div>

                <div>
                  <label
                    htmlFor="bulkCodes"
                    className="block text-sm font-medium text-slate-300"
                  >
                    Verification Codes (one per line, 1–100)
                  </label>
                  <textarea
                    id="bulkCodes"
                    rows={6}
                    spellCheck={false}
                    value={codesText}
                    onChange={(e) => setCodesText(e.target.value)}
                    placeholder={
                      "SP-ABCD1234-EF567890\nSP-11112222-33334444\nSP-00000000-00000000"
                    }
                    className="mt-1.5 w-full rounded-lg border border-slate-700 bg-slate-950 px-3.5 py-2.5 font-mono text-sm text-slate-50 placeholder:text-slate-500 focus:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-500/30"
                  />
                </div>

                <div className="flex flex-wrap items-center gap-3">
                  <button
                    type="submit"
                    disabled={isSubmitting}
                    className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-blue-500 disabled:cursor-not-allowed disabled:opacity-60 cursor-pointer"
                  >
                    {isSubmitting ? (
                      <>
                        <Loader2 className="h-4 w-4 animate-spin" />
                        Verifying batch...
                      </>
                    ) : (
                      <>
                        <Play className="h-4 w-4" />
                        Verify batch
                      </>
                    )}
                  </button>

                  <button
                    type="button"
                    onClick={handleClear}
                    disabled={isSubmitting}
                    className="inline-flex items-center gap-2 rounded-lg border border-slate-700 bg-slate-800 px-4 py-2.5 text-sm font-semibold text-slate-200 transition hover:border-red-500/40 hover:bg-red-500/10 hover:text-red-200 disabled:opacity-50 cursor-pointer"
                  >
                    <Trash2 className="h-4 w-4" />
                    Clear key and results
                  </button>
                </div>
              </form>
            </section>

            {results && summary && (
              <section className="rounded-2xl border border-slate-800 bg-slate-900 p-6 sm:p-8 shadow-xl space-y-6">
                <h2 className="text-lg font-bold text-white">
                  Bulk Verification Results
                </h2>

                <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
                  <div className="rounded-xl border border-slate-800 bg-slate-950/70 p-3.5">
                    <p className="text-xs uppercase tracking-wider text-slate-400">
                      Submitted
                    </p>
                    <p className="mt-1 text-2xl font-bold text-white">
                      {summary.submitted}
                    </p>
                  </div>
                  <div className="rounded-xl border border-slate-800 bg-slate-950/70 p-3.5">
                    <p className="text-xs uppercase tracking-wider text-slate-400">
                      Found
                    </p>
                    <p className="mt-1 text-2xl font-bold text-blue-300">
                      {summary.found}
                    </p>
                  </div>
                  <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-3.5">
                    <p className="text-xs uppercase tracking-wider text-emerald-300">
                      Valid / Issued
                    </p>
                    <p className="mt-1 text-2xl font-bold text-emerald-200">
                      {summary.issued}
                    </p>
                  </div>
                  <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-3.5">
                    <p className="text-xs uppercase tracking-wider text-amber-300">
                      Revoked
                    </p>
                    <p className="mt-1 text-2xl font-bold text-amber-200">
                      {summary.revoked}
                    </p>
                  </div>
                  <div className="rounded-xl border border-red-500/30 bg-red-500/10 p-3.5">
                    <p className="text-xs uppercase tracking-wider text-red-300">
                      Not Found
                    </p>
                    <p className="mt-1 text-2xl font-bold text-red-200">
                      {summary.notFound}
                    </p>
                  </div>
                </div>

                <div className="overflow-x-auto">
                  <table className="w-full text-left text-sm">
                    <thead className="border-b border-slate-800 text-xs uppercase tracking-wider text-slate-400">
                      <tr>
                        <th className="pb-3 pr-4">#</th>
                        <th className="pb-3 pr-4">Verification Code</th>
                        <th className="pb-3 pr-4">Status</th>
                        <th className="pb-3 pr-4">Course</th>
                        <th className="pb-3 pr-4">Training Centre</th>
                        <th className="pb-3 pr-4">Issued At</th>
                        <th className="pb-3">Revoked At</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-800/80">
                      {results.map((item, idx) => (
                        <tr key={`${idx}-${item.verificationCode}`}>
                          <td className="py-3 pr-4 text-xs text-slate-500">
                            {idx + 1}
                          </td>
                          <td className="py-3 pr-4 font-mono text-xs text-white">
                            {item.verificationCode}
                          </td>
                          <td className="py-3 pr-4">
                            {!item.found ? (
                              <span className="inline-flex rounded-full border border-red-500/30 bg-red-500/10 px-2.5 py-0.5 text-xs font-semibold text-red-300">
                                NOT FOUND
                              </span>
                            ) : item.status === "REVOKED" || !item.verified ? (
                              <span className="inline-flex rounded-full border border-amber-500/30 bg-amber-500/10 px-2.5 py-0.5 text-xs font-semibold text-amber-300">
                                REVOKED
                              </span>
                            ) : (
                              <span className="inline-flex rounded-full border border-emerald-500/30 bg-emerald-500/10 px-2.5 py-0.5 text-xs font-semibold text-emerald-300">
                                ISSUED
                              </span>
                            )}
                          </td>
                          <td className="py-3 pr-4 text-slate-200">
                            {item.found ? item.course : "—"}
                          </td>
                          <td className="py-3 pr-4 text-slate-200">
                            {item.found ? item.trainingCentre : "—"}
                          </td>
                          <td className="py-3 pr-4 text-xs text-slate-300">
                            {item.found ? formatDateTime(item.issuedAt) : "—"}
                          </td>
                          <td className="py-3 text-xs text-slate-300">
                            {item.found ? formatDateTime(item.revokedAt) : "—"}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </section>
            )}
          </>
        )}
      </div>
    </main>
  );
}
