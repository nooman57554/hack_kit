import { KeyRound, LogOut, Mail, Shield, User as UserIcon } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../auth/auth-context";

export function HomePage() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  if (!user) {
    return null;
  }

  const handleLogout = () => {
    logout();
    navigate("/login", { replace: true });
  };

  return (
    <main className="min-h-screen bg-slate-950 text-slate-100 p-6 sm:p-10">
      <div className="mx-auto max-w-3xl space-y-6">
        <header className="flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-slate-800 bg-slate-900 px-6 py-5 shadow-lg">
          <div>
            <p className="text-xs font-semibold uppercase tracking-widest text-blue-400">
              Hack Kit
            </p>
            <h1 className="mt-1 text-xl font-bold text-white">
              Authenticated Workspace
            </h1>
          </div>

          <button
            type="button"
            onClick={handleLogout}
            className="inline-flex items-center gap-2 rounded-lg border border-slate-700 bg-slate-800 px-4 py-2 text-sm font-semibold text-slate-200 transition hover:border-red-500/40 hover:bg-red-500/10 hover:text-red-300 cursor-pointer"
          >
            <LogOut className="h-4 w-4" />
            Log out
          </button>
        </header>

        <section className="rounded-2xl border border-slate-800 bg-slate-900 p-6 sm:p-8 shadow-xl space-y-6">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="rounded-xl border border-slate-800 bg-slate-950/60 p-4">
              <div className="flex items-center gap-2 text-xs font-medium uppercase tracking-wider text-slate-400">
                <UserIcon className="h-3.5 w-3.5 text-blue-400" />
                Name
              </div>
              <p className="mt-2 text-base font-semibold text-white">{user.name}</p>
            </div>

            <div className="rounded-xl border border-slate-800 bg-slate-950/60 p-4">
              <div className="flex items-center gap-2 text-xs font-medium uppercase tracking-wider text-slate-400">
                <Mail className="h-3.5 w-3.5 text-blue-400" />
                Email
              </div>
              <p className="mt-2 text-base font-semibold text-white break-all">
                {user.email}
              </p>
            </div>
          </div>

          <div className="rounded-xl border border-slate-800 bg-slate-950/60 p-5">
            <div className="flex items-center gap-2 text-xs font-medium uppercase tracking-wider text-slate-400">
              <Shield className="h-3.5 w-3.5 text-blue-400" />
              Assigned Roles
            </div>
            {user.roles.length > 0 ? (
              <div className="mt-3 flex flex-wrap gap-2">
                {user.roles.map((role) => (
                  <span
                    key={role}
                    className="inline-flex items-center rounded-full border border-blue-500/30 bg-blue-500/10 px-3 py-1 text-xs font-semibold text-blue-300"
                  >
                    {role}
                  </span>
                ))}
              </div>
            ) : (
              <p className="mt-2 text-sm text-slate-400">No roles assigned.</p>
            )}
          </div>

          <div className="rounded-xl border border-slate-800 bg-slate-950/60 p-5">
            <div className="flex items-center gap-2 text-xs font-medium uppercase tracking-wider text-slate-400">
              <KeyRound className="h-3.5 w-3.5 text-emerald-400" />
              Effective Permissions
            </div>
            {user.permissions.length > 0 ? (
              <div className="mt-3 flex flex-wrap gap-2">
                {user.permissions.map((permission) => (
                  <code
                    key={permission}
                    className="rounded-md border border-slate-700 bg-slate-900 px-2.5 py-1 text-xs font-mono text-emerald-300"
                  >
                    {permission}
                  </code>
                ))}
              </div>
            ) : (
              <p className="mt-2 text-sm text-slate-400">No permissions granted.</p>
            )}
          </div>
        </section>
      </div>
    </main>
  );
}
