import { LogOut } from "lucide-react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "../auth/auth-context";

export function AppHeader() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  if (!user) {
    return null;
  }

  const permissions = new Set(user.permissions);
  const roles = new Set(user.roles);
  const canAccessPartnerKeys =
    permissions.has("partner_keys.read") ||
    permissions.has("partner_keys.manage");
  const canAccessDemo =
    roles.has("STATE_OFFICE") || roles.has("ADMIN");

  const handleLogout = () => {
    logout();
    navigate("/login", { replace: true });
  };

  return (
    <header className="flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-slate-800 bg-slate-900 px-6 py-4 shadow-lg">
      <div className="flex flex-wrap items-center gap-4">
        <Link
          to="/"
          className="text-left group focus:outline-none"
        >
          <p className="text-xs font-semibold uppercase tracking-widest text-blue-400">
            SkillPass
          </p>
          <p className="mt-0.5 text-lg font-bold text-white group-hover:text-blue-200 transition">
            Batch &amp; Certificate Console
          </p>
        </Link>

        <div className="hidden h-8 w-px bg-slate-800 sm:block" />

        <div className="text-sm">
          <p className="font-medium text-slate-100">{user.name}</p>
          <p className="text-xs text-slate-400">{user.email}</p>
        </div>

        <div className="flex flex-wrap gap-1.5">
          {user.roles.map((role) => (
            <span
              key={role}
              className="rounded-full border border-blue-500/30 bg-blue-500/10 px-2.5 py-0.5 text-xs font-semibold text-blue-300"
            >
              {role}
            </span>
          ))}
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2.5">
        {canAccessPartnerKeys && (
          <Link
            to="/partner-keys"
            className="inline-flex items-center rounded-lg border border-slate-700 bg-slate-800 px-3.5 py-2 text-sm font-semibold text-slate-200 transition hover:border-blue-500/40 hover:text-blue-300"
          >
            Partner API Keys
          </Link>
        )}

        {canAccessDemo && (
          <Link
            to="/partner-verify-demo"
            className="inline-flex items-center rounded-lg border border-slate-700 bg-slate-800 px-3.5 py-2 text-sm font-semibold text-slate-200 transition hover:border-blue-500/40 hover:text-blue-300"
          >
            Bulk Verify Demo
          </Link>
        )}

        <Link
          to="/verify"
          className="inline-flex items-center rounded-lg border border-slate-700 bg-slate-800 px-3.5 py-2 text-sm font-semibold text-slate-200 transition hover:border-blue-500/40 hover:text-blue-300"
        >
          Verify Certificate
        </Link>

        <button
          type="button"
          onClick={handleLogout}
          className="inline-flex items-center gap-2 rounded-lg border border-slate-700 bg-slate-800 px-3.5 py-2 text-sm font-semibold text-slate-200 transition hover:border-red-500/40 hover:bg-red-500/10 hover:text-red-300 cursor-pointer"
        >
          <LogOut className="h-4 w-4" />
          Log out
        </button>
      </div>
    </header>
  );
}
