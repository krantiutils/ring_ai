"use client";

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useSyncExternalStore,
  type ReactNode,
} from "react";
import { useRouter } from "next/navigation";

interface AuthUser {
  email: string;
  org_id: string;
}

interface AuthContextValue {
  user: AuthUser | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<void>;
  register: (email: string, password: string, orgName: string) => Promise<void>;
  logout: () => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

const STORAGE_KEY_TOKEN = "ring_ai_token";
const STORAGE_KEY_USER = "ring_ai_user";

function readUserFromStorage(): AuthUser | null {
  try {
    const stored = localStorage.getItem(STORAGE_KEY_USER);
    if (stored) return JSON.parse(stored);
  } catch {
    // corrupted storage
  }
  return null;
}

function subscribe(callback: () => void) {
  window.addEventListener("storage", callback);
  return () => window.removeEventListener("storage", callback);
}

let snapshotVersion = 0;
let cachedUser: AuthUser | null | undefined;

function getSnapshot(): AuthUser | null {
  // Cache to avoid parsing on every render
  const currentVersion = snapshotVersion;
  if (cachedUser === undefined || currentVersion !== snapshotVersion) {
    cachedUser = readUserFromStorage();
  }
  return cachedUser;
}

function getServerSnapshot(): AuthUser | null {
  return null;
}

function invalidateCache() {
  snapshotVersion++;
  cachedUser = undefined;
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const user = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
  const router = useRouter();

  // Not loading since useSyncExternalStore is synchronous on client
  const loading = false;

  const login = useCallback(
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    async (email: string, password: string) => {
      // TODO: Wire to real backend auth endpoint when available.
      // For now, demo mode: any login succeeds with a placeholder org.
      const demoUser: AuthUser = {
        email,
        org_id: "00000000-0000-0000-0000-000000000001",
      };
      localStorage.setItem(STORAGE_KEY_TOKEN, "demo-token");
      localStorage.setItem(STORAGE_KEY_USER, JSON.stringify(demoUser));
      invalidateCache();
      router.push("/dashboard");
    },
    [router],
  );

  const register = useCallback(
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    async (email: string, password: string, orgName: string) => {
      // TODO: Wire to real backend auth endpoint when available.
      const demoUser: AuthUser = {
        email,
        org_id: "00000000-0000-0000-0000-000000000001",
      };
      localStorage.setItem(STORAGE_KEY_TOKEN, "demo-token");
      localStorage.setItem(STORAGE_KEY_USER, JSON.stringify(demoUser));
      invalidateCache();
      router.push("/dashboard");
    },
    [router],
  );

  const logout = useCallback(() => {
    localStorage.removeItem(STORAGE_KEY_TOKEN);
    localStorage.removeItem(STORAGE_KEY_USER);
    invalidateCache();
    router.push("/login");
  }, [router]);

  const value = useMemo(
    () => ({ user, loading, login, register, logout }),
    [user, loading, login, register, logout],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return ctx;
}
