import { useCallback, useMemo, useState, type ReactNode } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ApiError, getCurrentUser } from "../api/auth";
import {
  AuthContext,
  clearStoredToken,
  getStoredToken,
  setStoredToken,
  type AuthContextValue,
} from "./auth-context";

interface AuthProviderProps {
  children: ReactNode;
}

export function AuthProvider({ children }: AuthProviderProps) {
  const queryClient = useQueryClient();
  const [token, setToken] = useState<string | null>(() => getStoredToken());

  const { data, isPending, error, refetch } = useQuery({
    queryKey: ["auth", "me", token],
    queryFn: async () => {
      try {
        return await getCurrentUser(token!);
      } catch (err) {
        if (err instanceof ApiError && err.status === 401) {
          clearStoredToken();
          setToken(null);
          queryClient.removeQueries({ queryKey: ["auth", "me"] });
        }
        throw err;
      }
    },
    enabled: Boolean(token),
    retry: (failureCount, err) => {
      if (err instanceof ApiError && (err.status === 401 || err.status === 404)) {
        return false;
      }
      return failureCount < 1;
    },
  });

  const setAuthToken = useCallback((newToken: string) => {
    setStoredToken(newToken);
    setToken(newToken);
  }, []);

  const logout = useCallback(() => {
    clearStoredToken();
    setToken(null);
    queryClient.removeQueries({ queryKey: ["auth", "me"] });
  }, [queryClient]);

  const retrySession = useCallback(() => {
    void refetch();
  }, [refetch]);

  const value = useMemo<AuthContextValue>(
    () => ({
      token,
      user: token ? (data ?? null) : null,
      isLoadingSession: Boolean(token) && isPending,
      sessionError: token && error instanceof Error ? error : null,
      setAuthToken,
      logout,
      retrySession,
    }),
    [token, data, isPending, error, setAuthToken, logout, retrySession]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
