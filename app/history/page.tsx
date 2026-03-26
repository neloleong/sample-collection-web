"use client";

import { Suspense, useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { supabase } from "../../lib/supabase";
import PageActionButtons from "../components/PageActionButtons";
import {
  getMonthStartString,
  getNextMonthStart,
  getCurrentYear,
  getYearOptions,
  monthLabel,
} from "@/lib/month";

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
  non_mainland_qty: number;
  raw_score: number;
  adjusted_score: number;
  meets_qty_400: boolean;
  meets_non_mainland_100: boolean;
  meets_score_420: boolean;
  meets_structure: boolean;
  final_status: string;
};

function statusLabel(status: WeeklyMarketStatus["status_color"]) {
  switch (status) {
    case "red":
      return "紅色";
    case "yellow":
      return "黃色";
    case "green":
      return "綠色";
    case "grey":
      return "灰色";
    default:
      return "-";
  }
}

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

  const finalStatus =
    totalValidQty > 0
      ? meetsQty400 && meetsNonMainland100 && meetsScore420 && meetsStructure
        ? "已達標"
        : "即時計算"
      : "未結算";

  return {
    total_valid_qty: totalValidQty,
    non_mainland_qty: nonMainlandQty,
    raw_score: round2(rawScore),
    adjusted_score: round2(adjustedScore),
    meets_qty_400: meetsQty400,
    meets_non_mainland_100: meetsNonMainland100,
    meets_score_420: meetsScore420,
    meets_structure: meetsStructure,
    final_status: finalStatus,
  };
}

function HistoryPageContent() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const currentYear = getCurrentYear();
  const currentMonth = new Date().getMonth() + 1;

  const presetUserId = searchParams.get("userId");
  const presetYear = searchParams.get("year");
  const presetMonth = searchParams.get("month");

  const initialYear =
    presetYear && !Number.isNaN(Number(presetYear))
      ? Number(presetYear)
      : currentYear;

  const initialMonth =
    presetMonth &&
    !Number.isNaN(Number(presetMonth)) &&
    Number(presetMonth) >= 1 &&
    Number(presetMonth) <= 12
      ? Number(presetMonth)
      : currentMonth;

  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [viewingUserId, setViewingUserId] = useState<string | null>(
    presetUserId || null
  );

  const [regions, setRegions] = useState<RegionCategory[]>([]);
  const [selectedYear, setSelectedYear] = useState<number>(initialYear);
  const [selectedMonth, setSelectedMonth] = useState<number>(initialMonth);

  const [entries, setEntries] = useState<DailyEntry[]>([]);
  const [monthlyRules, setMonthlyRules] = useState<MonthlyRegionRule[]>([]);
  const [weeklyStatuses, setWeeklyStatuses] = useState<WeeklyMarketStatus[]>([]);

  const years = useMemo(() => getYearOptions(2024, currentYear), [currentYear]);
  const months = useMemo(() => Array.from({ length: 12 }, (_, i) => i + 1), []);

  const monthStart = useMemo(
    () => getMonthStartString(selectedYear, selectedMonth),
    [selectedYear, selectedMonth]
  );
  const nextMonthStart = useMemo(() => getNextMonthStart(monthStart), [monthStart]);

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

  const visibleEntries = useMemo(() => {
    return entries.filter((entry) => Number(entry.quantity ?? 0) > 0);
  }, [entries]);

  const ruleMap = useMemo(() => {
    const map = new Map<number, MonthlyRegionRule>();
    monthlyRules.forEach((rule) => map.set(rule.region_id, rule));
    return map;
  }, [monthlyRules]);

  const groupedWeeklyStatuses = useMemo(() => {
    return [...weeklyStatuses].sort((a, b) => {
      if (a.week_start_date !== b.week_start_date) {
        return a.week_start_date.localeCompare(b.week_start_date);
      }
      return a.region_id - b.region_id;
    });
  }, [weeklyStatuses]);

  const liveSummary = useMemo(() => {
    return computeLiveSummary({
      entries,
      regions,
      monthlyRules,
      weeklyStatuses,
    });
  }, [entries, regions, monthlyRules, weeklyStatuses]);

  const loadHistoryData = async (userId: string, userEmail?: string | null) => {
    setLoading(true);
    setMessage("");

    const { data: profileData, error: profileError } = await supabase
      .from("profiles")
      .select("display_name")
      .eq("id", userId)
      .maybeSingle();

    if (profileError) {
      setMessage(profileError.message);
    }

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

    setRegions((regionData ?? []) as RegionCategory[]);

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

  useEffect(() => {
    const init = async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user) {
        router.replace("/login");
        return;
      }

      const targetUserId = presetUserId || user.id;
      setViewingUserId(targetUserId);

      await loadHistoryData(targetUserId, user.email);
    };

    void init();
  }, [router, presetUserId, monthStart, nextMonthStart]);

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
            <h1 className="text-2xl font-bold text-slate-900">過往記錄</h1>
            <p className="mt-1 text-sm text-slate-600">使用者：{displayName}</p>
            <p className="mt-1 text-sm text-slate-500">
              {viewingUserId ? "可按年份展開月份查看歷史資料" : "載入中"}
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

        <div className="grid gap-6 lg:grid-cols-[320px_1fr]">
          <div className="rounded-2xl bg-white p-6 shadow-sm ring-1 ring-slate-200">
            <h2 className="text-lg font-semibold text-slate-900">年份 / 月份</h2>

            <div className="mt-4 space-y-4">
              {years.map((year) => (
                <details
                  key={year}
                  open={year === selectedYear}
                  className="rounded-xl border border-slate-200"
                >
                  <summary className="cursor-pointer list-none px-4 py-3 font-semibold text-slate-900">
                    {year}年
                  </summary>

                  <div className="grid grid-cols-3 gap-2 border-t border-slate-200 px-4 py-4">
                    {months.map((month) => {
                      const active = selectedYear === year && selectedMonth === month;

                      return (
                        <button
                          key={`${year}-${month}`}
                          type="button"
                          onClick={() => {
                            setSelectedYear(year);
                            setSelectedMonth(month);
                          }}
                          className={`rounded-lg px-3 py-2 text-sm transition ${
                            active
                              ? "bg-slate-900 text-white"
                              : "border border-slate-300 text-slate-700 hover:bg-slate-100"
                          }`}
                        >
                          {monthLabel(month)}
                        </button>
                      );
                    })}
                  </div>
                </details>
              ))}
            </div>
          </div>

          <div className="space-y-6">
            <div className="rounded-2xl bg-white p-6 shadow-sm ring-1 ring-slate-200">
              <h2 className="text-xl font-semibold text-slate-900">
                {selectedYear}年 {selectedMonth}月
              </h2>
              <p className="mt-1 text-sm text-slate-500">月份起始：{monthStart}</p>
            </div>

            <div className="grid gap-4 md:grid-cols-4">
              <div className="rounded-2xl bg-white p-6 shadow-sm ring-1 ring-slate-200">
                <p className="text-sm text-slate-500">本月總份數</p>
                <p className="mt-2 text-3xl font-bold text-slate-900">
                  {liveSummary.total_valid_qty}
                </p>
              </div>

              <div className="rounded-2xl bg-white p-6 shadow-sm ring-1 ring-slate-200">
                <p className="text-sm text-slate-500">非內地份數</p>
                <p className="mt-2 text-3xl font-bold text-slate-900">
                  {liveSummary.non_mainland_qty}
                </p>
              </div>

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
            </div>

            <div className="grid gap-4 md:grid-cols-3">
              <div className="rounded-2xl bg-white p-6 shadow-sm ring-1 ring-slate-200">
                <p className="text-sm text-slate-500">400 份是否達標</p>
                <p className="mt-2 text-2xl font-bold text-slate-900">
                  {liveSummary.meets_qty_400 ? "是" : "否"}
                </p>
              </div>

              <div className="rounded-2xl bg-white p-6 shadow-sm ring-1 ring-slate-200">
                <p className="text-sm text-slate-500">非內地 100 份是否達標</p>
                <p className="mt-2 text-2xl font-bold text-slate-900">
                  {liveSummary.meets_non_mainland_100 ? "是" : "否"}
                </p>
              </div>

              <div className="rounded-2xl bg-white p-6 shadow-sm ring-1 ring-slate-200">
                <p className="text-sm text-slate-500">月結算狀態</p>
                <p className="mt-2 text-2xl font-bold text-slate-900">
                  {liveSummary.final_status}
                </p>
              </div>
            </div>

            <div className="rounded-2xl bg-white p-6 shadow-sm ring-1 ring-slate-200">
              <h3 className="text-lg font-semibold text-slate-900">各地區總份數</h3>

              <div className="mt-4 overflow-x-auto">
                <table className="min-w-full border-collapse">
                  <thead>
                    <tr className="border-b border-slate-200 text-left text-sm text-slate-500">
                      <th className="px-3 py-3">序號</th>
                      <th className="px-3 py-3">地區</th>
                      <th className="px-3 py-3">內地 / 非內地</th>
                      <th className="px-3 py-3">本月份數</th>
                    </tr>
                  </thead>
                  <tbody>
                    {totalsByRegion.map((region) => (
                      <tr key={region.id} className="border-b border-slate-100 text-sm">
                        <td className="px-3 py-3">{region.sort_order}</td>
                        <td className="px-3 py-3">{region.region_name_zh}</td>
                        <td className="px-3 py-3">
                          {region.is_non_mainland ? "非內地" : "內地"}
                        </td>
                        <td className="px-3 py-3 font-medium text-slate-900">
                          {region.total}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            <div className="rounded-2xl bg-white p-6 shadow-sm ring-1 ring-slate-200">
              <h3 className="text-lg font-semibold text-slate-900">該月規則快照</h3>

              <div className="mt-4 overflow-x-auto">
                <table className="min-w-full border-collapse">
                  <thead>
                    <tr className="border-b border-slate-200 text-left text-sm text-slate-500">
                      <th className="px-3 py-3">序號</th>
                      <th className="px-3 py-3">地區</th>
                      <th className="px-3 py-3">建議配額</th>
                      <th className="px-3 py-3">基本分數</th>
                      <th className="px-3 py-3">延伸分數</th>
                      <th className="px-3 py-3">平衡分數</th>
                    </tr>
                  </thead>
                  <tbody>
                    {regions.map((region) => {
                      const rule = ruleMap.get(region.id);

                      return (
                        <tr key={region.id} className="border-b border-slate-100 text-sm">
                          <td className="px-3 py-3">{region.sort_order}</td>
                          <td className="px-3 py-3">{region.region_name_zh}</td>
                          <td className="px-3 py-3">{rule?.quota ?? "-"}</td>
                          <td className="px-3 py-3">{rule?.basic_score ?? "-"}</td>
                          <td className="px-3 py-3">{rule?.extended_score ?? "-"}</td>
                          <td className="px-3 py-3">{rule?.balance_score ?? "-"}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>

            <div className="rounded-2xl bg-white p-6 shadow-sm ring-1 ring-slate-200">
              <h3 className="text-lg font-semibold text-slate-900">該月每週調整記錄</h3>

              <div className="mt-4 overflow-x-auto">
                <table className="min-w-full border-collapse">
                  <thead>
                    <tr className="border-b border-slate-200 text-left text-sm text-slate-500">
                      <th className="px-3 py-3">週起始日</th>
                      <th className="px-3 py-3">序號</th>
                      <th className="px-3 py-3">地區</th>
                      <th className="px-3 py-3">顏色</th>
                      <th className="px-3 py-3">調整倍率</th>
                    </tr>
                  </thead>
                  <tbody>
                    {groupedWeeklyStatuses.length === 0 ? (
                      <tr>
                        <td className="px-3 py-6 text-sm text-slate-500" colSpan={5}>
                          該月暫無每週調整記錄。
                        </td>
                      </tr>
                    ) : (
                      groupedWeeklyStatuses.map((row) => {
                        const region = regions.find((r) => r.id === row.region_id);

                        return (
                          <tr key={row.id} className="border-b border-slate-100 text-sm">
                            <td className="px-3 py-3">{row.week_start_date}</td>
                            <td className="px-3 py-3">{region?.sort_order ?? row.region_id}</td>
                            <td className="px-3 py-3">{region?.region_name_zh ?? "-"}</td>
                            <td className="px-3 py-3">{statusLabel(row.status_color)}</td>
                            <td className="px-3 py-3">{row.multiplier}</td>
                          </tr>
                        );
                      })
                    )}
                  </tbody>
                </table>
              </div>
            </div>

            <div className="rounded-2xl bg-white p-6 shadow-sm ring-1 ring-slate-200">
              <h3 className="text-lg font-semibold text-slate-900">該月填報明細</h3>

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
                    {visibleEntries.length === 0 ? (
                      <tr>
                        <td className="px-3 py-6 text-sm text-slate-500" colSpan={4}>
                          該月暫時未有填報資料。
                        </td>
                      </tr>
                    ) : (
                      visibleEntries.map((entry) => {
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
                      })
                    )}
                  </tbody>
                </table>
              </div>
            </div>

            <div className="rounded-2xl bg-slate-50 p-4 text-sm text-slate-600 ring-1 ring-slate-200">
              <p>使用說明：</p>
              <p className="mt-2">1. 本頁為歷史月份資料頁，會根據該月份的填報記錄即時計算分數。</p>
              <p>2. 原始分數：根據當月填報份數與地區規則計出的基礎分數，未加入市場倍率。</p>
              <p>3. 調整後分數：在原始分數基礎上，套用每週市場調整倍率後的結果。</p>
              <p>4. 若原始分數高於調整後分數，代表該月市場倍率整體低於 1，所以分數被下調。</p>
              <p>5. 本頁不顯示獎金，只顯示歷史份數、分數、規則快照及每週調整記錄。</p>
            </div>
          </div>
        </div>
      </div>
    </main>
  );
}

export default function HistoryPage() {
  return (
    <Suspense
      fallback={
        <main className="min-h-screen bg-slate-50 px-6 py-10">
          <div className="mx-auto max-w-7xl rounded-2xl bg-white p-8 shadow-sm ring-1 ring-slate-200">
            載入中...
          </div>
        </main>
      }
    >
      <HistoryPageContent />
    </Suspense>
  );
}