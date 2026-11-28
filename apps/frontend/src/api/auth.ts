import type { LoginFormValues, RegisterFormValues } from "../schemas/auth";

export interface AuthUser {
  id: string;
  name: string;
  email: string;
  createdAt: string;
  updatedAt: string;
}

export interface CurrentUser extends AuthUser {
  roles: string[];
  permissions: string[];
}

export interface AuthSuccessData {
  user: AuthUser;
  token: string;
}

interface ApiSuccessResponse<T> {
  success: true;
  data: T;
}

interface ApiErrorResponse {
  success: false;
  error?: {
    message?: string;
    details?: unknown;
  };
}

export class ApiError extends Error {
  readonly status: number;
  readonly details?: unknown;

  constructor(message: string, status: number, details?: unknown) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.details = details;
  }
}

export async function parseApiResponse<T>(response: Response): Promise<T> {
  let payload: ApiSuccessResponse<T> | ApiErrorResponse;

  try {
    payload = (await response.json()) as ApiSuccessResponse<T> | ApiErrorResponse;
  } catch {
    if (!response.ok) {
      throw new ApiError("Request failed. Please try again.", response.status);
    }
    throw new ApiError("Unexpected response from server.", response.status);
  }

  if (!response.ok || !payload || payload.success === false) {
    const errorPayload =
      payload && payload.success === false ? payload.error : undefined;
    throw new ApiError(
      errorPayload?.message ?? "Request failed. Please try again.",
      response.status,
      errorPayload?.details
    );
  }

  return payload.data;
}

export async function registerUser(input: RegisterFormValues): Promise<AuthSuccessData> {
  const response = await fetch("/api/auth/register", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(input),
  });

  return parseApiResponse<AuthSuccessData>(response);
}

export async function loginUser(input: LoginFormValues): Promise<AuthSuccessData> {
  const response = await fetch("/api/auth/login", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(input),
  });

  return parseApiResponse<AuthSuccessData>(response);
}

export async function getCurrentUser(token: string): Promise<CurrentUser> {
  const response = await fetch("/api/auth/me", {
    method: "GET",
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });

  const data = await parseApiResponse<{ user: CurrentUser }>(response);
  return data.user;
}
