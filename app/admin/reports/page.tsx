"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";
import PageActionButtons from "@/app/components/PageActionButtons";
import {
  getCurrentYear,
  getCurrentYearMonth,
  getMonthStartString,
  getNextMonthStart,
  getYearOptions,
  monthLabel,
} from "@/lib/month";

type Profile = {
  id: string;
  display_name: string | null;
  employee_code: string | null;
  role: "admin" | "staff";
  created_at?: string | null;
};

type DailyEntry = {
  id: number;
  user_id: string;
  entry_date: string;
  region_id: number;
  quantity: number;
  created_at: string;
};

type RegionCategory = {
  id: number;
  region_name_zh: string;
  sort_order: number;
  is_non_mainland: boolean;
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

type EmployeeSummaryRow = {
  id: string;
  display_name: string | null;
  employee_code: string | null;
  role: "admin" | "staff";
  created_at: string | null;
  total_quantity: number;
  non_mainland_qty: number;
  raw_score: number;
  adjusted_score: number;
  last_entry_date: string | null;
  achievement_status: "達標" | "未達標" | "未填報";
};

function normalizeRole(role: unknown): "admin" | "staff" {
  const r = String(role ?? "").toLowerCase().trim();
  return r === "admin" ? "admin" : "staff";
}

function formatDate(value: string | null) {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString("zh-HK");
}

function formatDateTime(value: string | null) {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString("zh-HK");
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

function computeEmployeeSummary(params: {
  profile: Profile;
  entries: DailyEntry[];
  regions: RegionCategory[];
  monthlyRules: MonthlyRegionRule[];
  weeklyStatuses: WeeklyMarketStatus[];
}): EmployeeSummaryRow {
  const { profile, entries, regions, monthlyRules, weeklyStatuses } = params;

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

  let totalQuantity = 0;
  let nonMainlandQty = 0;
  let rawScore = 0;
  let adjustedScore = 0;
  let lastEntryDate: string | null = null;

  for (const entry of sortedEntries) {
    const qty = Number(entry.quantity ?? 0);
    if (qty <= 0) continue;

    totalQuantity += qty;

    if (!lastEntryDate || entry.entry_date > lastEntryDate) {
      lastEntryDate = entry.entry_date;
    }

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

  const achievementStatus: "達標" | "未達標" | "未填報" =
    totalQuantity <= 0
      ? "未填報"
      : totalQuantity >= 400 && nonMainlandQty >= 100 && adjustedScore >= 420
      ? "達標"
      : "未達標";

  return {
    id: profile.id,
    display_name: profile.display_name,
    employee_code: profile.employee_code,
    role: profile.role,
    created_at: profile.created_at ?? null,
    total_quantity: totalQuantity,
    non_mainland_qty: nonMainlandQty,
    raw_score: round2(rawScore),
    adjusted_score: round2(adjustedScore),
    last_entry_date: lastEntryDate,
    achievement_status: achievementStatus,
  };
}

export default function AdminReportsPage() {
  const router = useRouter();

  const currentYear = getCurrentYear();
  const { month: currentMonth } = getCurrentYearMonth();

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [displayName, setDisplayName] = useState("");

  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [entries, setEntries] = useState<DailyEntry[]>([]);
  const [regions, setRegions] = useState<RegionCategory[]>([]);
  const [monthlyRules, setMonthlyRules] = useState<MonthlyRegionRule[]>([]);
  const [weeklyStatuses, setWeeklyStatuses] = useState<WeeklyMarketStatus[]>([]);

  const [selectedUserId, setSelectedUserId] = useState("all");
  const [achievementFilter, setAchievementFilter] = useState("all");
  const [keyword, setKeyword] = useState("");

  const [selectedYear, setSelectedYear] = useState<number>(currentYear);
  const [selectedMonth, setSelectedMonth] = useState<number>(currentMonth);

  const years = useMemo(() => getYearOptions(2024, currentYear), [currentYear]);
  const months = useMemo(() => Array.from({ length: 12 }, (_, i) => i + 1), []);

  const monthStart = useMemo(
    () => getMonthStartString(selectedYear, selectedMonth),
    [selectedYear, selectedMonth]
  );
  const nextMonthStart = useMemo(() => getNextMonthStart(monthStart), [monthStart]);

  useEffect(() => {
    void init();
  }, [monthStart, nextMonthStart]);

  async function init() {
    setLoading(true);
    setError("");

    try {
      const {
        data: { user },
        error: authError,
      } = await supabase.auth.getUser();

      if (authError || !user) {
        router.replace("/login");
        return;
      }

      const { data: profileData, error: profileError } = await supabase
        .from("profiles")
        .select("display_name, role")
        .eq("id", user.id)
        .single();

      if (profileError) {
        setError(profileError.message);
        return;
      }

      if (normalizeRole(profileData?.role) !== "admin") {
        router.replace("/dashboard");
        return;
      }

      setDisplayName(profileData?.display_name || user.email || "Admin");

      const [
        profilesResult,
        entriesResult,
        regionsResult,
        rulesResult,
        weeklyResult,
      ] = await Promise.all([
        supabase
          .from("profiles")
          .select("id, display_name, employee_code, role, created_at")
          .order("created_at", { ascending: false }),

        supabase
          .from("daily_entries")
          .select("id, user_id, entry_date, region_id, quantity, created_at")
          .gte("entry_date", monthStart)
          .lt("entry_date", nextMonthStart)
          .order("created_at", { ascending: false }),

        supabase
          .from("region_categories")
          .select("id, region_name_zh, sort_order, is_non_mainland")
          .order("sort_order", { ascending: true }),

        supabase
          .from("monthly_region_rules")
          .select(
            "region_id, rule_month, quota, basic_score, extended_score, balance_score"
          )
          .eq("rule_month", monthStart)
          .order("region_id", { ascending: true }),

        supabase
          .from("weekly_market_status")
          .select("id, week_start_date, region_id, status_color, multiplier")
          .gte("week_start_date", monthStart)
          .lt("week_start_date", nextMonthStart)
          .order("week_start_date", { ascending: true })
          .order("region_id", { ascending: true }),
      ]);

      if (profilesResult.error) {
        setError(profilesResult.error.message);
        return;
      }

      if (entriesResult.error) {
        setError(entriesResult.error.message);
        return;
      }

      if (regionsResult.error) {
        setError(regionsResult.error.message);
        return;
      }

      if (rulesResult.error) {
        setError(rulesResult.error.message);
        return;
      }

      if (weeklyResult.error) {
        setError(weeklyResult.error.message);
        return;
      }

      setProfiles(
        (profilesResult.data ?? []).map((p: any) => ({
          id: p.id,
          display_name: p.display_name,
          employee_code: p.employee_code,
          role: normalizeRole(p.role),
          created_at: p.created_at ?? null,
        }))
      );

      setEntries(
        (entriesResult.data ?? []).map((row: any) => ({
          id: row.id,
          user_id: row.user_id,
          entry_date: row.entry_date,
          region_id: row.region_id,
          quantity: Number(row.quantity ?? 0),
          created_at: row.created_at,
        }))
      );

      setRegions((regionsResult.data ?? []) as RegionCategory[]);
      setMonthlyRules((rulesResult.data ?? []) as MonthlyRegionRule[]);
      setWeeklyStatuses((weeklyResult.data ?? []) as WeeklyMarketStatus[]);

      setSelectedUserId("all");
    } catch (e) {
      setError(e instanceof Error ? e.message : "讀取員工彙總失敗");
    } finally {
      setLoading(false);
    }
  }

  const summaryRows = useMemo<EmployeeSummaryRow[]>(() => {
    return profiles.map((profile) => {
      const userEntries = entries.filter((entry) => entry.user_id === profile.id);

      return computeEmployeeSummary({
        profile,
        entries: userEntries,
        regions,
        monthlyRules,
        weeklyStatuses,
      });
    });
  }, [profiles, entries, regions, monthlyRules, weeklyStatuses]);

  const filteredRows = useMemo(() => {
    const q = keyword.trim().toLowerCase();

    return summaryRows.filter((row) => {
      const matchUser = selectedUserId === "all" ? true : row.id === selectedUserId;
      if (!matchUser) return false;

      const matchAchievement =
        achievementFilter === "all"
          ? true
          : achievementFilter === "achieved"
          ? row.achievement_status === "達標"
          : achievementFilter === "not_achieved"
          ? row.achievement_status === "未達標"
          : achievementFilter === "not_filled"
          ? row.achievement_status === "未填報"
          : true;

      if (!matchAchievement) return false;

      if (!q) return true;

      return (
        (row.display_name || "").toLowerCase().includes(q) ||
        (row.employee_code || "").toLowerCase().includes(q) ||
        (row.role || "").toLowerCase().includes(q) ||
        String(row.total_quantity).includes(q) ||
        String(row.adjusted_score).includes(q) ||
        (row.achievement_status || "").toLowerCase().includes(q) ||
        (row.last_entry_date || "").toLowerCase().includes(q)
      );
    });
  }, [summaryRows, selectedUserId, achievementFilter, keyword]);

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
        <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div>
            <h1 className="text-2xl font-bold text-slate-900">
              Admin / 全部員工填報
            </h1>
            <p className="mt-1 text-sm text-slate-600">
              以員工為單位查看當月填報彙總，每位員工只顯示一行。
            </p>
          </div>

          <PageActionButtons
            buttons={[
              {
                label: "重新計算本月結算",
                onClick: () => router.push("/admin"),
                variant: "primary",
              },
              {
                label: "個人 Dashboard",
                onClick: () => router.push("/dashboard"),
              },
              {
                label: "Admin 規則頁",
                onClick: () => router.push("/admin"),
              },
              {
                label: "員工總覽",
                onClick: () => router.push("/admin/users"),
              },
              {
                label: "全部填報",
                onClick: () => router.push("/admin/reports"),
              },
              {
                label: "每日填報",
                onClick: () => router.push("/daily-entry"),
              },
              {
                label: "過往記錄",
                onClick: () => router.push("/history"),
              },
              {
                label: "每週調分",
                onClick: () => router.push("/admin/weekly-rules"),
              },
              {
                label: "首頁",
                onClick: () => router.push("/"),
              },
              {
                label: "登出",
                onClick: async () => {
                  await supabase.auth.signOut();
                  router.replace("/login");
                },
              },
            ]}
          />
        </div>

        <div className="flex flex-wrap items-center gap-3 text-sm text-slate-600">
          <span className="rounded-full bg-blue-50 px-3 py-1 text-blue-700">
            管理員：{displayName}
          </span>
          <span className="rounded-full bg-slate-100 px-3 py-1">
            目前月份：{selectedYear}年 {monthLabel(selectedMonth)}
          </span>
          <span className="rounded-full bg-slate-100 px-3 py-1">
            目前顯示：{filteredRows.length} 人
          </span>
        </div>

        <div className="rounded-2xl bg-white p-6 shadow-sm ring-1 ring-slate-200">
          <div className="grid gap-4 md:grid-cols-5">
            <label className="block">
              <span className="mb-2 block text-sm font-medium text-slate-700">
                年份
              </span>
              <select
                value={selectedYear}
                onChange={(e) => setSelectedYear(Number(e.target.value))}
                className="w-full rounded-xl border border-slate-300 px-4 py-3 text-sm outline-none transition focus:border-slate-400"
              >
                {years.map((year) => (
                  <option key={year} value={year}>
                    {year}年
                  </option>
                ))}
              </select>
            </label>

            <label className="block">
              <span className="mb-2 block text-sm font-medium text-slate-700">
                月份
              </span>
              <select
                value={selectedMonth}
                onChange={(e) => setSelectedMonth(Number(e.target.value))}
                className="w-full rounded-xl border border-slate-300 px-4 py-3 text-sm outline-none transition focus:border-slate-400"
              >
                {months.map((month) => (
                  <option key={month} value={month}>
                    {monthLabel(month)}
                  </option>
                ))}
              </select>
            </label>

            <label className="block">
              <span className="mb-2 block text-sm font-medium text-slate-700">
                篩選員工
              </span>
              <select
                value={selectedUserId}
                onChange={(e) => setSelectedUserId(e.target.value)}
                className="w-full rounded-xl border border-slate-300 px-4 py-3 text-sm outline-none transition focus:border-slate-400"
              >
                <option value="all">全部員工</option>
                {profiles.map((profile) => (
                  <option key={profile.id} value={profile.id}>
                    {(profile.display_name || "未命名員工") +
                      (profile.employee_code ? ` / ${profile.employee_code}` : "")}
                  </option>
                ))}
              </select>
            </label>

            <label className="block">
              <span className="mb-2 block text-sm font-medium text-slate-700">
                達標狀態
              </span>
              <select
                value={achievementFilter}
                onChange={(e) => setAchievementFilter(e.target.value)}
                className="w-full rounded-xl border border-slate-300 px-4 py-3 text-sm outline-none transition focus:border-slate-400"
              >
                <option value="all">全部狀態</option>
                <option value="achieved">達標</option>
                <option value="not_achieved">未達標</option>
                <option value="not_filled">未填報</option>
              </select>
            </label>

            <label className="block">
              <span className="mb-2 block text-sm font-medium text-slate-700">
                搜尋
              </span>
              <input
                type="text"
                value={keyword}
                onChange={(e) => setKeyword(e.target.value)}
                placeholder="搜尋姓名 / 員工編號 / 角色 / 總份數"
                className="w-full rounded-xl border border-slate-300 px-4 py-3 text-sm outline-none transition focus:border-slate-400"
              />
            </label>
          </div>
        </div>

        <div className="rounded-2xl bg-white p-6 shadow-sm ring-1 ring-slate-200">
          <div className="overflow-x-auto">
            <table className="min-w-full border-collapse">
              <thead>
                <tr className="border-b border-slate-200 text-left text-sm text-slate-700">
                  <th className="px-3 py-3 font-semibold">員工名稱</th>
                  <th className="px-3 py-3 font-semibold">員工編號</th>
                  <th className="px-3 py-3 font-semibold">角色</th>
                  <th className="px-3 py-3 font-semibold">達標狀態</th>
                  <th className="px-3 py-3 font-semibold">本月總份數</th>
                  <th className="px-3 py-3 font-semibold">非內地份數</th>
                  <th className="px-3 py-3 font-semibold">調整後分數</th>
                  <th className="px-3 py-3 font-semibold">最後填報日期</th>
                  <th className="px-3 py-3 font-semibold">建立時間</th>
                </tr>
              </thead>
              <tbody>
                {filteredRows.length === 0 ? (
                  <tr>
                    <td className="px-3 py-6 text-sm text-slate-500" colSpan={9}>
                      目前沒有符合條件的員工資料。
                    </td>
                  </tr>
                ) : (
                  filteredRows.map((row) => (
                    <tr key={row.id} className="border-b border-slate-100 text-sm">
                      <td className="px-3 py-3">
                        <button
                          type="button"
                          onClick={() =>
                            router.push(
                              `/history?userId=${row.id}&year=${selectedYear}&month=${selectedMonth}`
                            )
                          }
                          className="font-medium text-blue-700 underline underline-offset-2 hover:text-blue-900"
                        >
                          {row.display_name ?? "-"}
                        </button>
                      </td>

                      <td className="px-3 py-3">{row.employee_code ?? "-"}</td>

                      <td className="px-3 py-3">
                        <span
                          className={`inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ${
                            row.role === "admin"
                              ? "bg-red-100 text-red-700"
                              : "bg-blue-100 text-blue-700"
                          }`}
                        >
                          {row.role === "admin" ? "ADMIN" : "STAFF"}
                        </span>
                      </td>

                      <td className="px-3 py-3">
                        <span
                          className={`inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ${
                            row.achievement_status === "達標"
                              ? "bg-green-100 text-green-700"
                              : row.achievement_status === "未達標"
                              ? "bg-amber-100 text-amber-700"
                              : "bg-slate-100 text-slate-600"
                          }`}
                        >
                          {row.achievement_status}
                        </span>
                      </td>

                      <td className="px-3 py-3 font-medium text-slate-900">
                        {row.total_quantity}
                      </td>

                      <td className="px-3 py-3 font-medium text-slate-900">
                        {row.non_mainland_qty}
                      </td>

                      <td className="px-3 py-3 font-medium text-slate-900">
                        {row.adjusted_score}
                      </td>

                      <td className="px-3 py-3">{formatDate(row.last_entry_date)}</td>
                      <td className="px-3 py-3">{formatDateTime(row.created_at)}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          <div className="mt-6 rounded-2xl bg-slate-50 p-4 text-sm text-slate-600">
            <p>說明：</p>
            <p className="mt-2">1. 此頁只供 admin 查看全部員工當月彙總資料。</p>
            <p>2. 此頁以員工為單位，每位員工只顯示一行，不再按每日或地區拆開。</p>
            <p>3. 達標條件：本月總份數達 400、非內地份數達 100、調整後分數達 420。</p>
            <p>4. 若員工當月完全未填報，則顯示為「未填報」。</p>
            <p>5. 點擊員工名稱，可直接進入該員工該月份的過往記錄。</p>
          </div>

          {error ? (
            <div className="mt-4 rounded-xl bg-slate-50 px-4 py-3 text-sm text-red-500">
              {error}
            </div>
          ) : null}
        </div>
      </div>
    </main>
  );
}