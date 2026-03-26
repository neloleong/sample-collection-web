"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "../../lib/supabase";
import PageActionButtons from "../components/PageActionButtons";
import { getCurrentYearMonth, getMonthStartString, getNextMonthStart } from "@/lib/month";

type Role = "staff" | "admin";

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

type MonthlyRegionRule = {
  region_id: number;
  rule_month: string;
  quota: number | null;
  basic_score: number | null;
  extended_score: number | null;
  balance_score: number | null;
};

type WeeklyMarketStatus = {
  id: number;
  week_start_date: string;
  region_id: number;
  status_color: "red" | "yellow" | "green" | "grey";
  multiplier: number;
};

type LiveMonthlySummary = {
  total_valid_qty: number;
  mainland_qty: number;
  non_mainland_qty: number;
  raw_score: number;
  adjusted_score: number;
  final_bonus_mop: number;
  meets_qty_400: boolean;
  meets_non_mainland_100: boolean;
  meets_score_420: boolean;
  meets_structure: boolean;
  final_status: string;
  need_qty: number;
  need_non_mainland: number;
  need_score: number;
};

type ProfileRow = {
  display_name: string | null;
  role: Role | null;
};



function round2(value: number) {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

function getWeekStartDateString(dateString: string) {
  const date = new Date(`${dateString}T00:00:00`);
  const day = date.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  date.setDate(date.getDate() + diff);

  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const dayOfMonth = String(date.getDate()).padStart(2, "0");

  return `${year}-${month}-${dayOfMonth}`;
}

function buildWeeklyMultiplierMap(statuses: WeeklyMarketStatus[]) {
  const map = new Map<string, number>();

  statuses.forEach((row) => {
    map.set(
      `${row.week_start_date}__${row.region_id}`,
      Number(row.multiplier ?? 1)
    );
  });

  return map;
}

function computeLiveSummary(params: {
  entries: DailyEntry[];
  regions: RegionCategory[];
  monthlyRules: MonthlyRegionRule[];
  weeklyStatuses: WeeklyMarketStatus[];
}): LiveMonthlySummary {
  const { entries, regions, monthlyRules, weeklyStatuses } = params;

  const regionMap = new Map<number, RegionCategory>();
  regions.forEach((region) => regionMap.set(region.id, region));

  const ruleMap = new Map<number, MonthlyRegionRule>();
  monthlyRules.forEach((rule) => ruleMap.set(rule.region_id, rule));

  const weeklyMultiplierMap = buildWeeklyMultiplierMap(weeklyStatuses);

  const sortedEntries = [...entries].sort((a, b) => {
    if (a.entry_date !== b.entry_date) {
      return a.entry_date.localeCompare(b.entry_date);
    }
    return a.id - b.id;
  });

  const runningQtyByRegion = new Map<number, number>();
  const totalByRegion = new Map<number, number>();

  let totalValidQty = 0;
  let mainlandQty = 0;
  let nonMainlandQty = 0;
  let rawScore = 0;
  let adjustedScore = 0;

  for (const entry of sortedEntries) {
    const qty = Number(entry.quantity ?? 0);
    if (qty <= 0) continue;

    totalValidQty += qty;

    const region = regionMap.get(entry.region_id);
    if (region?.is_non_mainland) {
      nonMainlandQty += qty;
    } else {
      mainlandQty += qty;
    }

    const rule = ruleMap.get(entry.region_id);

    const quota = Math.max(Number(rule?.quota ?? 0), 0);
    const basicScore = Number(rule?.basic_score ?? 0);
    const extendedScore = Number(rule?.extended_score ?? basicScore);

    const beforeQty = runningQtyByRegion.get(entry.region_id) ?? 0;

    let basicQty = 0;
    let extendedQty = 0;

    if (quota > 0) {
      const remainBasicQuota = Math.max(quota - beforeQty, 0);
      basicQty = Math.min(qty, remainBasicQuota);
      extendedQty = Math.max(qty - basicQty, 0);
    } else {
      basicQty = qty;
      extendedQty = 0;
    }

    const entryRawScore = basicQty * basicScore + extendedQty * extendedScore;

    const weekStart = getWeekStartDateString(entry.entry_date);
    const multiplier =
      weeklyMultiplierMap.get(`${weekStart}__${entry.region_id}`) ?? 1;

    rawScore += entryRawScore;
    adjustedScore += entryRawScore * Number(multiplier);

    runningQtyByRegion.set(entry.region_id, beforeQty + qty);
    totalByRegion.set(
      entry.region_id,
      (totalByRegion.get(entry.region_id) ?? 0) + qty
    );
  }

  for (const region of regions) {
    const total = totalByRegion.get(region.id) ?? 0;
    const rule = ruleMap.get(region.id);

    const quota = Math.max(Number(rule?.quota ?? 0), 0);
    const balanceScore = Number(rule?.balance_score ?? 0);

    if (total > 0 && quota > 0 && total < quota && balanceScore !== 0) {
      rawScore += balanceScore;
      adjustedScore += balanceScore;
    }
  }

  const meetsQty400 = totalValidQty >= 400;
  const meetsNonMainland100 = nonMainlandQty >= 100;
  const meetsScore420 = adjustedScore >= 420;
  const meetsStructure = totalValidQty > 0;

  const finalBonusMop =
    meetsQty400 && meetsNonMainland100 && meetsScore420 && meetsStructure
      ? round2(adjustedScore)
      : 0;

  const finalStatus =
    totalValidQty > 0
      ? finalBonusMop > 0
        ? "已達標"
        : "即時計算"
      : "未結算";

  const needQty = Math.max(400 - totalValidQty, 0);
  const needNonMainland = Math.max(100 - nonMainlandQty, 0);
  const needScore = Math.max(420 - adjustedScore, 0);

  return {
    total_valid_qty: totalValidQty,
    mainland_qty: mainlandQty,
    non_mainland_qty: nonMainlandQty,
    raw_score: round2(rawScore),
    adjusted_score: round2(adjustedScore),
    final_bonus_mop: round2(finalBonusMop),
    meets_qty_400: meetsQty400,
    meets_non_mainland_100: meetsNonMainland100,
    meets_score_420: meetsScore420,
    meets_structure: meetsStructure,
    final_status: finalStatus,
    need_qty: needQty,
    need_non_mainland: needNonMainland,
    need_score: round2(needScore),
  };
}

function progressPercent(value: number, target: number) {
  if (target <= 0) return 0;
  return Math.min((value / target) * 100, 100);
}

export default function DashboardPage() {
  const router = useRouter();

  const { year: currentYear, month: currentMonth } = getCurrentYearMonth();
  const monthStart = getMonthStartString(currentYear, currentMonth);
  const nextMonthStart = getNextMonthStart(monthStart);

  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [role, setRole] = useState<Role>("staff");

  const [regions, setRegions] = useState<RegionCategory[]>([]);
  const [entries, setEntries] = useState<DailyEntry[]>([]);
  const [monthlyRules, setMonthlyRules] = useState<MonthlyRegionRule[]>([]);
  const [weeklyStatuses, setWeeklyStatuses] = useState<WeeklyMarketStatus[]>([]);

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

  const ruleMap = useMemo(() => {
    const map = new Map<number, MonthlyRegionRule>();
    monthlyRules.forEach((rule) => map.set(rule.region_id, rule));
    return map;
  }, [monthlyRules]);

  const liveSummary = useMemo(() => {
    return computeLiveSummary({
      entries,
      regions,
      monthlyRules,
      weeklyStatuses,
    });
  }, [entries, regions, monthlyRules, weeklyStatuses]);

  useEffect(() => {
    const init = async () => {
      setLoading(true);
      setMessage("");

      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user) {
        router.replace("/login");
        return;
      }

      const { data: profileData, error: profileError } = await supabase
        .from("profiles")
        .select("display_name, role")
        .eq("id", user.id)
        .maybeSingle();

      if (profileError) {
        setMessage(profileError.message);
        setLoading(false);
        return;
      }

      const profile = (profileData as ProfileRow | null) ?? null;

      setDisplayName(profile?.display_name ?? user.email ?? "User");
      setRole(profile?.role ?? "staff");

      const { data: regionData, error: regionError } = await supabase
        .from("region_categories")
        .select("id, region_name_zh, sort_order, is_non_mainland")
        .order("sort_order", { ascending: true });

      if (regionError) {
        setMessage(regionError.message);
        setLoading(false);
        return;
      }

      setRegions((regionData ?? []) as RegionCategory[]);

      const { data: entryData, error: entryError } = await supabase
        .from("daily_entries")
        .select("id, entry_date, region_id, quantity")
        .eq("user_id", user.id)
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

      const { data: rulesData, error: rulesError } = await supabase
        .from("monthly_region_rules")
        .select(
          "region_id, rule_month, quota, basic_score, extended_score, balance_score"
        )
        .eq("rule_month", monthStart)
        .order("region_id", { ascending: true });

      if (rulesError) {
        setMessage(rulesError.message);
        setLoading(false);
        return;
      }

      setMonthlyRules((rulesData ?? []) as MonthlyRegionRule[]);

      const { data: weeklyData, error: weeklyError } = await supabase
        .from("weekly_market_status")
        .select("id, week_start_date, region_id, status_color, multiplier")
        .gte("week_start_date", monthStart)
        .lt("week_start_date", nextMonthStart)
        .order("week_start_date", { ascending: true })
        .order("region_id", { ascending: true });

      if (weeklyError) {
        setMessage(weeklyError.message);
        setLoading(false);
        return;
      }

      setWeeklyStatuses((weeklyData ?? []) as WeeklyMarketStatus[]);
      setLoading(false);
    };

    void init();
  }, [router, monthStart, nextMonthStart]);

  if (loading) {
    return (
      <main className="min-h-screen bg-slate-50 px-6 py-10">
        <div className="mx-auto max-w-7xl rounded-2xl bg-white p-8 shadow-sm ring-1 ring-slate-200">
          載入中...
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-slate-50 px-6 py-10">
      <div className="mx-auto max-w-7xl space-y-6">
        
          <div>
            <h1 className="text-2xl font-bold text-slate-900">個人 Dashboard</h1>
            <p className="mt-1 text-sm text-slate-600">使用者：{displayName}</p>
            <p className="mt-1 text-sm text-slate-500">
              本次使用規則月份：{monthStart}
            </p>
          </div>
          
        <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <PageActionButtons />
        </div>

        {message ? (
          <div className="rounded-xl bg-white px-4 py-3 text-sm text-slate-700 shadow-sm ring-1 ring-slate-200">
            {message}
          </div>
        ) : null}

        <div className={`grid gap-4 ${role === "admin" ? "md:grid-cols-4" : "md:grid-cols-3"}`}>
          <div className="rounded-2xl bg-white p-6 shadow-sm ring-1 ring-slate-200">
            <p className="text-sm text-slate-500">本月總份數</p>
            <p className="mt-2 text-3xl font-bold text-slate-900">
              {liveSummary.total_valid_qty}
            </p>
          </div>

          <div className="rounded-2xl bg-white p-6 shadow-sm ring-1 ring-slate-200">
            <p className="text-sm text-slate-500">內地份數</p>
            <p className="mt-2 text-3xl font-bold text-slate-900">
              {liveSummary.mainland_qty}
            </p>
          </div>

          <div className="rounded-2xl bg-white p-6 shadow-sm ring-1 ring-slate-200">
            <p className="text-sm text-slate-500">非內地份數</p>
            <p className="mt-2 text-3xl font-bold text-slate-900">
              {liveSummary.non_mainland_qty}
            </p>
          </div>

          {role === "admin" ? (
            <div className="rounded-2xl bg-white p-6 shadow-sm ring-1 ring-slate-200">
              <p className="text-sm text-slate-500">即時獎金（MOP）</p>
              <p className="mt-2 text-3xl font-bold text-slate-900">
                {liveSummary.final_bonus_mop}
              </p>
            </div>
          ) : null}
        </div>

        <div className={`grid gap-4 ${role === "admin" ? "md:grid-cols-3" : "md:grid-cols-2"}`}>
          <div className="rounded-2xl bg-white p-6 shadow-sm ring-1 ring-slate-200">
            <p className="text-sm text-slate-500">原始分數</p>
            <p className="mt-2 text-3xl font-bold text-slate-900">
              {liveSummary.raw_score}
            </p>
          </div>

          <div className="rounded-2xl bg-white p-6 shadow-sm ring-1 ring-slate-200">
            <p className="text-sm text-slate-500">調整後分數</p>
            <p className="mt-2 text-3xl font-bold text-slate-900">
              {liveSummary.adjusted_score}
            </p>
          </div>

          {role === "admin" ? (
            <div className="rounded-2xl bg-white p-6 shadow-sm ring-1 ring-slate-200">
              <p className="text-sm text-slate-500">月結算狀態</p>
              <p className="mt-2 text-2xl font-bold text-slate-900">
                {liveSummary.final_status}
              </p>
            </div>
          ) : null}
        </div>

        <div className="rounded-2xl bg-white p-6 shadow-sm ring-1 ring-slate-200">
          <h2 className="text-xl font-semibold text-slate-900">達標進度</h2>

          <div className="mt-4 space-y-5">
            <div>
              <div className="flex items-center justify-between text-sm text-slate-700">
                <span>總份數（目標 400）</span>
                <span>
                  {liveSummary.total_valid_qty} / 400
                </span>
              </div>
              <div className="mt-2 h-2 w-full rounded-full bg-slate-200">
                <div
                  className="h-2 rounded-full bg-blue-500"
                  style={{
                    width: `${progressPercent(liveSummary.total_valid_qty, 400)}%`,
                  }}
                />
              </div>
              <p className="mt-1 text-xs text-slate-500">
                {liveSummary.need_qty === 0
                  ? "已達標"
                  : `還差 ${liveSummary.need_qty} 份`}
              </p>
            </div>

            <div>
              <div className="flex items-center justify-between text-sm text-slate-700">
                <span>非內地份數（目標 100）</span>
                <span>
                  {liveSummary.non_mainland_qty} / 100
                </span>
              </div>
              <div className="mt-2 h-2 w-full rounded-full bg-slate-200">
                <div
                  className="h-2 rounded-full bg-green-500"
                  style={{
                    width: `${progressPercent(liveSummary.non_mainland_qty, 100)}%`,
                  }}
                />
              </div>
              <p className="mt-1 text-xs text-slate-500">
                {liveSummary.need_non_mainland === 0
                  ? "已達標"
                  : `還差 ${liveSummary.need_non_mainland} 份`}
              </p>
            </div>

            <div>
              <div className="flex items-center justify-between text-sm text-slate-700">
                <span>調整後分數（目標 420）</span>
                <span>
                  {liveSummary.adjusted_score} / 420
                </span>
              </div>
              <div className="mt-2 h-2 w-full rounded-full bg-slate-200">
                <div
                  className="h-2 rounded-full bg-purple-500"
                  style={{
                    width: `${progressPercent(liveSummary.adjusted_score, 420)}%`,
                  }}
                />
              </div>
              <p className="mt-1 text-xs text-slate-500">
                {liveSummary.need_score === 0
                  ? "已達標"
                  : `還差 ${liveSummary.need_score} 分`}
              </p>
            </div>
          </div>
        </div>

        <div className="rounded-2xl bg-white p-6 shadow-sm ring-1 ring-slate-200">
          <h2 className="text-xl font-semibold text-slate-900">本月各地區總份數</h2>

          <div className="mt-4 overflow-x-auto">
            <table className="min-w-full border-collapse">
              <thead>
                <tr className="border-b border-slate-200 text-left text-sm font-semibold text-slate-600">
                  <th className="px-3 py-3">序號</th>
                  <th className="px-3 py-3">地區</th>
                  <th className="px-3 py-3">內地 / 非內地</th>
                  <th className="px-3 py-3">建議配額</th>
                  <th className="px-3 py-3">本月份數</th>
                </tr>
              </thead>
              <tbody>
                {totalsByRegion.map((region) => {
                  const rule = ruleMap.get(region.id);

                  return (
                    <tr key={region.id} className="border-b border-slate-100 text-sm">
                      <td className="px-3 py-3">{region.sort_order}</td>
                      <td className="px-3 py-3">{region.region_name_zh}</td>
                      <td className="px-3 py-3">
                        {region.is_non_mainland ? "非內地" : "內地"}
                      </td>
                      <td className="px-3 py-3">{rule?.quota ?? "-"}</td>
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

        {role === "staff" ? (
          <div className="rounded-2xl bg-slate-50 p-4 text-sm text-slate-600 ring-1 ring-slate-200">
            <p>使用說明：</p>
            <p className="mt-2">1. 此頁為即時計分頁面，會根據你本月每日填報內容自動更新。</p>
            <p>2. 原始分數：按你填報的份數及各地區規則計算，未加入市場調整。</p>
            <p>3. 調整後分數：在原始分數基礎上，加入每週市場狀況倍率後的結果。</p>
            <p>4. 達標進度會顯示你距離目標還差多少，包括總份數、非內地份數及調整後分數。</p>
            <p>5. 建議你每日查看本頁進度，了解自己距離每月目標還差多少，方便安排後續工作重點。</p>
          </div>
        ) : (
          <div className="rounded-2xl bg-slate-50 p-4 text-sm text-slate-600 ring-1 ring-slate-200">
            <p>說明：</p>
            <p className="mt-2">1. 此頁已改為即時計分，不再依賴 monthly_summary 才顯示分數。</p>
            <p>2. 原始分數 = 未經市場調整前的基礎分數。</p>
            <p>3. 調整後分數 = 套用 weekly_market_status 倍率後的分數。</p>
            <p>4. 即時獎金 = 達到門檻後可發放的獎金；未達標時會顯示 0。</p>
            <p>5. 達標進度會顯示距離 400 份、非內地 100 份、420 分還差多少。</p>
          </div>
        )}
      </div>
    </main>
  );
}