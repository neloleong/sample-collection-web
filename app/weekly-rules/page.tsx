"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "../../lib/supabase";

type RegionCategory = {
  id: number;
  region_name_zh: string;
  sort_order: number;
  is_non_mainland: boolean;
};

type MonthlyRegionRule = {
  region_id: number;
  rule_month: string;
  basic_score: number | string;
  extended_score: number | string;
  balance_score: number | string;
};

type WeeklyScoringRule = {
  id?: number;
  rule_month: string;
  week_index: number;
  week_start_date: string;
  week_end_date: string;
  region_id: number;
  basic_score_override: number | string | null;
  extended_score_override: number | string | null;
  balance_score_override: number | string | null;
  is_active: boolean;
};

type OverrideFormRow = {
  basic_score_override: string;
  extended_score_override: string;
  balance_score_override: string;
};

type WeekRange = {
  week_index: number;
  week_start_date: string;
  week_end_date: string;
};

function formatDate(date: Date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function getCurrentMonthValue() {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, "0");
  return `${y}-${m}`;
}

function getMonthStartString(monthValue: string) {
  return `${monthValue}-01`;
}

function buildMonthWeeks(monthValue: string): WeekRange[] {
  const [yearText, monthText] = monthValue.split("-");
  const year = Number(yearText);
  const monthIndex = Number(monthText) - 1;

  const monthStart = new Date(year, monthIndex, 1);
  const monthEnd = new Date(year, monthIndex + 1, 0);

  const firstSunday = new Date(monthStart);
  const dow = firstSunday.getDay(); // Sun=0, Mon=1...
  if (dow !== 0) {
    firstSunday.setDate(firstSunday.getDate() + (7 - dow));
  }

  const weeks: WeekRange[] = [
    {
      week_index: 1,
      week_start_date: formatDate(monthStart),
      week_end_date: formatDate(firstSunday),
    },
  ];

  let nextStart = new Date(firstSunday);
  nextStart.setDate(nextStart.getDate() + 1);

  let weekIndex = 2;

  while (nextStart <= monthEnd) {
    const weekStart = new Date(nextStart);
    const weekEnd = new Date(nextStart);
    weekEnd.setDate(weekEnd.getDate() + 6);

    if (weekEnd > monthEnd) {
      weekEnd.setTime(monthEnd.getTime());
    }

    weeks.push({
      week_index: weekIndex,
      week_start_date: formatDate(weekStart),
      week_end_date: formatDate(weekEnd),
    });

    nextStart = new Date(weekStart);
    nextStart.setDate(nextStart.getDate() + 7);
    weekIndex += 1;
  }

  return weeks;
}

export default function WeeklyRulesPage() {
  const router = useRouter();

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");

  const [currentUserId, setCurrentUserId] = useState("");
  const [currentAdminName, setCurrentAdminName] = useState("");

  const [selectedMonth, setSelectedMonth] = useState(getCurrentMonthValue());
  const [selectedWeekIndex, setSelectedWeekIndex] = useState<number>(2);

  const [regions, setRegions] = useState<RegionCategory[]>([]);
  const [baseRules, setBaseRules] = useState<Map<number, MonthlyRegionRule>>(new Map());
  const [allOverrides, setAllOverrides] = useState<WeeklyScoringRule[]>([]);
  const [formValues, setFormValues] = useState<Record<number, OverrideFormRow>>({});

  const weeks = useMemo(() => buildMonthWeeks(selectedMonth), [selectedMonth]);
  const ruleMonth = getMonthStartString(selectedMonth);

  const selectedWeek = useMemo(() => {
    return weeks.find((week) => week.week_index === selectedWeekIndex) ?? weeks[0];
  }, [weeks, selectedWeekIndex]);

  const selectedWeekOverrides = useMemo(() => {
    return allOverrides.filter((item) => item.week_index === selectedWeekIndex);
  }, [allOverrides, selectedWeekIndex]);

  const buildEmptyFormValues = (regionList: RegionCategory[]) => {
    const initial: Record<number, OverrideFormRow> = {};
    regionList.forEach((region) => {
      initial[region.id] = {
        basic_score_override: "",
        extended_score_override: "",
        balance_score_override: "",
      };
    });
    return initial;
  };

  const fillFormFromOverrides = (
    regionList: RegionCategory[],
    overrides: WeeklyScoringRule[]
  ) => {
    const nextValues = buildEmptyFormValues(regionList);

    overrides.forEach((item) => {
      nextValues[item.region_id] = {
        basic_score_override:
          item.basic_score_override === null || item.basic_score_override === undefined
            ? ""
            : String(item.basic_score_override),
        extended_score_override:
          item.extended_score_override === null ||
          item.extended_score_override === undefined
            ? ""
            : String(item.extended_score_override),
        balance_score_override:
          item.balance_score_override === null ||
          item.balance_score_override === undefined
            ? ""
            : String(item.balance_score_override),
      };
    });

    setFormValues(nextValues);
  };

  const loadPageData = async (monthValue: string) => {
    setLoading(true);
    setMessage("");

    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      router.replace("/login");
      return;
    }

    setCurrentUserId(user.id);

    const { data: myProfile, error: myProfileError } = await supabase
      .from("profiles")
      .select("display_name, role")
      .eq("id", user.id)
      .maybeSingle();

    if (myProfileError) {
      setMessage(myProfileError.message);
      setLoading(false);
      return;
    }

    if (!myProfile || myProfile.role !== "admin") {
      setMessage("你不是管理員，無法進入此頁。");
      setLoading(false);
      return;
    }

    setCurrentAdminName(myProfile.display_name ?? user.email ?? "Admin");

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

    const monthStart = getMonthStartString(monthValue);

    const { data: monthlyRuleData, error: monthlyRuleError } = await supabase
      .from("monthly_region_rules")
      .select("region_id, rule_month, basic_score, extended_score, balance_score")
      .lte("rule_month", monthStart)
      .order("rule_month", { ascending: false });

    if (monthlyRuleError) {
      setMessage(monthlyRuleError.message);
      setLoading(false);
      return;
    }

    const latestRuleByRegion = new Map<number, MonthlyRegionRule>();
    ((monthlyRuleData ?? []) as MonthlyRegionRule[]).forEach((rule) => {
      if (!latestRuleByRegion.has(rule.region_id)) {
        latestRuleByRegion.set(rule.region_id, rule);
      }
    });

    setBaseRules(latestRuleByRegion);

    const { data: overrideData, error: overrideError } = await supabase
      .from("weekly_scoring_rules")
      .select(
        "id, rule_month, week_index, week_start_date, week_end_date, region_id, basic_score_override, extended_score_override, balance_score_override, is_active"
      )
      .eq("rule_month", monthStart)
      .order("week_index", { ascending: true })
      .order("region_id", { ascending: true });

    if (overrideError) {
      setMessage(overrideError.message);
      setLoading(false);
      return;
    }

    const overrideList = (overrideData ?? []) as WeeklyScoringRule[];
    setAllOverrides(overrideList);

    const weeksForMonth = buildMonthWeeks(monthValue);
    const initialWeekIndex = weeksForMonth.length >= 2 ? 2 : 1;
    setSelectedWeekIndex(initialWeekIndex);

    const firstVisibleOverrides = overrideList.filter(
      (item) => item.week_index === initialWeekIndex
    );

    fillFormFromOverrides(regionList, firstVisibleOverrides);

    setLoading(false);
  };

  useEffect(() => {
    loadPageData(selectedMonth);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedMonth]);

  useEffect(() => {
    if (regions.length === 0) return;
    fillFormFromOverrides(regions, selectedWeekOverrides);
  }, [selectedWeekIndex, allOverrides, regions]);

  const handleInputChange = (
    regionId: number,
    field: keyof OverrideFormRow,
    value: string
  ) => {
    if (value !== "") {
      const numericValue = Number(value);
      if (Number.isNaN(numericValue) || numericValue < 0) {
        return;
      }
    }

    setFormValues((prev) => ({
      ...prev,
      [regionId]: {
        ...prev[regionId],
        [field]: value,
      },
    }));
  };

  const handleSave = async () => {
    if (!currentUserId || !selectedWeek) return;

    if (selectedWeekIndex === 1) {
      setMessage("第 1 週固定使用原始設定，不可修改。");
      return;
    }

    setSaving(true);
    setMessage("");

    const rowsForWeek = regions.map((region) => {
      const values = formValues[region.id] ?? {
        basic_score_override: "",
        extended_score_override: "",
        balance_score_override: "",
      };

      const basic =
        values.basic_score_override.trim() === ""
          ? null
          : Number(values.basic_score_override);
      const extended =
        values.extended_score_override.trim() === ""
          ? null
          : Number(values.extended_score_override);
      const balance =
        values.balance_score_override.trim() === ""
          ? null
          : Number(values.balance_score_override);

      return {
        region_id: region.id,
        basic_score_override: basic,
        extended_score_override: extended,
        balance_score_override: balance,
      };
    });

    const toUpsert = rowsForWeek
      .filter(
        (row) =>
          row.basic_score_override !== null ||
          row.extended_score_override !== null ||
          row.balance_score_override !== null
      )
      .map((row) => ({
        rule_month: ruleMonth,
        week_index: selectedWeekIndex,
        week_start_date: selectedWeek.week_start_date,
        week_end_date: selectedWeek.week_end_date,
        region_id: row.region_id,
        basic_score_override: row.basic_score_override,
        extended_score_override: row.extended_score_override,
        balance_score_override: row.balance_score_override,
        is_active: true,
        created_by: currentUserId,
      }));

    const toDeleteRegionIds = rowsForWeek
      .filter(
        (row) =>
          row.basic_score_override === null &&
          row.extended_score_override === null &&
          row.balance_score_override === null
      )
      .map((row) => row.region_id);

    if (toDeleteRegionIds.length > 0) {
      const { error: deleteError } = await supabase
        .from("weekly_scoring_rules")
        .delete()
        .eq("rule_month", ruleMonth)
        .eq("week_index", selectedWeekIndex)
        .in("region_id", toDeleteRegionIds);

      if (deleteError) {
        setMessage(deleteError.message);
        setSaving(false);
        return;
      }
    }

    if (toUpsert.length > 0) {
      const { error: upsertError } = await supabase
        .from("weekly_scoring_rules")
        .upsert(toUpsert, { onConflict: "rule_month,week_index,region_id" });

      if (upsertError) {
        setMessage(upsertError.message);
        setSaving(false);
        return;
      }
    }

    const { data: overrideData, error: overrideError } = await supabase
      .from("weekly_scoring_rules")
      .select(
        "id, rule_month, week_index, week_start_date, week_end_date, region_id, basic_score_override, extended_score_override, balance_score_override, is_active"
      )
      .eq("rule_month", ruleMonth)
      .order("week_index", { ascending: true })
      .order("region_id", { ascending: true });

    if (overrideError) {
      setMessage(overrideError.message);
      setSaving(false);
      return;
    }

    const overrideList = (overrideData ?? []) as WeeklyScoringRule[];
    setAllOverrides(overrideList);
    setMessage("每週調分規則已成功儲存。");
    setSaving(false);
  };

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
        <div className="rounded-2xl bg-white p-6 shadow-sm ring-1 ring-slate-200">
          <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
            <div>
              <h1 className="text-2xl font-bold text-slate-900">Admin 每週調分</h1>
              <p className="mt-1 text-sm text-slate-600">管理員：{currentAdminName}</p>
              <p className="mt-1 text-sm text-slate-500">月份規則：{ruleMonth}</p>
            </div>

            <div className="flex flex-wrap gap-3">
              <Link
                href="/admin"
                className="rounded-xl border border-slate-300 px-4 py-2 text-sm text-slate-700 hover:bg-slate-100"
              >
                返回 Admin 總覽
              </Link>

              <Link
                href="/dashboard"
                className="rounded-xl border border-slate-300 px-4 py-2 text-sm text-slate-700 hover:bg-slate-100"
              >
                個人 Dashboard
              </Link>

              <Link
                href="/"
                className="rounded-xl border border-slate-300 px-4 py-2 text-sm text-slate-700 hover:bg-slate-100"
              >
                首頁
              </Link>
            </div>
          </div>

          {message ? (
            <div className="mt-4 rounded-xl bg-slate-50 px-4 py-3 text-sm text-slate-700">
              {message}
            </div>
          ) : null}
        </div>

        <div className="grid gap-4 md:grid-cols-2">
          <div className="rounded-2xl bg-white p-6 shadow-sm ring-1 ring-slate-200">
            <label className="mb-2 block text-sm font-medium text-slate-700">
              選擇月份
            </label>
            <input
              type="month"
              value={selectedMonth}
              onChange={(e) => setSelectedMonth(e.target.value)}
              className="w-full rounded-xl border border-slate-300 px-4 py-3 outline-none focus:border-slate-500"
            />
          </div>

          <div className="rounded-2xl bg-white p-6 shadow-sm ring-1 ring-slate-200">
            <label className="mb-2 block text-sm font-medium text-slate-700">
              選擇該月週次
            </label>
            <select
              value={selectedWeekIndex}
              onChange={(e) => setSelectedWeekIndex(Number(e.target.value))}
              className="w-full rounded-xl border border-slate-300 px-4 py-3 outline-none focus:border-slate-500"
            >
              {weeks.map((week) => (
                <option key={week.week_index} value={week.week_index}>
                  第 {week.week_index} 週（{week.week_start_date} ～ {week.week_end_date}）
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="rounded-2xl bg-white p-6 shadow-sm ring-1 ring-slate-200">
          <h2 className="text-lg font-semibold text-slate-900">週次說明</h2>

          <div className="mt-4 grid gap-4 md:grid-cols-3">
            <div className="rounded-xl bg-slate-50 p-4">
              <p className="text-sm text-slate-500">目前週次</p>
              <p className="mt-2 text-xl font-bold text-slate-900">
                第 {selectedWeek?.week_index ?? "-"} 週
              </p>
            </div>

            <div className="rounded-xl bg-slate-50 p-4">
              <p className="text-sm text-slate-500">開始日期</p>
              <p className="mt-2 text-xl font-bold text-slate-900">
                {selectedWeek?.week_start_date ?? "-"}
              </p>
            </div>

            <div className="rounded-xl bg-slate-50 p-4">
              <p className="text-sm text-slate-500">結束日期</p>
              <p className="mt-2 text-xl font-bold text-slate-900">
                {selectedWeek?.week_end_date ?? "-"}
              </p>
            </div>
          </div>

          {selectedWeekIndex === 1 ? (
            <div className="mt-4 rounded-xl bg-amber-50 px-4 py-3 text-sm text-amber-800 ring-1 ring-amber-200">
              第 1 週固定使用當月原始設定，不可修改。你可以查看 base rule，但不能儲存 override。
            </div>
          ) : (
            <div className="mt-4 rounded-xl bg-slate-50 px-4 py-3 text-sm text-slate-700">
              第 2 週開始可逐週、逐地區類別調整分數。留空表示沿用當月 base rule。
            </div>
          )}
        </div>

        <div className="rounded-2xl bg-white p-6 shadow-sm ring-1 ring-slate-200">
          <h2 className="text-lg font-semibold text-slate-900">11 個地區類別每週調分</h2>

          <div className="mt-4 overflow-x-auto">
            <table className="min-w-full border-collapse">
              <thead>
                <tr className="border-b border-slate-200 text-left text-sm text-slate-500">
                  <th className="px-3 py-3">類別</th>
                  <th className="px-3 py-3">地區</th>
                  <th className="px-3 py-3">Base Basic</th>
                  <th className="px-3 py-3">Base Extended</th>
                  <th className="px-3 py-3">Base Balance</th>
                  <th className="px-3 py-3">Override Basic</th>
                  <th className="px-3 py-3">Override Extended</th>
                  <th className="px-3 py-3">Override Balance</th>
                </tr>
              </thead>
              <tbody>
                {regions.map((region) => {
                  const baseRule = baseRules.get(region.id);
                  const row = formValues[region.id] ?? {
                    basic_score_override: "",
                    extended_score_override: "",
                    balance_score_override: "",
                  };

                  return (
                    <tr key={region.id} className="border-b border-slate-100 text-sm">
                      <td className="px-3 py-3">{region.id}</td>
                      <td className="px-3 py-3">{region.region_name_zh}</td>
                      <td className="px-3 py-3">
                        {baseRule ? String(baseRule.basic_score) : "-"}
                      </td>
                      <td className="px-3 py-3">
                        {baseRule ? String(baseRule.extended_score) : "-"}
                      </td>
                      <td className="px-3 py-3">
                        {baseRule ? String(baseRule.balance_score) : "-"}
                      </td>
                      <td className="px-3 py-3">
                        <input
                          type="number"
                          min="0"
                          step="0.01"
                          disabled={selectedWeekIndex === 1}
                          value={row.basic_score_override}
                          onChange={(e) =>
                            handleInputChange(
                              region.id,
                              "basic_score_override",
                              e.target.value
                            )
                          }
                          className="w-32 rounded-xl border border-slate-300 px-3 py-2 outline-none focus:border-slate-500 disabled:bg-slate-100"
                          placeholder="留空沿用"
                        />
                      </td>
                      <td className="px-3 py-3">
                        <input
                          type="number"
                          min="0"
                          step="0.01"
                          disabled={selectedWeekIndex === 1}
                          value={row.extended_score_override}
                          onChange={(e) =>
                            handleInputChange(
                              region.id,
                              "extended_score_override",
                              e.target.value
                            )
                          }
                          className="w-32 rounded-xl border border-slate-300 px-3 py-2 outline-none focus:border-slate-500 disabled:bg-slate-100"
                          placeholder="留空沿用"
                        />
                      </td>
                      <td className="px-3 py-3">
                        <input
                          type="number"
                          min="0"
                          step="0.01"
                          disabled={selectedWeekIndex === 1}
                          value={row.balance_score_override}
                          onChange={(e) =>
                            handleInputChange(
                              region.id,
                              "balance_score_override",
                              e.target.value
                            )
                          }
                          className="w-32 rounded-xl border border-slate-300 px-3 py-2 outline-none focus:border-slate-500 disabled:bg-slate-100"
                          placeholder="留空沿用"
                        />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <div className="mt-6 flex gap-3">
            <button
              onClick={handleSave}
              disabled={saving || selectedWeekIndex === 1}
              className="rounded-xl bg-slate-900 px-6 py-3 font-medium text-white hover:bg-slate-800 disabled:opacity-50"
            >
              {saving ? "儲存中..." : "儲存本週規則"}
            </button>
          </div>
        </div>
      </div>
    </main>
  );
}