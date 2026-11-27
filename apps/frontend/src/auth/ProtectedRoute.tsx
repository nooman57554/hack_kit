import type { ReactNode } from "react";
import { Navigate, useLocation } from "react-router-dom";
import { AlertCircle, Loader2 } from "lucide-react";
import { useAuth } from "./auth-context";

interface ProtectedRouteProps {
  children: ReactNode;
}

export function ProtectedRoute({ children }: ProtectedRouteProps) {
  const { token, user, isLoadingSession, sessionError, logout, retrySession } = useAuth();
  const location = useLocation();

  if (!token) {
    return <Navigate to="/login" replace state={{ from: location }} />;
  }

  if (isLoadingSession) {
    return (
      <main className="min-h-screen bg-slate-950 text-slate-100 flex items-center justify-center p-6">
        <div className="flex flex-col items-center gap-3 text-slate-300">
          <Loader2 className="h-8 w-8 animate-spin text-blue-400" />
          <p className="text-sm font-medium">Checking your session...</p>
        </div>
      </main>
    );
  }

  if (!user) {
    return (
      <main className="min-h-screen bg-slate-950 text-slate-100 flex items-center justify-center p-6">
        <section className="w-full max-w-md rounded-2xl border border-slate-800 bg-slate-900 p-8 shadow-xl">
          <div className="flex items-center gap-3 text-red-400">
            <AlertCircle className="h-6 w-6 shrink-0" />
            <h1 className="text-lg font-semibold">Unable to load session</h1>
          </div>
          <p className="mt-3 text-sm text-slate-300">
            {sessionError?.message ?? "Your session could not be verified."}
          </p>
          <div className="mt-6 flex gap-3">
            <button
              type="button"
              onClick={retrySession}
              className="flex-1 rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-blue-500 transition cursor-pointer"
            >
              Retry
            </button>
            <button
              type="button"
              onClick={logout}
              className="rounded-lg border border-slate-700 bg-slate-800 px-4 py-2.5 text-sm font-semibold text-slate-200 hover:bg-slate-700 transition cursor-pointer"
            >
              Back to login
            </button>
          </div>
        </section>
      </main>
    );
  }

  return <>{children}</>;
}
