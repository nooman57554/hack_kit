import { zodResolver } from "@hookform/resolvers/zod";
import { useQuery } from "@tanstack/react-query";
import {
  AlertCircle,
  Loader2,
  Search,
  ShieldAlert,
  ShieldCheck,
  ShieldX,
} from "lucide-react";
import { useMemo, useState } from "react";
import { useForm } from "react-hook-form";
import { Link, useNavigate, useParams } from "react-router-dom";
import {
  deriveVerificationViewState,
  verifyCertificatePublic,
} from "../api/verify";
import { useAuth } from "../auth/auth-context";
import {
  normalizeVerificationCode,
  VERIFICATION_CODE_REGEX,
  verifyCertificateSchema,
  type VerifyCertificateFormValues,
} from "../schemas/verify";

function formatDateTime(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }
  return date.toLocaleString();
}

export function VerifyCertificatePage() {
  const { verificationCode: routeCode } = useParams<{
    verificationCode?: string;
  }>();
  const navigate = useNavigate();
  const { token } = useAuth();
  const isAuthenticated = Boolean(token);

  const initialNormalized = useMemo(
    () => (routeCode ? normalizeVerificationCode(routeCode) : ""),
    [routeCode]
  );

  const initialValidCode = useMemo(
    () =>
      initialNormalized && VERIFICATION_CODE_REGEX.test(initialNormalized)
        ? initialNormalized
        : null,
    [initialNormalized]
  );

  const [submittedCode, setSubmittedCode] = useState<string | null>(
    initialValidCode
  );
  const [prevInitialCode, setPrevInitialCode] = useState(initialValidCode);

  if (initialValidCode !== prevInitialCode) {
    setPrevInitialCode(initialValidCode);
    setSubmittedCode(initialValidCode);
  }

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<VerifyCertificateFormValues>({
    resolver: zodResolver(verifyCertificateSchema),
    defaultValues: {
      verificationCode: initialNormalized,
    },
  });

  const verificationQuery = useQuery({
    queryKey: ["public-certificate-verify", submittedCode],
    queryFn: () => verifyCertificatePublic(submittedCode!),
    enabled: submittedCode !== null,
    retry: false,
    staleTime: 0,
    gcTime: 0,
  });

  const viewState = deriveVerificationViewState({
    submittedCode,
    isLoading: verificationQuery.isLoading,
    isFetching: verificationQuery.isFetching,
    isError: verificationQuery.isError,
    error: verificationQuery.error,
    data: verificationQuery.data,
  });

  const onSubmit = (values: VerifyCertificateFormValues) => {
    const normalized = normalizeVerificationCode(values.verificationCode);
    setSubmittedCode(normalized);
    if (normalized !== initialValidCode) {
      navigate(`/verify/${encodeURIComponent(normalized)}`, { replace: true });
    } else {
      void verificationQuery.refetch();
    }
  };

  const urlCodeInvalid =
    Boolean(routeCode) && !VERIFICATION_CODE_REGEX.test(initialNormalized);

  return (
    <main className="min-h-screen bg-slate-950 text-slate-100 px-4 py-8 sm:p-8 flex flex-col items-center justify-center">
      <div className="w-full max-w-2xl space-y-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-xs font-semibold uppercase tracking-widest text-blue-400">
              SkillPass
            </p>
            <h1 className="mt-1 text-2xl sm:text-3xl font-bold tracking-tight text-white">
              Certificate Verification
            </h1>
            <p className="mt-1 text-sm text-slate-400">
              Verify whether a certificate verification code is valid or revoked.
            </p>
          </div>

          <Link
            to={isAuthenticated ? "/" : "/login"}
            className="rounded-lg border border-slate-700 bg-slate-900 px-3.5 py-2 text-xs font-semibold text-slate-200 transition hover:border-blue-500/40 hover:text-blue-300"
          >
            {isAuthenticated ? "Back to Console" : "Staff Sign In"}
          </Link>
        </div>

        <section className="rounded-2xl border border-slate-800 bg-slate-900 p-6 sm:p-8 shadow-xl">
          <form onSubmit={handleSubmit(onSubmit)} noValidate className="space-y-4">
            <div>
              <label
                htmlFor="verificationCode"
                className="block text-sm font-medium text-slate-300"
              >
                Verification Code
              </label>
              <div className="mt-1.5 flex flex-col sm:flex-row gap-3">
                <input
                  id="verificationCode"
                  type="text"
                  autoComplete="off"
                  spellCheck={false}
                  placeholder="SP-ABCD1234-EF567890"
                  {...register("verificationCode")}
                  className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3.5 py-2.5 font-mono text-sm uppercase text-slate-50 placeholder:text-slate-500 focus:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-500/30"
                />
                <button
                  type="submit"
                  disabled={viewState.kind === "loading"}
                  className="inline-flex shrink-0 items-center justify-center gap-2 rounded-lg bg-blue-600 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-blue-500 disabled:cursor-not-allowed disabled:opacity-60 cursor-pointer"
                >
                  {viewState.kind === "loading" ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin" />
                      Verifying...
                    </>
                  ) : (
                    <>
                      <Search className="h-4 w-4" />
                      Verify
                    </>
                  )}
                </button>
              </div>
              {errors.verificationCode ? (
                <p className="mt-1.5 text-xs text-red-400">
                  {errors.verificationCode.message}
                </p>
              ) : urlCodeInvalid && viewState.kind === "idle" ? (
                <p className="mt-1.5 text-xs text-red-400">
                  The URL verification code does not match the format
                  SP-XXXXXXXX-XXXXXXXX.
                </p>
              ) : (
                <p className="mt-1.5 text-xs text-slate-400">
                  Enter the exact code printed on the certificate (e.g.
                  SP-XXXXXXXX-XXXXXXXX).
                </p>
              )}
            </div>
          </form>

          {viewState.kind === "loading" && (
            <div
              role="status"
              className="mt-6 flex items-center gap-3 rounded-xl border border-slate-800 bg-slate-950/70 p-4 text-sm text-slate-300"
            >
              <Loader2 className="h-5 w-5 animate-spin text-blue-400 shrink-0" />
              <span>
                Checking certificate status for{" "}
                <span className="font-mono font-semibold text-white">
                  {viewState.verificationCode}
                </span>
                ...
              </span>
            </div>
          )}

          {viewState.kind === "valid" && (
            <div
              role="region"
              aria-label="Verification result"
              className="mt-6 rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-5"
            >
              <div className="flex items-start gap-3">
                <ShieldCheck className="h-6 w-6 text-emerald-400 shrink-0 mt-0.5" />
                <div className="min-w-0 flex-1">
                  <span className="inline-flex items-center rounded-full border border-emerald-500/40 bg-emerald-500/20 px-2.5 py-0.5 text-xs font-semibold text-emerald-300">
                    Valid Certificate ({viewState.certificate.status})
                  </span>
                  <h2 className="mt-2 text-lg font-semibold text-white">
                    {viewState.certificate.course}
                  </h2>
                  <dl className="mt-4 grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
                    <div>
                      <dt className="text-xs uppercase tracking-wider text-slate-400">
                        Verification Code
                      </dt>
                      <dd className="mt-0.5 font-mono text-slate-100">
                        {viewState.certificate.verificationCode}
                      </dd>
                    </div>
                    <div>
                      <dt className="text-xs uppercase tracking-wider text-slate-400">
                        Training Centre
                      </dt>
                      <dd className="mt-0.5 text-slate-100">
                        {viewState.certificate.trainingCentre}
                      </dd>
                    </div>
                    <div>
                      <dt className="text-xs uppercase tracking-wider text-slate-400">
                        Issued At
                      </dt>
                      <dd className="mt-0.5 text-slate-100">
                        {formatDateTime(viewState.certificate.issuedAt)}
                      </dd>
                    </div>
                  </dl>
                </div>
              </div>
            </div>
          )}

          {viewState.kind === "revoked" && (
            <div
              role="region"
              aria-label="Verification result"
              className="mt-6 rounded-xl border border-amber-500/40 bg-amber-500/10 p-5"
            >
              <div className="flex items-start gap-3">
                <ShieldAlert className="h-6 w-6 text-amber-400 shrink-0 mt-0.5" />
                <div className="min-w-0 flex-1">
                  <span className="inline-flex items-center rounded-full border border-amber-500/40 bg-amber-500/20 px-2.5 py-0.5 text-xs font-semibold text-amber-300">
                    Revoked Certificate ({viewState.certificate.status})
                  </span>
                  <h2 className="mt-2 text-lg font-semibold text-white">
                    {viewState.certificate.course}
                  </h2>
                  <p className="mt-1 text-sm text-amber-200/90">
                    This certificate has been revoked and is no longer valid.
                  </p>
                  <dl className="mt-4 grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
                    <div>
                      <dt className="text-xs uppercase tracking-wider text-slate-400">
                        Verification Code
                      </dt>
                      <dd className="mt-0.5 font-mono text-slate-100">
                        {viewState.certificate.verificationCode}
                      </dd>
                    </div>
                    <div>
                      <dt className="text-xs uppercase tracking-wider text-slate-400">
                        Training Centre
                      </dt>
                      <dd className="mt-0.5 text-slate-100">
                        {viewState.certificate.trainingCentre}
                      </dd>
                    </div>
                    <div>
                      <dt className="text-xs uppercase tracking-wider text-slate-400">
                        Issued At
                      </dt>
                      <dd className="mt-0.5 text-slate-100">
                        {formatDateTime(viewState.certificate.issuedAt)}
                      </dd>
                    </div>
                    {viewState.certificate.revokedAt && (
                      <div>
                        <dt className="text-xs uppercase tracking-wider text-slate-400">
                          Revoked At
                        </dt>
                        <dd className="mt-0.5 text-slate-100">
                          {formatDateTime(viewState.certificate.revokedAt)}
                        </dd>
                      </div>
                    )}
                  </dl>
                </div>
              </div>
            </div>
          )}

          {viewState.kind === "not_found" && (
            <div
              role="alert"
              className="mt-6 flex items-start gap-3 rounded-xl border border-red-500/30 bg-red-500/10 p-5 text-sm text-red-200"
            >
              <ShieldX className="h-6 w-6 text-red-400 shrink-0 mt-0.5" />
              <div>
                <p className="font-semibold text-white">Certificate Not Found</p>
                <p className="mt-1 text-red-200/90">
                  No issued or revoked certificate matches verification code{" "}
                  <span className="font-mono font-semibold">
                    {viewState.verificationCode}
                  </span>
                  .
                </p>
              </div>
            </div>
          )}

          {viewState.kind === "error" && (
            <div
              role="alert"
              className="mt-6 flex items-start justify-between gap-3 rounded-xl border border-red-500/30 bg-red-500/10 p-4 text-sm text-red-200"
            >
              <div className="flex items-start gap-2.5">
                <AlertCircle className="h-5 w-5 text-red-400 shrink-0 mt-0.5" />
                <span>{viewState.message}</span>
              </div>
              <button
                type="button"
                onClick={() => void verificationQuery.refetch()}
                className="shrink-0 rounded-md border border-red-400/40 px-3 py-1 text-xs font-semibold text-red-200 hover:bg-red-500/20 cursor-pointer"
              >
                Retry
              </button>
            </div>
          )}
        </section>
      </div>
    </main>
  );
}
