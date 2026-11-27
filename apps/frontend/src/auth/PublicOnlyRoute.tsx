import type { ReactNode } from "react";
import { Navigate } from "react-router-dom";
import { Loader2 } from "lucide-react";
import { useAuth } from "./auth-context";

interface PublicOnlyRouteProps {
  children: ReactNode;
}

export function PublicOnlyRoute({ children }: PublicOnlyRouteProps) {
  const { token, user, isLoadingSession } = useAuth();

  if (token && isLoadingSession) {
    return (
      <main className="min-h-screen bg-slate-950 text-slate-100 flex items-center justify-center p-6">
        <div className="flex flex-col items-center gap-3 text-slate-300">
          <Loader2 className="h-8 w-8 animate-spin text-blue-400" />
          <p className="text-sm font-medium">Checking your session...</p>
        </div>
      </main>
    );
  }

  if (token && user) {
    return <Navigate to="/" replace />;
  }

  return <>{children}</>;
}
