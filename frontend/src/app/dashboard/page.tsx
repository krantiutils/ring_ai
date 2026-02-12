"use client";

import { useEffect, useState } from "react";
import {
  Megaphone,
  CreditCard,
  Trophy,
  Coins,
  Phone,
  MessageSquare,
  Clock,
  Hash,
  Headphones,
  DollarSign,
} from "lucide-react";
import StatWidget from "@/components/dashboard/StatWidget";
import CampaignTypesChart from "@/components/dashboard/charts/CampaignTypesChart";
import CallOutcomesChart from "@/components/dashboard/charts/CallOutcomesChart";
import PlaybackDistributionChart from "@/components/dashboard/charts/PlaybackDistributionChart";
import CreditUsageChart from "@/components/dashboard/charts/CreditUsageChart";
import { api } from "@/lib/api";
import { formatNumber, formatDuration } from "@/lib/utils";
import type {
  OverviewAnalytics,
  CreditBalance,
  DashboardPlaybackWidget,
  CreditUsagePoint,
} from "@/types/dashboard";

export default function DashboardPage() {
  const [overview, setOverview] = useState<OverviewAnalytics | null>(null);
  const [credits, setCredits] = useState<CreditBalance | null>(null);
  const [playback, setPlayback] = useState<DashboardPlaybackWidget | null>(null);
  const [creditUsage] = useState<CreditUsagePoint[]>([
    { period: "Week 1", message_credits: 120, call_credits: 340 },
    { period: "Week 2", message_credits: 200, call_credits: 280 },
    { period: "Week 3", message_credits: 150, call_credits: 410 },
    { period: "Week 4", message_credits: 280, call_credits: 350 },
  ]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      try {
        const [overviewData, creditData, playbackData] = await Promise.allSettled([
          api.getOverview(),
          api.getCreditBalance(),
          api.getDashboardPlayback(),
        ]);
        if (overviewData.status === "fulfilled") setOverview(overviewData.value);
        if (creditData.status === "fulfilled") setCredits(creditData.value);
        if (playbackData.status === "fulfilled") setPlayback(playbackData.value);
      } catch {
        // Silently handle — widgets show fallback
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  const campaignsByCategory = overview?.campaigns_by_category || {};
  const statusBreakdown = overview?.campaigns_by_status || {};
  const totalCampaigns = overview?.total_campaigns || 0;
  const smsCampaigns = campaignsByCategory["text"] || 0;
  const phoneCampaigns = campaignsByCategory["voice"] || 0;
  const surveyCampaigns = campaignsByCategory["survey"] || 0;
  const combinedCampaigns = campaignsByCategory["combined"] || 0;

  const callOutcomes: Record<string, number> = {
    Unanswered: statusBreakdown["unanswered"] || 0,
    HungUp: statusBreakdown["hung_up"] || 0,
    Failed: statusBreakdown["failed"] || 0,
    Terminated: statusBreakdown["terminated"] || 0,
    Completed: statusBreakdown["completed"] || 0,
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-96">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-600" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Charts Row */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <CampaignTypesChart data={campaignsByCategory} />
        <CallOutcomesChart data={callOutcomes} />
      </div>

      {/* Credit Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatWidget
          title="Credits Purchased"
          value={credits ? formatNumber(credits.total_purchased) : "0"}
          icon={CreditCard}
          iconColor="text-green-500"
        />
        <StatWidget
          title="Credits Top-up"
          value={credits ? formatNumber(credits.total_purchased) : "0"}
          icon={Coins}
          iconColor="text-amber-500"
        />
        <StatWidget
          title="Top Performing Campaign"
          value="--"
          subtitle="No data yet"
          icon={Trophy}
          iconColor="text-indigo-500"
        />
        <StatWidget
          title="Total Credits Used"
          value={credits ? formatNumber(credits.total_consumed) : "0"}
          icon={DollarSign}
          iconColor="text-red-500"
        />
      </div>

      {/* Campaign & Call Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatWidget
          title="Remaining Credits"
          value={credits ? formatNumber(credits.balance) : "0"}
          icon={Coins}
          iconColor="text-emerald-500"
        />
        <StatWidget
          title="Total Campaign(s)"
          value={totalCampaigns}
          subtitle={`SMS: ${smsCampaigns}, Phone: ${phoneCampaigns}, Survey: ${surveyCampaigns}, Combined: ${combinedCampaigns}`}
          icon={Megaphone}
          iconColor="text-blue-500"
        />
        <StatWidget
          title="Total Outbound Calls"
          value={formatNumber(overview?.total_reach || 0)}
          subtitle={`Successful: ${statusBreakdown["completed"] || 0}, Failed: ${statusBreakdown["failed"] || 0}`}
          icon={Phone}
          iconColor="text-teal-500"
        />
        <StatWidget
          title="Total Outbound SMS"
          value="0"
          icon={MessageSquare}
          iconColor="text-purple-500"
        />
      </div>

      {/* Duration, Numbers, Playback */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatWidget
          title="Total Call Duration"
          value={formatDuration(0)}
          icon={Clock}
          iconColor="text-orange-500"
        />
        <StatWidget
          title="Total Owned Numbers"
          value="0"
          icon={Hash}
          iconColor="text-sky-500"
        />
        <StatWidget
          title="Avg Playback %"
          value={playback ? `${playback.average_playback_percentage.toFixed(1)}%` : "0%"}
          subtitle="Voice message listen time"
          icon={Headphones}
          iconColor="text-violet-500"
        />
        <StatWidget
          title="Avg Credit Spent"
          value="--"
          subtitle="SMS/Phone/Combined/Survey"
          icon={DollarSign}
          iconColor="text-rose-500"
        />
      </div>

      {/* Bottom Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <PlaybackDistributionChart data={playback?.distribution || null} />
        <CreditUsageChart data={creditUsage} />
      </div>
    </div>
  );
}
