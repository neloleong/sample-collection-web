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

type UserRole = "admin" | "staff" | "part_time" | null;
type AchievementStatus = "未填報" | "未達標" | "達標";

type ProfileLite = {
  id: string;
  display_name: string | null;
  employee_code: string | null;
  role: UserRole;
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

type MonthlyRegionRuleLite = {
  region_id: number;
  rule_month: string;
  quota: number | null;
};

type StaffRow = {
  user_id: string;
  display_name: string | null;
  employee_code: string | null;
  total_quantity: number;
  achievement_status: AchievementStatus;
};

type PartTimeRow = {
  user_id: string;
  display_name: string | null;
  employee_code: string | null;
  total_quantity: number;
};

type RegionStat = {
  region_id: number;
  region_name_zh: string;
  quantity: number;
  quota: number;
  sort_order: number;
};

const STAFF_TARGET = 400;

function progressPercent(value: number, target: number) {
  if (target <= 0) return 0;
  return Math.min((value / target) * 100, 100);
}

function getProgressColor(value: number, target: number) {
  if (target > 0 && value >= target) {
    return "bg-red-600";
  }
  return "bg-green-600";
}

function getProgressTextColor(value: number, target: number) {
  if (target > 0 && value >= target) {
    return "text-red-700";
  }
  return "text-green-700";
}

function getStatusBadgeClass(status: AchievementStatus) {
  if (status === "達標") {
    return "bg-red-50 text-red-700 ring-1 ring-red-200";
  }
  if (status === "未達標") {
    return "bg-green-50 text-green-700 ring-1 ring-green-200";
  }
  return "bg-slate-100 text-slate-600 ring-1 ring-slate-200";
}

export default function ReportManagementPage() {
  const [loading, setLoading] = useState(true);
  const [displayName, setDisplayName] = useState("");

  const [staffRows, setStaffRows] = useState<StaffRow[]>([]);
  const [partTimeRows, setPartTimeRows] = useState<PartTimeRow[]>([]);
  const [regionStats, setRegionStats] = useState<RegionStat[]>([]);

  const currentYear = getCurrentYear();
  const currentYearMonth = getCurrentYearMonth();

  const [selectedYear, setSelectedYear] = useState<number>(currentYear);
  const [selectedMonth, setSelectedMonth] = useState<number>(
    currentYearMonth.month
  );

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
        { data: monthlyRulesData, error: monthlyRulesError },
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
        supabase
          .from("monthly_region_rules")
          .select("region_id, rule_month, quota")
          .eq("rule_month", monthStart),
      ]);

      if (!mounted) return;

      if (profilesError) {
        console.error("載入員工資料失敗:", profilesError.message);
        setStaffRows([]);
        setPartTimeRows([]);
        setRegionStats([]);
        setLoading(false);
        return;
      }

      if (dailyEntriesError) {
        console.error("載入填報資料失敗:", dailyEntriesError.message);
        setStaffRows([]);
        setPartTimeRows([]);
        setRegionStats([]);
        setLoading(false);
        return;
      }

      if (regionsError) {
        console.error("載入地區資料失敗:", regionsError.message);
        setStaffRows([]);
        setPartTimeRows([]);
        setRegionStats([]);
        setLoading(false);
        return;
      }

      if (monthlyRulesError) {
        console.error("載入本月建議配額失敗:", monthlyRulesError.message);
        setStaffRows([]);
        setPartTimeRows([]);
        setRegionStats([]);
        setLoading(false);
        return;
      }

      const allProfiles = (profilesData ?? []) as ProfileLite[];
      const staffProfiles = allProfiles.filter((profile) => profile.role === "staff");
      const partTimeProfiles = allProfiles.filter(
        (profile) => profile.role === "part_time"
      );

      const regions = (regionsData ?? []) as RegionLite[];
      const dailyEntries = (dailyEntriesData ?? []) as DailyEntryLite[];
      const monthlyRules = (monthlyRulesData ?? []) as MonthlyRegionRuleLite[];

      const entriesByUser = new Map<string, number>();
      const entriesByRegion = new Map<number, number>();
      const quotaByRegion = new Map<number, number>();

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

      monthlyRules.forEach((rule) => {
        quotaByRegion.set(rule.region_id, Number(rule.quota ?? 0));
      });

      const nextStaffRows: StaffRow[] = staffProfiles
        .map((profile) => {
          const totalQuantity = entriesByUser.get(profile.id) ?? 0;

          let achievementStatus: AchievementStatus = "未填報";

          if (totalQuantity > 0) {
            achievementStatus =
              totalQuantity >= STAFF_TARGET ? "達標" : "未達標";
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
          String(a.employee_code ?? "").localeCompare(
            String(b.employee_code ?? "")
          )
        );

      const nextPartTimeRows: PartTimeRow[] = partTimeProfiles
        .map((profile) => ({
          user_id: profile.id,
          display_name: profile.display_name ?? null,
          employee_code: profile.employee_code ?? null,
          total_quantity: entriesByUser.get(profile.id) ?? 0,
        }))
        .sort((a, b) =>
          String(a.employee_code ?? "").localeCompare(
            String(b.employee_code ?? "")
          )
        );

      const nextRegionStats: RegionStat[] = regions
        .map((region) => {
          const quantity = entriesByRegion.get(region.id) ?? 0;
          const quota = quotaByRegion.get(region.id) ?? 0;

          return {
            region_id: region.id,
            region_name_zh: region.region_name_zh ?? `地區 ${region.id}`,
            quantity,
            quota,
            sort_order: region.sort_order ?? 9999,
          };
        })
        .sort((a, b) => a.sort_order - b.sort_order);

      setStaffRows(nextStaffRows);
      setPartTimeRows(nextPartTimeRows);
      setRegionStats(nextRegionStats);
      setLoading(false);
    }

    loadData();

    return () => {
      mounted = false;
    };
  }, [selectedYear, selectedMonth]);

  const aggregated = useMemo(() => {
    const staffActualTotal = staffRows.reduce(
      (sum, row) => sum + row.total_quantity,
      0
    );

    const partTimeActualTotal = partTimeRows.reduce(
      (sum, row) => sum + row.total_quantity,
      0
    );

    const actualTotalQuantity = staffActualTotal + partTimeActualTotal;

    const monthQuotaTotal = regionStats.reduce(
      (sum, region) => sum + Number(region.quota ?? 0),
      0
    );

    const achievedCount = staffRows.filter(
      (row) => row.achievement_status === "達標"
    ).length;

    const notAchievedCount = staffRows.filter(
      (row) => row.achievement_status === "未達標"
    ).length;

    const notFilledCount = staffRows.filter(
      (row) => row.achievement_status === "未填報"
    ).length;

    let settlementStatus = "未結算";

    if (staffRows.length > 0) {
      if (achievedCount === staffRows.length) {
        settlementStatus = "全部達標";
      } else if (achievedCount > 0) {
        settlementStatus = "部分達標";
      } else if (notAchievedCount > 0) {
        settlementStatus = "未達標";
      }
    }

    return {
      actualTotalQuantity,
      monthQuotaTotal,
      staffActualTotal,
      partTimeActualTotal,
      achievedCount,
      notAchievedCount,
      notFilledCount,
      settlementStatus,
    };
  }, [staffRows, partTimeRows, regionStats]);

  const totalProgressPercent = useMemo(() => {
    return progressPercent(
      aggregated.actualTotalQuantity,
      aggregated.monthQuotaTotal
    );
  }, [aggregated.actualTotalQuantity, aggregated.monthQuotaTotal]);

  const totalProgressColor = useMemo(() => {
    return getProgressColor(
      aggregated.actualTotalQuantity,
      aggregated.monthQuotaTotal
    );
  }, [aggregated.actualTotalQuantity, aggregated.monthQuotaTotal]);

  const totalDisplayedUsers = staffRows.length + partTimeRows.length;

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
                      const active =
                        selectedYear === year && selectedMonth === month;

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
                  目前顯示：{totalDisplayedUsers} 人
                </span>
              </div>
            </div>

            <section className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
              <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
                <p className="text-sm text-slate-500">本月總數</p>
                <p className="mt-2 text-3xl font-bold text-slate-900">
                  {aggregated.monthQuotaTotal}
                </p>
              </div>

              <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
                <p className="text-sm text-slate-500">達標人數（全職）</p>
                <p className="mt-2 text-3xl font-bold text-slate-900">
                  {aggregated.achievedCount}
                </p>
              </div>

              <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
                <p className="text-sm text-slate-500">未達標人數（全職）</p>
                <p className="mt-2 text-3xl font-bold text-slate-900">
                  {aggregated.notAchievedCount}
                </p>
              </div>

              <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
                <p className="text-sm text-slate-500">月結算狀態（全職）</p>
                <p className="mt-2 text-2xl font-bold text-slate-900">
                  {aggregated.settlementStatus}
                </p>
              </div>
            </section>

            <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
              <h2 className="text-xl font-semibold text-slate-900">總達標進度</h2>

              <div className="mt-6">
                <div className="mb-2 flex items-center justify-between text-sm">
                  <span className="text-slate-700">本月實際完成 / 本月總數</span>
                  <span
                    className={`font-semibold ${getProgressTextColor(
                      aggregated.actualTotalQuantity,
                      aggregated.monthQuotaTotal
                    )}`}
                  >
                    {aggregated.actualTotalQuantity} / {aggregated.monthQuotaTotal}
                  </span>
                </div>

                <div className="h-3 w-full rounded-full bg-slate-200">
                  <div
                    className={`h-3 rounded-full transition-all ${totalProgressColor}`}
                    style={{ width: `${totalProgressPercent}%` }}
                  />
                </div>
              </div>

              <div className="mt-4 grid gap-3 sm:grid-cols-2">
                <div className="rounded-xl bg-slate-50 px-4 py-3 text-sm text-slate-700">
                  全職完成：{aggregated.staffActualTotal}
                </div>
                <div className="rounded-xl bg-slate-50 px-4 py-3 text-sm text-slate-700">
                  兼職完成：{aggregated.partTimeActualTotal}
                </div>
              </div>
            </section>

            <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
              <h2 className="text-xl font-semibold text-slate-900">地區統計</h2>

              <div className="mt-6 space-y-5">
                {regionStats.map((region) => {
                  const width = progressPercent(region.quantity, region.quota);
                  const barColor = getProgressColor(region.quantity, region.quota);
                  const textColor = getProgressTextColor(
                    region.quantity,
                    region.quota
                  );

                  return (
                    <div key={region.region_id}>
                      <div className="mb-2 flex items-center justify-between gap-4 text-sm">
                        <span className="font-medium text-slate-800">
                          {region.region_name_zh}
                        </span>
                        <span className={`font-semibold ${textColor}`}>
                          {region.quantity} / {region.quota}
                        </span>
                      </div>

                      <div className="h-3 w-full rounded-full bg-slate-200">
                        <div
                          className={`h-3 rounded-full transition-all ${barColor}`}
                          style={{ width: `${width}%` }}
                        />
                      </div>
                    </div>
                  );
                })}

                {regionStats.length === 0 && (
                  <div className="text-sm text-slate-500">本月暫無地區資料</div>
                )}
              </div>
            </section>

            <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
              <div className="mb-4 flex items-center justify-between">
                <h2 className="text-xl font-semibold text-slate-900">全職員工統計</h2>
                <span className="text-sm text-slate-500">達標標準：400分</span>
              </div>

              <div className="overflow-x-auto">
                <table className="min-w-full border-separate border-spacing-0">
                  <thead>
                    <tr>
                      <th className="border-b border-slate-200 px-4 py-3 text-left text-sm font-semibold text-slate-700">
                        員工
                      </th>
                      <th className="border-b border-slate-200 px-4 py-3 text-left text-sm font-semibold text-slate-700">
                        員工編號
                      </th>
                      <th className="border-b border-slate-200 px-4 py-3 text-right text-sm font-semibold text-slate-700">
                        總分
                      </th>
                      <th className="border-b border-slate-200 px-4 py-3 text-center text-sm font-semibold text-slate-700">
                        狀態
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {staffRows.map((row) => (
                      <tr key={row.user_id}>
                        <td className="border-b border-slate-100 px-4 py-3 text-sm text-slate-800">
                          {row.display_name || "-"}
                        </td>
                        <td className="border-b border-slate-100 px-4 py-3 text-sm text-slate-600">
                          {row.employee_code || "-"}
                        </td>
                        <td className="border-b border-slate-100 px-4 py-3 text-right text-sm font-semibold text-slate-900">
                          {row.total_quantity}
                        </td>
                        <td className="border-b border-slate-100 px-4 py-3 text-center text-sm">
                          <span
                            className={`inline-flex rounded-full px-3 py-1 text-xs font-semibold ${getStatusBadgeClass(
                              row.achievement_status
                            )}`}
                          >
                            {row.achievement_status}
                          </span>
                        </td>
                      </tr>
                    ))}

                    {staffRows.length === 0 && (
                      <tr>
                        <td
                          colSpan={4}
                          className="px-4 py-8 text-center text-sm text-slate-500"
                        >
                          本月暫無全職員工資料
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </section>

            <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
              <div className="mb-4 flex items-center justify-between">
                <h2 className="text-xl font-semibold text-slate-900">兼職員工統計</h2>
                <span className="text-sm text-slate-500">兼職只計份數，不計分</span>
              </div>

              <div className="overflow-x-auto">
                <table className="min-w-full border-separate border-spacing-0">
                  <thead>
                    <tr>
                      <th className="border-b border-slate-200 px-4 py-3 text-left text-sm font-semibold text-slate-700">
                        員工
                      </th>
                      <th className="border-b border-slate-200 px-4 py-3 text-left text-sm font-semibold text-slate-700">
                        員工編號
                      </th>
                      <th className="border-b border-slate-200 px-4 py-3 text-right text-sm font-semibold text-slate-700">
                        完成份數
                      </th>
                      <th className="border-b border-slate-200 px-4 py-3 text-center text-sm font-semibold text-slate-700">
                        備註
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {partTimeRows.map((row) => (
                      <tr key={row.user_id}>
                        <td className="border-b border-slate-100 px-4 py-3 text-sm text-slate-800">
                          {row.display_name || "-"}
                        </td>
                        <td className="border-b border-slate-100 px-4 py-3 text-sm text-slate-600">
                          {row.employee_code || "-"}
                        </td>
                        <td className="border-b border-slate-100 px-4 py-3 text-right text-sm font-semibold text-slate-900">
                          {row.total_quantity}
                        </td>
                        <td className="border-b border-slate-100 px-4 py-3 text-center text-sm text-slate-600">
                          不計分
                        </td>
                      </tr>
                    ))}

                    {partTimeRows.length === 0 && (
                      <tr>
                        <td
                          colSpan={4}
                          className="px-4 py-8 text-center text-sm text-slate-500"
                        >
                          本月暫無兼職員工資料
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </section>

            <section className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
                <p className="text-sm text-slate-500">未填報人數（全職）</p>
                <p className="mt-2 text-3xl font-bold text-slate-900">
                  {aggregated.notFilledCount}
                </p>
              </div>

              <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
                <p className="text-sm text-slate-500">目前顯示總人數</p>
                <p className="mt-2 text-3xl font-bold text-slate-900">
                  {totalDisplayedUsers}
                </p>
              </div>
            </section>
          </div>
        </div>
      </div>
    </main>
  );
}