"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "../../lib/supabase";
import PageActionButtons from "../components/PageActionButtons";

type RegionCategory = {
  id: number;
  region_name_zh: string;
  sort_order: number;
  is_non_mainland: boolean;
};

type DailyEntry = {
  id: number;
  entry_date: string;
  region_id: number;
  quantity: number;
};

type MonthlySummary = {
  total_valid_qty: number;
  non_mainland_qty: number;
  raw_score: number;
  adjusted_score: number;
  final_bonus_mop: number;
  meets_qty_400: boolean;
  meets_non_mainland_100: boolean;
  meets_score_420: boolean;
  meets_structure: boolean;
  final_status: string;
};

type MonthlyRule = {
  region_id: number;
  rule_month: string;
  quota: number | string | null;
  basic_score: number | string | null;
  extended_score: number | string | null;
  balance_score: number | string | null;
};

function getMonthStart() {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  return `${year}-${month}-01`;
}

function getNextMonthStart(monthStart: string) {
  const date = new Date(`${monthStart}T00:00:00`);
  date.setMonth(date.getMonth() + 1);
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  return `${year}-${month}-01`;
}

export default function DashboardPage() {
  const router = useRouter();

  const [displayName, setDisplayName] = useState("");
  const [regions, setRegions] = useState<RegionCategory[]>([]);
  const [entries, setEntries] = useState<DailyEntry[]>([]);
  const [monthlySummary, setMonthlySummary] = useState<MonthlySummary | null>(null);
  const [monthlyRules, setMonthlyRules] = useState<MonthlyRule[]>([]);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState("");
  const [ruleSourceMonth, setRuleSourceMonth] = useState<string>("");

  const monthStart = getMonthStart();
  const nextMonthStart = getNextMonthStart(monthStart);

  const loadDashboardData = async (userId: string, userEmail?: string | null) => {
    setLoading(true);
    setMessage("");

    const { data: profileData } = await supabase
      .from("profiles")
      .select("display_name")
      .eq("id", userId)
      .maybeSingle();

    setDisplayName(profileData?.display_name ?? userEmail ?? "User");

    const { data: regionData, error: regionError } = await supabase
      .from("region_categories")
      .select("id, region_name_zh, sort_order, is_non_mainland")
      .order("sort_order", { ascending: true });

    if (regionError) {
      setMessage(regionError.message);
      setLoading(false);
      return;
    }

    const regionList = (regionData ?? []) as RegionCategory[];
    setRegions(regionList);

    const { data: entryData, error: entryError } = await supabase
      .from("daily_entries")
      .select("id, entry_date, region_id, quantity")
      .eq("user_id", userId)
      .gte("entry_date", monthStart)
      .lt("entry_date", nextMonthStart)
      .order("entry_date", { ascending: false })
      .order("region_id", { ascending: true });

    if (entryError) {
      setMessage(entryError.message);
      setLoading(false);
      return;
    }

    setEntries((entryData ?? []) as DailyEntry[]);

    const { data: summaryData, error: summaryError } = await supabase
      .from("monthly_summary")
      .select(
        "total_valid_qty, non_mainland_qty, raw_score, adjusted_score, final_bonus_mop, meets_qty_400, meets_non_mainland_100, meets_score_420, meets_structure, final_status"
      )
      .eq("user_id", userId)
      .eq("summary_month", monthStart)
      .maybeSingle();

    if (summaryError) {
      setMessage(summaryError.message);
      setLoading(false);
      return;
    }

    setMonthlySummary((summaryData as MonthlySummary | null) ?? null);

    const { data: ruleData, error: ruleError } = await supabase
      .from("monthly_region_rules")
      .select("region_id, rule_month, quota, basic_score, extended_score, balance_score")
      .eq("rule_month", monthStart)
      .order("region_id", { ascending: true });

    if (ruleError) {
      setMessage(ruleError.message);
      setLoading(false);
      return;
    }

    const ruleList = (ruleData ?? []) as MonthlyRule[];
    setMonthlyRules(ruleList);

    let detectedRuleMonth = "";
    for (const rule of ruleList) {
      if (!detectedRuleMonth) {
        detectedRuleMonth = rule.rule_month;
      }
    }
    setRuleSourceMonth(ruleList.length > 0 ? monthStart : "");

    setLoading(false);
  };

  useEffect(() => {
    const init = async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user) {
        router.replace("/login");
        return;
      }

      await loadDashboardData(user.id, user.email);
    };

    init();
  }, [router, monthStart, nextMonthStart]);

  const latestRuleByRegion = useMemo(() => {
    const map = new Map<number, MonthlyRule>();

    monthlyRules.forEach((rule) => {
      map.set(rule.region_id, rule);
    });

    return map;
  }, [monthlyRules]);

  const totalsByRegion = useMemo(() => {
    return regions.map((region) => {
      const total = entries
        .filter((entry) => entry.region_id === region.id)
        .reduce((sum, entry) => sum + Number(entry.quantity ?? 0), 0);

      return {
        ...region,
        total,
      };
    });
  }, [regions, entries]);

  const totalValidQty = useMemo(() => {
    return totalsByRegion.reduce((sum, region) => sum + region.total, 0);
  }, [totalsByRegion]);

  const nonMainlandQty = useMemo(() => {
    return totalsByRegion
      .filter((region) => region.is_non_mainland)
      .reduce((sum, region) => sum + region.total, 0);
  }, [totalsByRegion]);

  const mainlandQty = useMemo(() => {
    return totalsByRegion
      .filter((region) => !region.is_non_mainland)
      .reduce((sum, region) => sum + region.total, 0);
  }, [totalsByRegion]);

  const uniqueDates = useMemo(() => {
    return new Set(
      entries
        .filter((entry) => Number(entry.quantity ?? 0) > 0)
        .map((entry) => entry.entry_date)
    ).size;
  }, [entries]);

  const visibleEntries = useMemo(() => {
    return entries.filter((entry) => Number(entry.quantity ?? 0) > 0);
  }, [entries]);

  const totalQuotaTarget = useMemo(() => {
    return regions.reduce((sum, region) => {
      const rule = latestRuleByRegion.get(region.id);
      return sum + Number(rule?.quota ?? 0);
    }, 0);
  }, [regions, latestRuleByRegion]);

  const mainlandQuotaTarget = useMemo(() => {
    return regions
      .filter((region) => !region.is_non_mainland)
      .reduce((sum, region) => {
        const rule = latestRuleByRegion.get(region.id);
        return sum + Number(rule?.quota ?? 0);
      }, 0);
  }, [regions, latestRuleByRegion]);

  const nonMainlandQuotaTarget = useMemo(() => {
    return regions
      .filter((region) => region.is_non_mainland)
      .reduce((sum, region) => {
        const rule = latestRuleByRegion.get(region.id);
        return sum + Number(rule?.quota ?? 0);
      }, 0);
  }, [regions, latestRuleByRegion]);

  const currentScore = useMemo(() => {
    if (monthlySummary?.adjusted_score != null) {
      return Number(monthlySummary.adjusted_score);
    }
    if (monthlySummary?.raw_score != null) {
      return Number(monthlySummary.raw_score);
    }
    return 0;
  }, [monthlySummary]);

  const currentTotalQty = monthlySummary?.total_valid_qty ?? totalValidQty;
  const currentNonMainlandQty = monthlySummary?.non_mainland_qty ?? nonMainlandQty;
  const currentMainlandQty = currentTotalQty - currentNonMainlandQty;

  const meetsTotalQuota = useMemo(() => {
    if (totalQuotaTarget <= 0) return false;
    return currentTotalQty >= totalQuotaTarget;
  }, [currentTotalQty, totalQuotaTarget]);

  const meetsMainlandQuota = useMemo(() => {
    if (mainlandQuotaTarget <= 0) return false;
    return currentMainlandQty >= mainlandQuotaTarget;
  }, [currentMainlandQty, mainlandQuotaTarget]);

  const meetsNonMainlandQuota = useMemo(() => {
    if (nonMainlandQuotaTarget <= 0) return false;
    return currentNonMainlandQty >= nonMainlandQuotaTarget;
  }, [currentNonMainlandQty, nonMainlandQuotaTarget]);

  if (loading) {
    return (
      <main className="min-h-screen bg-slate-50 px-6 py-10">
        <div className="mx-auto max-w-6xl rounded-2xl bg-white p-8 shadow-sm ring-1 ring-slate-200">
          載入中...
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-slate-50 px-6 py-10">
      <div className="mx-auto max-w-6xl space-y-6">
        <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div>
            <h1 className="text-2xl font-bold text-slate-900">個人 Dashboard</h1>
            <p className="mt-1 text-sm text-slate-600">使用者：{displayName}</p>
            <p className="mt-1 text-sm text-slate-500">月份：{monthStart}</p>
            {ruleSourceMonth ? (
              <p className="mt-1 text-xs text-slate-500">
                本次使用規則月份：{ruleSourceMonth}
              </p>
            ) : null}
          </div>

          <PageActionButtons />
        </div>

        {message ? (
          <div className="rounded-xl bg-white px-4 py-3 text-sm text-slate-700 shadow-sm ring-1 ring-slate-200">
            {message}
          </div>
        ) : null}

        <div className="grid gap-4 md:grid-cols-4">
          <div className="rounded-2xl bg-white p-6 shadow-sm ring-1 ring-slate-200">
            <p className="text-sm text-slate-500">本月總份數</p>
            <p className="mt-2 text-3xl font-bold text-slate-900">
              {currentTotalQty}
            </p>
          </div>

          <div className="rounded-2xl bg-white p-6 shadow-sm ring-1 ring-slate-200">
            <p className="text-sm text-slate-500">內地份數</p>
            <p className="mt-2 text-3xl font-bold text-slate-900">
              {currentMainlandQty}
            </p>
          </div>

          <div className="rounded-2xl bg-white p-6 shadow-sm ring-1 ring-slate-200">
            <p className="text-sm text-slate-500">非內地份數</p>
            <p className="mt-2 text-3xl font-bold text-slate-900">
              {currentNonMainlandQty}
            </p>
          </div>

          <div className="rounded-2xl bg-white p-6 shadow-sm ring-1 ring-slate-200">
            <p className="text-sm text-slate-500">當下分數</p>
            <p className="mt-2 text-3xl font-bold text-slate-900">
              {currentScore}
            </p>
          </div>
        </div>

        <div className="grid gap-4 md:grid-cols-2">
          <div className="rounded-2xl bg-white p-6 shadow-sm ring-1 ring-slate-200">
            <p className="text-sm text-slate-500">Raw Score</p>
            <p className="mt-2 text-3xl font-bold text-slate-900">
              {monthlySummary?.raw_score ?? 0}
            </p>
          </div>

          <div className="rounded-2xl bg-white p-6 shadow-sm ring-1 ring-slate-200">
            <p className="text-sm text-slate-500">Adjusted Score</p>
            <p className="mt-2 text-3xl font-bold text-slate-900">
              {monthlySummary?.adjusted_score ?? 0}
            </p>
          </div>
        </div>

        <div className="rounded-2xl bg-white p-6 shadow-sm ring-1 ring-slate-200">
          <h2 className="text-lg font-semibold text-slate-900">本月各地區總份數</h2>

          <div className="mt-4 overflow-x-auto">
            <table className="min-w-full border-collapse">
              <thead>
                <tr className="border-b border-slate-200 text-left text-sm text-slate-500">
                  <th className="px-3 py-3">序號</th>
                  <th className="px-3 py-3">地區</th>
                  <th className="px-3 py-3">內地 / 非內地</th>
                  <th className="px-3 py-3">建議配額</th>
                  <th className="px-3 py-3">本月份數</th>
                </tr>
              </thead>
              <tbody>
                {totalsByRegion.map((region) => {
                  const rule = latestRuleByRegion.get(region.id);

                  return (
                    <tr key={region.id} className="border-b border-slate-100 text-sm">
                      <td className="px-3 py-3">{region.sort_order}</td>
                      <td className="px-3 py-3">{region.region_name_zh}</td>
                      <td className="px-3 py-3">
                        {region.is_non_mainland ? "非內地" : "內地"}
                      </td>
                      <td className="px-3 py-3">{Number(rule?.quota ?? 0)}</td>
                      <td className="px-3 py-3 font-medium text-slate-900">
                        {region.total}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>

        <div className="grid gap-4 md:grid-cols-2">
          <div className="rounded-2xl bg-white p-6 shadow-sm ring-1 ring-slate-200">
            <h2 className="text-lg font-semibold text-slate-900">達標進度</h2>
            <div className="mt-4 space-y-3 text-sm">
              <div className="flex items-center justify-between rounded-xl bg-slate-50 px-4 py-3">
                <span>總要求</span>
                <span className="font-medium">
                  {Math.max(0, totalQuotaTarget - currentTotalQty)} 份未達
                </span>
              </div>

              <div className="flex items-center justify-between rounded-xl bg-slate-50 px-4 py-3">
                <span>內地要求</span>
                <span className="font-medium">
                  {Math.max(0, mainlandQuotaTarget - currentMainlandQty)} 份未達
                </span>
              </div>

              <div className="flex items-center justify-between rounded-xl bg-slate-50 px-4 py-3">
                <span>非內地要求</span>
                <span className="font-medium">
                  {Math.max(0, nonMainlandQuotaTarget - currentNonMainlandQty)} 份未達
                </span>
              </div>

              <div className="flex items-center justify-between rounded-xl bg-slate-50 px-4 py-3">
                <span>當下分數</span>
                <span className="font-medium">{currentScore}</span>
              </div>
            </div>
          </div>

          <div className="rounded-2xl bg-white p-6 shadow-sm ring-1 ring-slate-200">
            <h2 className="text-lg font-semibold text-slate-900">月結算資料</h2>
            <div className="mt-4 space-y-3 text-sm">
              <div className="flex items-center justify-between rounded-xl bg-slate-50 px-4 py-3">
                <span>總要求達標</span>
                <span className="font-medium">{meetsTotalQuota ? "是" : "否"}</span>
              </div>

              <div className="flex items-center justify-between rounded-xl bg-slate-50 px-4 py-3">
                <span>內地要求達標</span>
                <span className="font-medium">{meetsMainlandQuota ? "是" : "否"}</span>
              </div>

              <div className="flex items-center justify-between rounded-xl bg-slate-50 px-4 py-3">
                <span>非內地要求達標</span>
                <span className="font-medium">{meetsNonMainlandQuota ? "是" : "否"}</span>
              </div>

              <div className="flex items-center justify-between rounded-xl bg-slate-50 px-4 py-3">
                <span>當下分數</span>
                <span className="font-medium">{currentScore}</span>
              </div>

              <div className="flex items-center justify-between rounded-xl bg-slate-50 px-4 py-3">
                <span>樣本結構</span>
                <span className="font-medium">
                  {monthlySummary?.meets_structure ? "已達標" : "未判定"}
                </span>
              </div>
            </div>
          </div>
        </div>

        <div className="rounded-2xl bg-white p-6 shadow-sm ring-1 ring-slate-200">
          <h2 className="text-lg font-semibold text-slate-900">本月填報明細</h2>

          <div className="mt-4 overflow-x-auto">
            <table className="min-w-full border-collapse">
              <thead>
                <tr className="border-b border-slate-200 text-left text-sm text-slate-500">
                  <th className="px-3 py-3">日期</th>
                  <th className="px-3 py-3">序號</th>
                  <th className="px-3 py-3">地區</th>
                  <th className="px-3 py-3">份數</th>
                </tr>
              </thead>
              <tbody>
                {visibleEntries.map((entry) => {
                  const region = regions.find((r) => r.id === entry.region_id);

                  return (
                    <tr key={entry.id} className="border-b border-slate-100 text-sm">
                      <td className="px-3 py-3">{entry.entry_date}</td>
                      <td className="px-3 py-3">{region?.sort_order ?? entry.region_id}</td>
                      <td className="px-3 py-3">{region?.region_name_zh ?? "-"}</td>
                      <td className="px-3 py-3 font-medium text-slate-900">
                        {entry.quantity}
                      </td>
                    </tr>
                  );
                })}

                {visibleEntries.length === 0 ? (
                  <tr>
                    <td className="px-3 py-6 text-sm text-slate-500" colSpan={4}>
                      本月暫時未有填報資料。
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </main>
  );
}