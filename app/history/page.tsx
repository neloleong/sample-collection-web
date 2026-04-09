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

type Role = "staff" | "admin" | "part_time";

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

type DailyWorkLog = {
  id: number;
  work_date: string;
  interviewer_id: string | null;
  survey_location: string | null;
  working_shift: string | null;
  abnormal_case_count: number | null;
  abnormal_included_in_completed: boolean | null;
  issue_types: string[] | null;
  estimated_footfall: string | null;
  issues_and_suggestions: string | null;
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

type ProfileRow = {
  display_name: string | null;
  role: Role | null;
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

function surveyLocationLabel(value: string | null) {
  switch (value) {
    case "outer_harbour":
      return "外港碼頭 Outer Harbour";
    case "taipa_ferry_terminal":
      return "氹仔客運碼頭（北安） Taipa Ferry Terminal";
    case "border_gate":
      return "關閘 Border Gate";
    case "hkzm_bridge":
      return "港珠澳大橋 HK-Zhuhai-Macao Bridge";
    case "hengqin_port":
      return "橫琴口岸 Hengqin Port";
    case "macau_airport":
      return "澳門國際機場 Macau International Airport";
    case "qingmao_port":
      return "青茂口岸 Qingmao Port";
    case "inner_harbor_ferry_terminal":
      return "內港客運碼頭 Inner Harbor Ferry Terminal";
    default:
      return "-";
  }
}

function footfallLabel(value: string | null) {
  switch (value) {
    case "almost_no_flow":
      return "幾乎無人流，訪問困難 Almost no passenger flow";
    case "light_flow":
      return "零星人流，訪問需主動尋找受訪者 Light passenger flow";
    case "normal_flow":
      return "持續有人流，訪問較順暢 Normal passenger flow";
    case "heavy_flow":
      return "人流密集，需挑選合適受訪者 Heavy passenger flow";
    case "peak_congested":
      return "高峰時段，現場較擠迫 Peak period / Congested";
    default:
      return "-";
  }
}

function issueTypeLabel(value: string) {
  switch (value) {
    case "questionnaire_misunderstanding":
      return "問卷理解問題 Questionnaire misunderstanding";
    case "system_device_issue":
      return "系統或設備問題 System or device issue";
    case "visitor_reaction":
      return "訪客反應或情緒 Visitor reaction or concern";
    case "refusal_early_termination":
      return "拒答或中途退出 Refusal or early termination";
    case "field_environment_issue":
      return "現場環境影響 Field environment issue";
    case "other":
      return "其他 Other";
    default:
      return value;
  }
}

function yesNoLabel(value: boolean | null) {
  if (value === true) return "是 Yes";
  if (value === false) return "否 No";
  return "-";
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
  const [role, setRole] = useState<Role>("staff");
  const [viewingUserId, setViewingUserId] = useState<string | null>(
    presetUserId || null
  );

  const [regions, setRegions] = useState<RegionCategory[]>([]);
  const [selectedYear, setSelectedYear] = useState<number>(initialYear);
  const [selectedMonth, setSelectedMonth] = useState<number>(initialMonth);

  const [entries, setEntries] = useState<DailyEntry[]>([]);
  const [monthlyRules, setMonthlyRules] = useState<MonthlyRegionRule[]>([]);
  const [weeklyStatuses, setWeeklyStatuses] = useState<WeeklyMarketStatus[]>([]);
  const [workLogs, setWorkLogs] = useState<DailyWorkLog[]>([]);

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

  const visibleWorkLogs = useMemo(() => {
    return [...workLogs].sort((a, b) => b.work_date.localeCompare(a.work_date));
  }, [workLogs]);

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

  const isPartTime = role === "part_time";
  const showScoreCards = !isPartTime;
  const showThresholdCards = !isPartTime;
  const showWeeklyAdjustments = !isPartTime;
  const showRuleScoreColumns = !isPartTime;

  const loadHistoryData = async (userId: string, userEmail?: string | null) => {
    setLoading(true);
    setMessage("");

    const { data: profileData, error: profileError } = await supabase
      .from("profiles")
      .select("display_name, role")
      .eq("id", userId)
      .maybeSingle();

    if (profileError) {
      setMessage(profileError.message);
    }

    const profile = (profileData as ProfileRow | null) ?? null;

    setDisplayName(profile?.display_name ?? userEmail ?? "User");
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

    const { data: workLogData, error: workLogError } = await supabase
      .from("daily_work_logs")
      .select(
        "id, work_date, interviewer_id, survey_location, working_shift, abnormal_case_count, abnormal_included_in_completed, issue_types, estimated_footfall, issues_and_suggestions"
      )
      .eq("user_id", userId)
      .gte("work_date", monthStart)
      .lt("work_date", nextMonthStart)
      .order("work_date", { ascending: false });

    if (workLogError) {
      setMessage(workLogError.message);
      setLoading(false);
      return;
    }

    setWorkLogs((workLogData ?? []) as DailyWorkLog[]);
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
          <p className="mt-1 text-sm text-slate-500">
            角色：
            {role === "admin"
              ? "管理員"
              : role === "part_time"
              ? "兼職"
              : "全職"}
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

            <div
              className={`grid gap-4 ${
                showScoreCards ? "md:grid-cols-4" : "md:grid-cols-2"
              }`}
            >
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

              {showScoreCards ? (
                <>
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
                </>
              ) : null}
            </div>

            {showThresholdCards ? (
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
            ) : null}

            <div className="rounded-2xl bg-white p-6 shadow-sm ring-1 ring-slate-200">
              <h3 className="text-lg font-semibold text-slate-900">該月現場工作記錄</h3>

              {visibleWorkLogs.length === 0 ? (
                <div className="mt-4 rounded-xl bg-slate-50 px-4 py-6 text-sm text-slate-500">
                  該月暫時未有現場工作記錄。
                </div>
              ) : (
                <div className="mt-4 space-y-4">
                  {visibleWorkLogs.map((log) => (
                    <div
                      key={log.id}
                      className="rounded-2xl border border-slate-200 p-5"
                    >
                      <div className="mb-4 flex items-center justify-between gap-4">
                        <h4 className="text-base font-semibold text-slate-900">
                          日期：{log.work_date}
                        </h4>
                        <span className="rounded-full bg-slate-100 px-3 py-1 text-xs text-slate-600">
                          訪問員：{log.interviewer_id || "-"}
                        </span>
                      </div>

                      <div className="grid gap-4 md:grid-cols-2">
                        <div className="rounded-xl bg-slate-50 p-4">
                          <p className="text-xs text-slate-500">
                            1. 訪問員編號 Interviewer ID
                          </p>
                          <p className="mt-2 text-sm font-medium text-slate-900">
                            {log.interviewer_id || "-"}
                          </p>
                        </div>

                        <div className="rounded-xl bg-slate-50 p-4">
                          <p className="text-xs text-slate-500">2. 日期 Date</p>
                          <p className="mt-2 text-sm font-medium text-slate-900">
                            {log.work_date}
                          </p>
                        </div>

                        <div className="rounded-xl bg-slate-50 p-4">
                          <p className="text-xs text-slate-500">
                            3. 工作口岸 Survey Location
                          </p>
                          <p className="mt-2 text-sm font-medium text-slate-900">
                            {surveyLocationLabel(log.survey_location)}
                          </p>
                        </div>

                        <div className="rounded-xl bg-slate-50 p-4">
                          <p className="text-xs text-slate-500">
                            4. 工作時段 Working Shift
                          </p>
                          <p className="mt-2 text-sm font-medium text-slate-900">
                            {log.working_shift || "-"}
                          </p>
                        </div>

                        <div className="rounded-xl bg-slate-50 p-4">
                          <p className="text-xs text-slate-500">
                            5. 異常樣本數量 Number of abnormal cases
                          </p>
                          <p className="mt-2 text-sm font-medium text-slate-900">
                            {log.abnormal_case_count ?? 0}
                          </p>
                        </div>

                        <div className="rounded-xl bg-slate-50 p-4">
                          <p className="text-xs text-slate-500">
                            6. 異常樣本是否包括在完成份數內？
                          </p>
                          <p className="mt-2 text-sm font-medium text-slate-900">
                            {yesNoLabel(log.abnormal_included_in_completed)}
                          </p>
                        </div>

                        <div className="rounded-xl bg-slate-50 p-4 md:col-span-2">
                          <p className="text-xs text-slate-500">
                            7. 異常類型 Type of issue
                          </p>
                          <div className="mt-2 flex flex-wrap gap-2">
                            {(log.issue_types ?? []).length > 0 ? (
                              (log.issue_types ?? []).map((item) => (
                                <span
                                  key={item}
                                  className="rounded-full bg-white px-3 py-1 text-xs text-slate-700 ring-1 ring-slate-200"
                                >
                                  {issueTypeLabel(item)}
                                </span>
                              ))
                            ) : (
                              <span className="text-sm font-medium text-slate-900">-</span>
                            )}
                          </div>
                        </div>

                        <div className="rounded-xl bg-slate-50 p-4 md:col-span-2">
                          <p className="text-xs text-slate-500">
                            8. 今日口岸預估人流量 Estimated footfall at the location today
                          </p>
                          <p className="mt-2 text-sm font-medium text-slate-900">
                            {footfallLabel(log.estimated_footfall)}
                          </p>
                        </div>

                        <div className="rounded-xl bg-slate-50 p-4 md:col-span-2">
                          <p className="text-xs text-slate-500">
                            9. 問卷期間發現的問題及建議
                          </p>
                          <p className="mt-2 whitespace-pre-wrap text-sm font-medium text-slate-900">
                            {log.issues_and_suggestions || "-"}
                          </p>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
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

            <div className="rounded-2xl bg-white p-6 shadow-sm ring-1 ring-slate-200">
              <h3 className="text-lg font-semibold text-slate-900">該月規則快照</h3>

              <div className="mt-4 overflow-x-auto">
                <table className="min-w-full border-collapse">
                  <thead>
                    <tr className="border-b border-slate-200 text-left text-sm text-slate-500">
                      <th className="px-3 py-3">序號</th>
                      <th className="px-3 py-3">地區</th>
                      <th className="px-3 py-3">建議配額</th>
                      {showRuleScoreColumns ? (
                        <>
                          <th className="px-3 py-3">基本分數</th>
                          <th className="px-3 py-3">延伸分數</th>
                          <th className="px-3 py-3">平衡分數</th>
                        </>
                      ) : null}
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
                          {showRuleScoreColumns ? (
                            <>
                              <td className="px-3 py-3">{rule?.basic_score ?? "-"}</td>
                              <td className="px-3 py-3">{rule?.extended_score ?? "-"}</td>
                              <td className="px-3 py-3">{rule?.balance_score ?? "-"}</td>
                            </>
                          ) : null}
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>

            {showWeeklyAdjustments ? (
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
            ) : null}

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

            {role === "part_time" ? (
              <div className="rounded-2xl bg-slate-50 p-4 text-sm text-slate-600 ring-1 ring-slate-200">
                <p>使用說明：</p>
                <p className="mt-2">1. 兼職只計份數，不計分數。</p>
                <p>2. 本頁會顯示歷史月份的現場工作記錄、份數、各地區總份數、建議配額及填報明細。</p>
                <p>3. 兼職不顯示 400 份是否達標、分數、每週調整記錄及分數型規則欄位。</p>
                <p>4. 建議你重點查看各地區本月份數、建議配額，以及當月現場工作記錄。</p>
              </div>
            ) : (
              <div className="rounded-2xl bg-slate-50 p-4 text-sm text-slate-600 ring-1 ring-slate-200">
                <p>使用說明：</p>
                <p className="mt-2">1. 本頁為歷史月份資料頁，會根據該月份的填報記錄即時計算分數。</p>
                <p>2. 現場工作記錄會顯示該月每日口岸、時段、異常、人流及建議等內容。</p>
                <p>3. 原始分數：根據當月填報份數與地區規則計出的基礎分數，未加入市場倍率。</p>
                <p>4. 調整後分數：在原始分數基礎上，套用每週市場調整倍率後的結果。</p>
                <p>5. 本頁不顯示獎金，只顯示歷史份數、分數、規則快照、每週調整及現場工作記錄。</p>
              </div>
            )}
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