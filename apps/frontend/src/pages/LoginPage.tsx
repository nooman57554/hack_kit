import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation } from "@tanstack/react-query";
import { AlertCircle, Eye, EyeOff, Loader2, LogIn } from "lucide-react";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { Link, useNavigate } from "react-router-dom";
import { ApiError, loginUser } from "../api/auth";
import { useAuth } from "../auth/auth-context";
import { loginSchema, type LoginFormValues } from "../schemas/auth";

export function LoginPage() {
  const navigate = useNavigate();
  const { setAuthToken } = useAuth();
  const [showPassword, setShowPassword] = useState(false);

  const {
    register,
    handleSubmit,
    setError,
    reset,
    formState: { errors },
  } = useForm<LoginFormValues>({
    resolver: zodResolver(loginSchema),
    defaultValues: {
      email: "",
      password: "",
    },
  });

  const loginMutation = useMutation({
    mutationFn: loginUser,
    onSuccess: (data) => {
      reset({ email: "", password: "" });
      setShowPassword(false);
      setAuthToken(data.token);
      navigate("/", { replace: true });
    },
    onError: (err) => {
      if (
        err instanceof ApiError &&
        err.details &&
        typeof err.details === "object" &&
        !Array.isArray(err.details)
      ) {
        for (const [field, messages] of Object.entries(
          err.details as Record<string, string[] | undefined>
        )) {
          if (messages?.[0] && (field === "email" || field === "password")) {
            setError(field, { message: messages[0] });
          }
        }
      }
    },
  });

  const onSubmit = (values: LoginFormValues) => {
    loginMutation.mutate(values);
  };

  return (
    <main className="min-h-screen bg-slate-950 text-slate-100 flex items-center justify-center p-6">
      <section className="w-full max-w-md rounded-2xl border border-slate-800 bg-slate-900 p-8 shadow-xl">
        <div className="mb-6">
          <p className="text-xs font-semibold uppercase tracking-widest text-blue-400">
            Hack Kit
          </p>
          <h1 className="mt-2 text-2xl font-bold tracking-tight text-white">
            Sign in to your account
          </h1>
          <p className="mt-1.5 text-sm text-slate-400">
            Enter your email and password to access your workspace.
          </p>
        </div>

        {loginMutation.isError && (
          <div
            role="alert"
            className="mb-5 flex items-start gap-2.5 rounded-xl border border-red-500/30 bg-red-500/10 p-3.5 text-sm text-red-300"
          >
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-red-400" />
            <span>
              {loginMutation.error instanceof Error
                ? loginMutation.error.message
                : "Unable to sign in. Please try again."}
            </span>
          </div>
        )}

        <form onSubmit={handleSubmit(onSubmit)} noValidate className="space-y-4">
          <div>
            <label htmlFor="email" className="block text-sm font-medium text-slate-300">
              Email address
            </label>
            <input
              id="email"
              type="email"
              autoComplete="email"
              placeholder="you@example.com"
              {...register("email")}
              className="mt-1.5 w-full rounded-lg border border-slate-700 bg-slate-950 px-3.5 py-2.5 text-sm text-slate-50 placeholder:text-slate-400 focus:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-500/30"
            />
            {errors.email && (
              <p className="mt-1.5 text-xs text-red-400">{errors.email.message}</p>
            )}
          </div>

          <div>
            <label htmlFor="password" className="block text-sm font-medium text-slate-300">
              Password
            </label>
            <div className="relative mt-1.5">
              <input
                id="password"
                type={showPassword ? "text" : "password"}
                autoComplete="current-password"
                placeholder="Enter your password"
                {...register("password")}
                className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3.5 py-2.5 pr-10 text-sm text-slate-50 placeholder:text-slate-400 focus:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-500/30"
              />
              <button
                type="button"
                onClick={() => setShowPassword((prev) => !prev)}
                aria-label={showPassword ? "Hide password" : "Show password"}
                aria-pressed={showPassword}
                className="absolute inset-y-0 right-0 flex items-center px-3 text-slate-400 hover:text-slate-200 transition cursor-pointer"
              >
                {showPassword ? (
                  <EyeOff className="h-4 w-4" aria-hidden="true" />
                ) : (
                  <Eye className="h-4 w-4" aria-hidden="true" />
                )}
              </button>
            </div>
            {errors.password && (
              <p className="mt-1.5 text-xs text-red-400">{errors.password.message}</p>
            )}
          </div>

          <button
            type="submit"
            disabled={loginMutation.isPending}
            className="mt-2 inline-flex w-full items-center justify-center gap-2 rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-blue-500 disabled:cursor-not-allowed disabled:opacity-60 cursor-pointer"
          >
            {loginMutation.isPending ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                Signing in...
              </>
            ) : (
              <>
                <LogIn className="h-4 w-4" />
                Sign in
              </>
            )}
          </button>
        </form>

        <p className="mt-6 text-center text-sm text-slate-400">
          Don&apos;t have an account?{" "}
          <Link
            to="/register"
            className="font-medium text-blue-400 hover:text-blue-300 transition"
          >
            Create one
          </Link>
        </p>

        <p className="mt-3 text-center text-xs text-slate-400">
          Need to check a credential?{" "}
          <Link
            to="/verify"
            className="font-medium text-blue-400 hover:text-blue-300 transition"
          >
            Verify a certificate
          </Link>
        </p>
      </section>
    </main>
  );
}
