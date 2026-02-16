"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import Sidebar from "@/components/dashboard/Sidebar";
import TopBar from "@/components/dashboard/TopBar";
import { hasAccessToken } from "@/lib/auth";

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const router = useRouter();

  useEffect(() => {
    if (!hasAccessToken()) {
      router.replace("/login");
    }
  }, [router]);

  return (
    <div className="min-h-screen bg-[#FAFAFA]">
      <Sidebar />
      <div className="transition-all duration-300 md:ml-[260px]">
        <TopBar />
        <main className="p-4 md:p-6">{children}</main>
      </div>
    </div>
  );
}
