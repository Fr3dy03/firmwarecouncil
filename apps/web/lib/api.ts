"use client";

/**
 * Control-room API client + session store.
 * Token lives in localStorage (demo deployment), validated on boot via /auth/me.
 * All fetches go through the Next rewrite: /api/v1/* -> 127.0.0.1:4100.
 */
import { useEffect, useState } from "react";
import type { SessionUser } from "@fc/shared/types";

const TOKEN_KEY = "fc.session.token";
const USER_KEY = "fc.session.user";

export class ApiError extends Error {
  code: string;
  status: number;
  constructor(status: number, code: string, message: string) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

export function storedToken(): string | null {
  if (typeof window === "undefined") return null;
  return localStorage.getItem(TOKEN_KEY);
}

export function saveSession(token: string, user: SessionUser) {
  localStorage.setItem(TOKEN_KEY, token);
  localStorage.setItem(USER_KEY, JSON.stringify(user));
}

export function clearSession() {
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(USER_KEY);
}

export function storedUser(): SessionUser | null {
  if (typeof window === "undefined") return null;
  const raw = localStorage.getItem(USER_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as SessionUser;
  } catch {
    return null;
  }
}

export async function apiFetch<T = any>(path: string, opts: { method?: string; body?: unknown } = {}): Promise<T> {
  const token = storedToken();
  const res = await fetch(path, {
    method: opts.method ?? "GET",
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    ...(opts.body !== undefined ? { body: JSON.stringify(opts.body) } : {}),
  });
  let payload: any = null;
  try {
    payload = await res.json();
  } catch {
    /* non-JSON */
  }
  if (!res.ok) {
    if (res.status === 401) clearSession();
    throw new ApiError(res.status, payload?.error?.code ?? "HTTP_ERROR", payload?.error?.message ?? `Request failed (${res.status})`);
  }
  return payload as T;
}

export async function login(email: string, password: string): Promise<{ token: string; user: SessionUser }> {
  const res = await fetch("/api/v1/auth/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
  });
  const payload = await res.json().catch(() => null);
  if (!res.ok) throw new ApiError(res.status, payload?.error?.code ?? "LOGIN_FAILED", payload?.error?.message ?? "Sign-in failed");
  saveSession(payload.token, payload.user);
  return payload;
}

export function logout() {
  const token = storedToken();
  if (token) {
    void apiFetch("/api/v1/auth/logout", { method: "POST" }).catch(() => undefined);
  }
  clearSession();
}

/** Session hook with silent revalidation against /auth/me. */
export function useSession() {
  const [state, setState] = useState<{ loading: boolean; user: SessionUser | null }>({
    loading: true,
    user: null,
  });
  useEffect(() => {
    let alive = true;
    const token = storedToken();
    if (!token) {
      setState({ loading: false, user: null });
      return;
    }
    setState({ loading: false, user: storedUser() });
    api<{ user: SessionUser }>("/api/v1/auth/me")
      .then((me) => alive && setState({ loading: false, user: me.user }))
      .catch(() => {
        clearSession();
        if (alive) setState({ loading: false, user: null });
      });
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return state;
}

/** Short alias used across pages. */
export const api = apiFetch;
