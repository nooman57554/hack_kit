import { createContext, useContext } from "react";
import type { CurrentUser } from "../api/auth";

export const AUTH_TOKEN_STORAGE_KEY = "hackkit_access_token";

export function getStoredToken(): string | null {
  try {
    return sessionStorage.getItem(AUTH_TOKEN_STORAGE_KEY);
  } catch {
    return null;
  }
}

export function setStoredToken(token: string): void {
  try {
    sessionStorage.setItem(AUTH_TOKEN_STORAGE_KEY, token);
  } catch {
    // Ignore storage access errors
  }
}

export function clearStoredToken(): void {
  try {
    sessionStorage.removeItem(AUTH_TOKEN_STORAGE_KEY);
  } catch {
    // Ignore storage access errors
  }
}

export interface AuthContextValue {
  token: string | null;
  user: CurrentUser | null;
  isLoadingSession: boolean;
  sessionError: Error | null;
  setAuthToken: (token: string) => void;
  logout: () => void;
  retrySession: () => void;
}

export const AuthContext = createContext<AuthContextValue | null>(null);

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
}
