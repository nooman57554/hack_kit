import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  AlertCircle,
  Ban,
  Check,
  Copy,
  KeyRound,
  Loader2,
  Plus,
  ShieldAlert,
  X,
} from "lucide-react";
import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { Link } from "react-router-dom";
import { ApiError } from "../api/auth";
import {
  createPartnerKey,
  listPartnerKeys,
  revokePartnerKey,
  type CreatePartnerKeyResponseData,
  type PartnerKeyMetadata,
} from "../api/partnerKeys";
import { useAuth } from "../auth/auth-context";
import { AppHeader } from "../components/AppHeader";
import {
  createPartnerKeyFormSchema,
  type CreatePartnerKeyFormValues,
} from "../schemas/partnerKeys";

function formatDateTime(value: string | null): string {
  if (!value) {
    return "—";
  }
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? value : parsed.toLocaleString();
}

function StatusBadge({ status }: { status: PartnerKeyMetadata["status"] }) {
  if (status === "ACTIVE") {
    return (
      <span className="inline-flex rounded-full border border-emerald-500/30 bg-emerald-500/10 px-2.5 py-0.5 text-xs font-semibold text-emerald-300">
        ACTIVE
      </span>
    );
  }
  if (status === "REVOKED") {
    return (
      <span className="inline-flex rounded-full border border-red-500/30 bg-red-500/10 px-2.5 py-0.5 text-xs font-semibold text-red-300">
        REVOKED
      </span>
    );
  }
  return (
    <span className="inline-flex rounded-full border border-amber-500/30 bg-amber-500/10 px-2.5 py-0.5 text-xs font-semibold text-amber-300">
      EXPIRED
    </span>
  );
}

export function PartnerKeysPage() {
  const { token, user } = useAuth();
  const queryClient = useQueryClient();

  const permissions = new Set(user?.permissions ?? []);
  const canRead = permissions.has("partner_keys.read");
  const canManage = permissions.has("partner_keys.manage");
  const hasAnyAccess = canRead || canManage;

  const [oneTimeCreatedKey, setOneTimeCreatedKey] =
    useState<CreatePartnerKeyResponseData | null>(null);
  const [copiedSecret, setCopiedSecret] = useState(false);
  const [confirmRevokeKey, setConfirmRevokeKey] =
    useState<PartnerKeyMetadata | null>(null);
  const [actionSuccessMessage, setActionSuccessMessage] = useState<string | null>(
    null
  );

  // Ensure any one-time secret is cleared when navigating away
  useEffect(() => {
    return () => {
      setOneTimeCreatedKey(null);
      setCopiedSecret(false);
    };
  }, []);

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<CreatePartnerKeyFormValues>({
    resolver: zodResolver(createPartnerKeyFormSchema),
    defaultValues: {
      name: "",
      expiresAtLocal: "",
    },
  });

  const keysQuery = useQuery({
    queryKey: ["partner-keys"],
    queryFn: () => listPartnerKeys(token!),
    enabled: Boolean(token && canRead),
  });

  const createMutation = useMutation({
    mutationFn: (values: CreatePartnerKeyFormValues) => {
      const expiresAt =
        values.expiresAtLocal && values.expiresAtLocal.trim()
          ? new Date(values.expiresAtLocal).toISOString()
          : undefined;
      return createPartnerKey(token!, {
        name: values.name.trim(),
        expiresAt,
      });
    },
    onSuccess: (created) => {
      // Keep the one-time raw secret strictly in local component state, never in query cache
      setOneTimeCreatedKey(created);
      setCopiedSecret(false);
      setActionSuccessMessage(
        `Created partner API key "${created.partnerKey.name}" (${created.partnerKey.prefix}).`
      );
      reset({ name: "", expiresAtLocal: "" });
      void queryClient.invalidateQueries({ queryKey: ["partner-keys"] });
    },
  });

  const revokeMutation = useMutation({
    mutationFn: (keyId: string) => revokePartnerKey(token!, keyId),
    onSuccess: (revoked) => {
      setConfirmRevokeKey(null);
      setActionSuccessMessage(
        `Revoked partner API key "${revoked.name}" (${revoked.prefix}).`
      );
      void queryClient.invalidateQueries({ queryKey: ["partner-keys"] });
    },
  });

  if (!user) {
    return null;
  }

  const dismissOneTimeSecret = () => {
    setOneTimeCreatedKey(null);
    setCopiedSecret(false);
  };

  const handleCopySecret = async () => {
    if (!oneTimeCreatedKey) {
      return;
    }
    try {
      await navigator.clipboard.writeText(oneTimeCreatedKey.apiKey);
      setCopiedSecret(true);
    } catch {
      setCopiedSecret(false);
    }
  };

  return (
    <main className="min-h-screen bg-slate-950 text-slate-100 p-6">
      <div className="mx-auto max-w-6xl space-y-6">
        <AppHeader />

        {!hasAnyAccess ? (
          <section className="rounded-2xl border border-red-500/30 bg-slate-900 p-8 shadow-xl">
            <div className="flex items-start gap-3">
              <ShieldAlert className="h-6 w-6 text-red-400 shrink-0 mt-0.5" />
              <div>
                <h1 className="text-xl font-bold text-white">Access Denied</h1>
                <p className="mt-1.5 text-sm text-slate-300">
                  You do not have permission to view or manage partner API keys
                  (`partner_keys.read` or `partner_keys.manage` required).
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
            <section className="rounded-2xl border border-slate-800 bg-slate-900 p-6 sm:p-8 shadow-xl">
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div>
                  <h1 className="text-xl sm:text-2xl font-bold text-white flex items-center gap-2.5">
                    <KeyRound className="h-5 w-5 text-blue-400" />
                    Partner API keys
                  </h1>
                  <p className="mt-1.5 text-sm text-slate-400 max-w-2xl">
                    Partner API keys let authorized external systems call the
                    read-only certificate verification API without user login.
                    Keys are scoped to certificate verification only.
                  </p>
                </div>

                {canRead && !canManage && (
                  <span className="rounded-full border border-slate-700 bg-slate-800 px-3 py-1 text-xs font-semibold text-slate-300">
                    Read-only access
                  </span>
                )}
              </div>

              {actionSuccessMessage && (
                <div className="mt-4 rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-3.5 text-sm text-emerald-200">
                  {actionSuccessMessage}
                </div>
              )}

              {oneTimeCreatedKey && (
                <div
                  role="region"
                  aria-label="New partner API key secret"
                  className="mt-5 rounded-xl border border-amber-500/40 bg-amber-500/10 p-5"
                >
                  <div className="flex items-start justify-between gap-4">
                    <div className="space-y-1">
                      <p className="text-sm font-bold text-amber-200">
                        One-time API key secret — copy now
                      </p>
                      <p className="text-xs text-amber-100/90">
                        {oneTimeCreatedKey.warning}
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={dismissOneTimeSecret}
                      aria-label="Dismiss API key secret"
                      className="rounded-lg border border-amber-400/30 p-1.5 text-amber-200 hover:bg-amber-500/20 cursor-pointer"
                    >
                      <X className="h-4 w-4" />
                    </button>
                  </div>

                  <div className="mt-3 flex flex-col sm:flex-row sm:items-center gap-2.5">
                    <code className="flex-1 break-all rounded-lg border border-amber-500/30 bg-slate-950 px-3.5 py-2.5 font-mono text-xs sm:text-sm text-amber-100">
                      {oneTimeCreatedKey.apiKey}
                    </code>
                    <button
                      type="button"
                      onClick={() => void handleCopySecret()}
                      className="inline-flex shrink-0 items-center justify-center gap-2 rounded-lg bg-amber-500 px-4 py-2.5 text-sm font-semibold text-slate-950 hover:bg-amber-400 cursor-pointer"
                    >
                      {copiedSecret ? (
                        <>
                          <Check className="h-4 w-4" />
                          Copied
                        </>
                      ) : (
                        <>
                          <Copy className="h-4 w-4" />
                          Copy key
                        </>
                      )}
                    </button>
                  </div>
                </div>
              )}

              {canManage && (
                <form
                  onSubmit={handleSubmit((values) => createMutation.mutate(values))}
                  noValidate
                  className="mt-6 rounded-xl border border-slate-800 bg-slate-950/60 p-5 space-y-4"
                >
                  <h2 className="text-sm font-semibold uppercase tracking-wider text-slate-300">
                    Create Partner API Key
                  </h2>

                  {createMutation.isError && (
                    <div
                      role="alert"
                      className="flex items-start gap-2.5 rounded-lg border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-200"
                    >
                      <AlertCircle className="h-4 w-4 text-red-400 shrink-0 mt-0.5" />
                      <span>
                        {createMutation.error instanceof ApiError ||
                        createMutation.error instanceof Error
                          ? createMutation.error.message
                          : "Unable to create partner API key."}
                      </span>
                    </div>
                  )}

                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <div>
                      <label
                        htmlFor="keyName"
                        className="block text-sm font-medium text-slate-300"
                      >
                        Key name
                      </label>
                      <input
                        id="keyName"
                        type="text"
                        placeholder="e.g. Employer Verification Portal"
                        {...register("name")}
                        className="mt-1.5 w-full rounded-lg border border-slate-700 bg-slate-950 px-3.5 py-2 text-sm text-slate-50 placeholder:text-slate-500 focus:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-500/30"
                      />
                      {errors.name && (
                        <p className="mt-1 text-xs text-red-400">
                          {errors.name.message}
                        </p>
                      )}
                    </div>

                    <div>
                      <label
                        htmlFor="expiresAtLocal"
                        className="block text-sm font-medium text-slate-300"
                      >
                        Expiry (optional)
                      </label>
                      <input
                        id="expiresAtLocal"
                        type="datetime-local"
                        {...register("expiresAtLocal")}
                        className="mt-1.5 w-full rounded-lg border border-slate-700 bg-slate-950 px-3.5 py-2 text-sm text-slate-50 focus:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-500/30"
                      />
                      {errors.expiresAtLocal && (
                        <p className="mt-1 text-xs text-red-400">
                          {errors.expiresAtLocal.message}
                        </p>
                      )}
                    </div>

                    <div>
                      <span className="block text-sm font-medium text-slate-300">
                        Scope
                      </span>
                      <div className="mt-1.5 flex h-[38px] items-center rounded-lg border border-slate-800 bg-slate-900 px-3.5 font-mono text-xs text-blue-300">
                        certificates:verify
                      </div>
                    </div>
                  </div>

                  <div>
                    <button
                      type="submit"
                      disabled={createMutation.isPending}
                      className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-blue-500 disabled:cursor-not-allowed disabled:opacity-60 cursor-pointer"
                    >
                      {createMutation.isPending ? (
                        <>
                          <Loader2 className="h-4 w-4 animate-spin" />
                          Creating key...
                        </>
                      ) : (
                        <>
                          <Plus className="h-4 w-4" />
                          Create partner key
                        </>
                      )}
                    </button>
                  </div>
                </form>
              )}
            </section>

            {canRead && (
              <section className="rounded-2xl border border-slate-800 bg-slate-900 p-6 sm:p-8 shadow-xl">
                <h2 className="text-lg font-bold text-white">Issued Keys</h2>

                {revokeMutation.isError && (
                  <div
                    role="alert"
                    className="mt-4 flex items-start gap-2.5 rounded-lg border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-200"
                  >
                    <AlertCircle className="h-4 w-4 text-red-400 shrink-0 mt-0.5" />
                    <span>
                      {revokeMutation.error instanceof Error
                        ? revokeMutation.error.message
                        : "Failed to revoke partner key."}
                    </span>
                  </div>
                )}

                {confirmRevokeKey && (
                  <div
                    role="alertdialog"
                    aria-label="Confirm partner key revocation"
                    className="mt-4 flex flex-wrap items-center justify-between gap-4 rounded-xl border border-red-500/40 bg-red-500/10 p-4"
                  >
                    <div className="text-sm text-red-100">
                      <p className="font-semibold text-white">
                        Revoke partner key &ldquo;{confirmRevokeKey.name}&rdquo;?
                      </p>
                      <p className="mt-0.5 text-xs text-red-200/90">
                        Prefix <span className="font-mono">{confirmRevokeKey.prefix}</span>{" "}
                        will immediately stop authenticating verification requests.
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => setConfirmRevokeKey(null)}
                        disabled={revokeMutation.isPending}
                        className="rounded-lg border border-slate-700 bg-slate-800 px-3.5 py-1.5 text-xs font-semibold text-slate-200 hover:bg-slate-700 cursor-pointer"
                      >
                        Cancel
                      </button>
                      <button
                        type="button"
                        onClick={() => revokeMutation.mutate(confirmRevokeKey.id)}
                        disabled={revokeMutation.isPending}
                        className="inline-flex items-center gap-1.5 rounded-lg bg-red-600 px-3.5 py-1.5 text-xs font-semibold text-white hover:bg-red-500 disabled:opacity-60 cursor-pointer"
                      >
                        {revokeMutation.isPending && (
                          <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        )}
                        Confirm revoke
                      </button>
                    </div>
                  </div>
                )}

                {keysQuery.isLoading ? (
                  <div className="mt-6 flex items-center gap-2.5 text-sm text-slate-400">
                    <Loader2 className="h-4 w-4 animate-spin text-blue-400" />
                    Loading partner API keys...
                  </div>
                ) : keysQuery.isError ? (
                  <div
                    role="alert"
                    className="mt-4 flex items-start gap-2.5 rounded-lg border border-red-500/30 bg-red-500/10 p-4 text-sm text-red-200"
                  >
                    <AlertCircle className="h-4 w-4 text-red-400 shrink-0 mt-0.5" />
                    <span>
                      {keysQuery.error instanceof Error
                        ? keysQuery.error.message
                        : "Unable to load partner API keys."}
                    </span>
                  </div>
                ) : !keysQuery.data || keysQuery.data.length === 0 ? (
                  <p className="mt-6 text-sm text-slate-400">
                    No partner API keys have been created yet.
                  </p>
                ) : (
                  <div className="mt-5 overflow-x-auto">
                    <table className="w-full text-left text-sm">
                      <thead className="border-b border-slate-800 text-xs uppercase tracking-wider text-slate-400">
                        <tr>
                          <th className="pb-3 pr-4">Name</th>
                          <th className="pb-3 pr-4">Prefix</th>
                          <th className="pb-3 pr-4">Scope</th>
                          <th className="pb-3 pr-4">Status</th>
                          <th className="pb-3 pr-4">Created</th>
                          <th className="pb-3 pr-4">Expires</th>
                          <th className="pb-3 pr-4">Last Used</th>
                          {canManage && <th className="pb-3 text-right">Action</th>}
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-800/80">
                        {keysQuery.data.map((item) => (
                          <tr key={item.id} className="align-middle">
                            <td className="py-3.5 pr-4 font-medium text-white">
                              {item.name}
                            </td>
                            <td className="py-3.5 pr-4 font-mono text-xs text-slate-300">
                              {item.prefix}
                            </td>
                            <td className="py-3.5 pr-4 font-mono text-xs text-blue-300">
                              {item.scopes.join(", ")}
                            </td>
                            <td className="py-3.5 pr-4">
                              <StatusBadge status={item.status} />
                            </td>
                            <td className="py-3.5 pr-4 text-xs text-slate-300">
                              {formatDateTime(item.createdAt)}
                            </td>
                            <td className="py-3.5 pr-4 text-xs text-slate-300">
                              {formatDateTime(item.expiresAt)}
                            </td>
                            <td className="py-3.5 pr-4 text-xs text-slate-300">
                              {formatDateTime(item.lastUsedAt)}
                            </td>
                            {canManage && (
                              <td className="py-3.5 text-right">
                                {item.status !== "REVOKED" ? (
                                  <button
                                    type="button"
                                    onClick={() => setConfirmRevokeKey(item)}
                                    disabled={revokeMutation.isPending}
                                    className="inline-flex items-center gap-1.5 rounded-lg border border-red-500/40 bg-red-500/10 px-3 py-1.5 text-xs font-semibold text-red-200 hover:bg-red-500/20 disabled:opacity-50 cursor-pointer"
                                  >
                                    <Ban className="h-3.5 w-3.5" />
                                    Revoke
                                  </button>
                                ) : (
                                  <span className="text-xs text-slate-500">
                                    Revoked
                                  </span>
                                )}
                              </td>
                            )}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </section>
            )}
          </>
        )}
      </div>
    </main>
  );
}
