"use client";

import { useEffect, useMemo, useState } from "react";
import { supabase } from "../../../lib/supabase";
import PageActionButtons from "../../components/PageActionButtons";
import {
  getCurrentYear,
  getCurrentYearMonth,
  getMonthStartString,
  getNextMonthStart,
  getYearOptions,
} from "../../../lib/month";

type AchievementStatus = "未填報" | "未達標" | "達標";

type ProfileLite = {
  id: string;
  display_name: string | null;
  employee_code: string | null;
  role: string | null;
};

type DailyEntryLite = {
  user_id: string;
  region_id: number;
  quantity: number | null;
  entry_date: string;
};

type RegionLite = {
  id: number;
  region_name_zh: string | null;
  sort_order: number | null;
};

type SummaryRow = {
  user_id: string;
  display_name: string | null;
  employee_code: string | null;
  total_quantity: number;
  achievement_status: AchievementStatus;
};

type RegionStat = {
  region_id: number;
  region_name_zh: string;
  quantity: number;
  sort_order: number;
};

const MONTH_TOTAL_TARGET = 2500;
const STAFF_TARGET = 400;

function progressPercent(value: number, target: number) {
  if (target <= 0) return 0;
  return Math.min((value / target) * 100, 100);
}

export default function ReportManagementPage() {
  const [loading, setLoading] = useState(true);
  const [displayName, setDisplayName] = useState("");
  const [rows, setRows] = useState<SummaryRow[]>([]);
  const [regionStats, setRegionStats] = useState<RegionStat[]>([]);

  const currentYear = getCurrentYear();
  const currentYearMonth = getCurrentYearMonth();

  const [selectedYear, setSelectedYear] = useState<number>(currentYear);
  const [selectedMonth, setSelectedMonth] = useState<number>(currentYearMonth.month);

  const years = useMemo(() => getYearOptions(2024, currentYear), [currentYear]);
  const months = useMemo(() => Array.from({ length: 12 }, (_, i) => i + 1), []);

  useEffect(() => {
    let mounted = true;

    async function loadData() {
      setLoading(true);

      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user) {
        window.location.href = "/login";
        return;
      }

      const { data: myProfile, error: myProfileError } = await supabase
        .from("profiles")
        .select("display_name, role")
        .eq("id", user.id)
        .single();

      if (!mounted) return;

      if (myProfileError || !myProfile) {
        console.error("載入管理員資料失敗:", myProfileError?.message);
        window.location.href = "/dashboard";
        return;
      }

      if (myProfile.role !== "admin") {
        window.location.href = "/dashboard";
        return;
      }

      setDisplayName(myProfile.display_name ?? "");

      const monthStart = getMonthStartString(selectedYear, selectedMonth);
      const nextMonthStart = getNextMonthStart(monthStart);

      const [
        { data: profilesData, error: profilesError },
        { data: dailyEntriesData, error: dailyEntriesError },
        { data: regionsData, error: regionsError },
      ] = await Promise.all([
        supabase
          .from("profiles")
          .select("id, display_name, employee_code, role")
          .order("employee_code", { ascending: true }),
        supabase
          .from("daily_entries")
          .select("user_id, region_id, quantity, entry_date")
          .gte("entry_date", monthStart)
          .lt("entry_date", nextMonthStart),
        supabase
          .from("region_categories")
          .select("id, region_name_zh, sort_order")
          .order("sort_order", { ascending: true }),
      ]);

      if (!mounted) return;

      if (profilesError) {
        console.error("載入員工資料失敗:", profilesError.message);
        setRows([]);
        setRegionStats([]);
        setLoading(false);
        return;
      }

      if (dailyEntriesError) {
        console.error("載入填報資料失敗:", dailyEntriesError.message);
        setRows([]);
        setRegionStats([]);
        setLoading(false);
        return;
      }

      if (regionsError) {
        console.error("載入地區資料失敗:", regionsError.message);
        setRows([]);
        setRegionStats([]);
        setLoading(false);
        return;
      }

      const staffProfiles = ((profilesData ?? []) as ProfileLite[]).filter(
        (profile) => profile.role === "staff"
      );

      const regions = (regionsData ?? []) as RegionLite[];
      const dailyEntries = (dailyEntriesData ?? []) as DailyEntryLite[];

      const entriesByUser = new Map<string, number>();
      const entriesByRegion = new Map<number, number>();

      dailyEntries.forEach((entry) => {
        const quantity = Number(entry.quantity ?? 0);

        entriesByUser.set(
          entry.user_id,
          (entriesByUser.get(entry.user_id) ?? 0) + quantity
        );

        entriesByRegion.set(
          entry.region_id,
          (entriesByRegion.get(entry.region_id) ?? 0) + quantity
        );
      });

      const mergedRows: SummaryRow[] = staffProfiles
        .map((profile) => {
          const totalQuantity = entriesByUser.get(profile.id) ?? 0;

          let achievementStatus: AchievementStatus = "未填報";

          if (totalQuantity > 0) {
            achievementStatus = totalQuantity >= STAFF_TARGET ? "達標" : "未達標";
          }

          return {
            user_id: profile.id,
            display_name: profile.display_name ?? null,
            employee_code: profile.employee_code ?? null,
            total_quantity: totalQuantity,
            achievement_status: achievementStatus,
          };
        })
        .sort((a, b) =>
          String(a.employee_code ?? "").localeCompare(String(b.employee_code ?? ""))
        );

      const finalRegionStats: RegionStat[] = regions
        .map((region) => {
          const quantity = entriesByRegion.get(region.id) ?? 0;

          return {
            region_id: region.id,
            region_name_zh: region.region_name_zh ?? `地區 ${region.id}`,
            quantity,
            sort_order: region.sort_order ?? 9999,
          };
        })
        .sort((a, b) => a.sort_order - b.sort_order);

      setRows(mergedRows);
      setRegionStats(finalRegionStats);
      setLoading(false);
    }

    loadData();

    return () => {
      mounted = false;
    };
  }, [selectedYear, selectedMonth]);

  const aggregated = useMemo(() => {
    const totalQuantity = rows.reduce((sum, row) => sum + row.total_quantity, 0);

    const achievedCount = rows.filter(
      (row) => row.achievement_status === "達標"
    ).length;

    const notAchievedCount = rows.filter(
      (row) => row.achievement_status === "未達標"
    ).length;

    const notFilledCount = rows.filter(
      (row) => row.achievement_status === "未填報"
    ).length;

    let settlementStatus = "未結算";

    if (rows.length > 0) {
      if (achievedCount === rows.length) {
        settlementStatus = "全部達標";
      } else if (achievedCount > 0) {
        settlementStatus = "部分達標";
      } else if (notAchievedCount > 0) {
        settlementStatus = "未達標";
      }
    }

    return {
      totalQuantity,
      achievedCount,
      notAchievedCount,
      notFilledCount,
      settlementStatus,
    };
  }, [rows]);

  const maxRegionQuantity = useMemo(() => {
    if (regionStats.length === 0) return 0;
    return Math.max(...regionStats.map((region) => region.quantity), 0);
  }, [regionStats]);

  if (loading) {
    return (
      <main className="min-h-screen bg-slate-50 px-4 py-6 sm:px-6 sm:py-8 lg:px-8">
        <div className="mx-auto max-w-7xl rounded-2xl bg-white p-8 shadow-sm ring-1 ring-slate-200">
          載入中...
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-slate-50 px-4 py-6 sm:px-6 sm:py-8 lg:px-8">
      <div className="mx-auto max-w-7xl space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">報表管理</h1>
          <p className="mt-1 text-sm text-slate-600">彙總全部員工當月表現與達標進度</p>
        </div>

        <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <PageActionButtons />
        </div>

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
                          {month}月
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

              <div className="mt-3 flex flex-wrap items-center gap-3 text-sm text-slate-600">
                <span className="rounded-full bg-blue-50 px-3 py-1 text-blue-700">
                  管理員：{displayName || "-"}
                </span>
                <span className="rounded-full bg-slate-100 px-3 py-1">
                  目前顯示：{rows.length} 人
                </span>
              </div>
            </div>

            <section className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
              <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
                <p className="text-sm text-slate-500">本月總份數</p>
                <p className="mt-2 text-3xl font-bold text-slate-900">
                  {aggregated.totalQuantity}
                </p>
              </div>

              <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
                <p className="text-sm text-slate-500">達標人數</p>
                <p className="mt-2 text-3xl font-bold text-slate-900">
                  {aggregated.achievedCount}
                </p>
              </div>

              <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
                <p className="text-sm text-slate-500">未達標人數</p>
                <p className="mt-2 text-3xl font-bold text-slate-900">
                  {aggregated.notAchievedCount}
                </p>
              </div>

              <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
                <p className="text-sm text-slate-500">月結算狀態</p>
                <p className="mt-2 text-2xl font-bold text-slate-900">
                  {aggregated.settlementStatus}
                </p>
              </div>
            </section>

            <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
              <h2 className="text-xl font-semibold text-slate-900">達標進度</h2>

              <div className="mt-6">
                <div className="mb-2 flex items-center justify-between text-sm text-slate-700">
                  <span>總份數（目標 {MONTH_TOTAL_TARGET}）</span>
                  <span>{aggregated.totalQuantity} / {MONTH_TOTAL_TARGET}</span>
                </div>

                <div className="h-3 w-full rounded-full bg-slate-200">
                  <div
                    className="h-3 rounded-full bg-green-600 transition-all"
                    style={{
                      width: `${progressPercent(
                        aggregated.totalQuantity,
                        MONTH_TOTAL_TARGET
                      )}%`,
                    }}
                  />
                </div>
              </div>
            </section>

            <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
              <h2 className="text-xl font-semibold text-slate-900">地區統計</h2>

              <div className="mt-6 space-y-5">
                {regionStats.map((region) => (
                  <div key={region.region_id}>
                    <div className="mb-2 flex items-center justify-between gap-4 text-sm">
                      <span className="font-medium text-slate-800">
                        {region.region_name_zh}
                      </span>
                      <span className="font-semibold text-slate-700">
                        {region.quantity}
                      </span>
                    </div>

                    <div className="h-3 w-full rounded-full bg-slate-200">
                      <div
                        className="h-3 rounded-full bg-green-600 transition-all"
                        style={{
                          width: `${
                            maxRegionQuantity > 0
                              ? progressPercent(region.quantity, maxRegionQuantity)
                              : 0
                          }%`,
                        }}
                      />
                    </div>
                  </div>
                ))}
              </div>
            </section>

            <section className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
                <p className="text-sm text-slate-500">未填報人數</p>
                <p className="mt-2 text-3xl font-bold text-slate-900">
                  {aggregated.notFilledCount}
                </p>
              </div>

              <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
                <p className="text-sm text-slate-500">目前顯示員工數</p>
                <p className="mt-2 text-3xl font-bold text-slate-900">
                  {rows.length}
                </p>
              </div>
            </section>
          </div>
        </div>
      </div>
    </main>
  );
}