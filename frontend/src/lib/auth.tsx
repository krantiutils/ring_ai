"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import { useRouter } from "next/navigation";
import type { User } from "./api";
import * as api from "./api";

interface AuthState {
  user: User | null;
  token: string | null;
  loading: boolean;
}

interface AuthContextValue extends AuthState {
  login: (email: string, password: string) => Promise<void>;
  register: (data: {
    first_name: string;
    last_name: string;
    username: string;
    email: string;
    phone?: string;
    password: string;
  }) => Promise<void>;
  logout: () => void;
  orgId: string | null;
}

const AuthContext = createContext<AuthContextValue | null>(null);

function loadStoredAuth(): { user: User | null; token: string | null } {
  if (typeof window === "undefined") return { user: null, token: null };
  const token = localStorage.getItem("ring_ai_token");
  const userStr = localStorage.getItem("ring_ai_user");
  let user: User | null = null;
  if (userStr) {
    try {
      user = JSON.parse(userStr);
    } catch {
      // corrupt data
    }
  }
  return { user, token };
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const stored = loadStoredAuth();
  const [state, setState] = useState<AuthState>({
    user: stored.user,
    token: stored.token,
    loading: !stored.token, // if no token, done loading; if token, verify
  });

  // Verify stored token on mount
  useEffect(() => {
    if (!state.token) {
      setState((s) => ({ ...s, loading: false }));
      return;
    }
    api
      .getUserProfile()
      .then((user) => {
        localStorage.setItem("ring_ai_user", JSON.stringify(user));
        setState({ user, token: state.token, loading: false });
      })
      .catch(() => {
        // Token invalid, clear
        localStorage.removeItem("ring_ai_token");
        localStorage.removeItem("ring_ai_user");
        localStorage.removeItem("ring_ai_org_id");
        setState({ user: null, token: null, loading: false });
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const loginFn = useCallback(async (email: string, password: string) => {
    const resp = await api.login(email, password);
    localStorage.setItem("ring_ai_token", resp.access_token);
    localStorage.setItem("ring_ai_user", JSON.stringify(resp.user));
    setState({ user: resp.user, token: resp.access_token, loading: false });
    router.push("/dashboard");
  }, [router]);

  const registerFn = useCallback(
    async (data: {
      first_name: string;
      last_name: string;
      username: string;
      email: string;
      phone?: string;
      password: string;
    }) => {
      const resp = await api.register(data);
      localStorage.setItem("ring_ai_token", resp.access_token);
      localStorage.setItem("ring_ai_user", JSON.stringify(resp.user));
      setState({ user: resp.user, token: resp.access_token, loading: false });
      router.push("/dashboard");
    },
    [router],
  );

  const logout = useCallback(() => {
    localStorage.removeItem("ring_ai_token");
    localStorage.removeItem("ring_ai_user");
    localStorage.removeItem("ring_ai_org_id");
    setState({ user: null, token: null, loading: false });
    router.push("/login");
  }, [router]);

  // For now, org_id is stored separately (set after login from user's org)
  const orgId =
    typeof window !== "undefined"
      ? localStorage.getItem("ring_ai_org_id")
      : null;

  const value = useMemo<AuthContextValue>(
    () => ({
      ...state,
      login: loginFn,
      register: registerFn,
      logout,
      orgId,
    }),
    [state, loginFn, registerFn, logout, orgId],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}

export function useRequireAuth() {
  const auth = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!auth.loading && !auth.user) {
      router.push("/login");
    }
  }, [auth.loading, auth.user, router]);

  return auth;
}
