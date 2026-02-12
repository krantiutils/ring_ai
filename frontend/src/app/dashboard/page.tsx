"use client";

import { useEffect, useState } from "react";
import { Megaphone, Users, Zap, CreditCard } from "lucide-react";
import { campaigns, type PaginatedResponse, type Campaign } from "@/lib/api";
import { cn } from "@/lib/utils";

interface StatCardProps {
  label: string;
  value: string | number;
  icon: React.ComponentType<{ className?: string }>;
  color: string;
}

function StatCard({ label, value, icon: Icon, color }: StatCardProps) {
  return (
    <div className="clay-surface p-6 flex items-start gap-4">
      <div
        className={cn("rounded-2xl p-3", color)}
      >
        <Icon className="w-5 h-5 text-white" />
      </div>
      <div>
        <p className="text-sm text-gray-500">{label}</p>
        <p className="text-2xl font-bold mt-1">{value}</p>
      </div>
    </div>
  );
}

export default function DashboardOverview() {
  const [data, setData] = useState<PaginatedResponse<Campaign> | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    campaigns
      .list({ page: 1, page_size: 100 })
      .then(setData)
      .catch((err) => setError(err instanceof Error ? err.message : "Failed to load"));
  }, []);

  const total = data?.total ?? 0;
  const active = data?.items.filter((c) => c.status === "active").length ?? 0;

  return (
    <div>
      <h1 className="text-2xl font-bold mb-6">Dashboard</h1>

      {error && (
        <div className="mb-6 p-4 rounded-xl bg-red-50 text-red-700 text-sm">
          {error}
        </div>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
        <StatCard
          label="Total Campaigns"
          value={total}
          icon={Megaphone}
          color="bg-[var(--clay-coral)]"
        />
        <StatCard
          label="Active Campaigns"
          value={active}
          icon={Zap}
          color="bg-[var(--clay-teal)]"
        />
        <StatCard
          label="Total Contacts"
          value="—"
          icon={Users}
          color="bg-[var(--clay-lavender)] !text-[var(--clay-dark)]"
        />
        <StatCard
          label="Credits Used"
          value="—"
          icon={CreditCard}
          color="bg-[var(--clay-gold)]"
        />
      </div>

      {/* Recent campaigns */}
      {data && data.items.length > 0 && (
        <div className="mt-10">
          <h2 className="text-lg font-semibold mb-4">Recent Campaigns</h2>
          <div className="clay-surface overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100">
                  <th className="text-left px-6 py-3 font-medium text-gray-500">
                    Name
                  </th>
                  <th className="text-left px-6 py-3 font-medium text-gray-500">
                    Type
                  </th>
                  <th className="text-left px-6 py-3 font-medium text-gray-500">
                    Status
                  </th>
                  <th className="text-left px-6 py-3 font-medium text-gray-500">
                    Created
                  </th>
                </tr>
              </thead>
              <tbody>
                {data.items.slice(0, 5).map((c) => (
                  <tr
                    key={c.id}
                    className="border-b border-gray-50 last:border-0"
                  >
                    <td className="px-6 py-3 font-medium">{c.name}</td>
                    <td className="px-6 py-3 capitalize">{c.type}</td>
                    <td className="px-6 py-3">
                      <StatusBadge status={c.status} />
                    </td>
                    <td className="px-6 py-3 text-gray-500">
                      {new Date(c.created_at).toLocaleDateString()}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const styles: Record<string, string> = {
    draft: "bg-gray-100 text-gray-600",
    active: "bg-green-100 text-green-700",
    paused: "bg-yellow-100 text-yellow-700",
    completed: "bg-blue-100 text-blue-700",
  };

  return (
    <span
      className={cn(
        "inline-block px-2.5 py-0.5 rounded-full text-xs font-medium capitalize",
        styles[status] ?? "bg-gray-100 text-gray-600",
      )}
    >
      {status}
    </span>
  );
}
