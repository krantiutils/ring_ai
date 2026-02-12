"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { AuthProvider, useAuth } from "@/lib/auth";
import Sidebar from "@/components/dashboard/sidebar";

function DashboardShell({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();
  const router = useRouter();
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (mounted && !loading && !user) {
      router.push("/login");
    }
  }, [mounted, loading, user, router]);

  if (!mounted || loading) {
    return (
      <div className="flex h-screen items-center justify-center bg-[#f8f9fc]">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-[#4ECDC4] border-t-transparent" />
      </div>
    );
  }

  if (!user) return null;

  return (
    <div className="min-h-screen bg-[#f8f9fc]">
      <Sidebar />
      <main className="ml-60">
        {/* Top bar */}
        <header className="sticky top-0 z-30 flex h-16 items-center justify-between border-b border-gray-200 bg-white/80 px-6 backdrop-blur-sm">
          <div className="text-sm font-medium text-gray-600">Dashboard</div>
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2 rounded-full bg-gray-100 px-3 py-1.5 text-sm">
              <span className="font-semibold text-[#4ECDC4]">0</span>
              <span className="text-gray-400">|</span>
              <span className="font-semibold text-gray-600">0 Credits</span>
            </div>
            <div className="flex h-8 w-8 items-center justify-center rounded-full bg-[#4ECDC4] text-sm font-bold text-white">
              {user.first_name?.[0]?.toUpperCase() || "U"}
            </div>
          </div>
        </header>
        <div className="p-6">{children}</div>
      </main>
    </div>
  );
}

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <AuthProvider>
      <DashboardShell>{children}</DashboardShell>
    </AuthProvider>
  );
}
