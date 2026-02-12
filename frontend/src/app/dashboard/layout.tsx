"use client";

import type { ReactNode } from "react";
import { AuthProvider } from "@/lib/auth";
import { useRequireAuth } from "@/lib/use-require-auth";
import Sidebar from "@/components/dashboard/sidebar";

function DashboardShell({ children }: { children: ReactNode }) {
  const { user, loading } = useRequireAuth();

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[var(--clay-cream)]">
        <div className="animate-pulse text-gray-400 text-sm">Loading…</div>
      </div>
    );
  }

  if (!user) {
    // useRequireAuth will redirect — render nothing while navigating
    return null;
  }

  return (
    <div className="min-h-screen bg-[var(--clay-cream)]">
      <Sidebar />
      <main className="ml-60 p-8">{children}</main>
    </div>
  );
}

export default function DashboardLayout({ children }: { children: ReactNode }) {
  return (
    <AuthProvider>
      <DashboardShell>{children}</DashboardShell>
    </AuthProvider>
  );
}
