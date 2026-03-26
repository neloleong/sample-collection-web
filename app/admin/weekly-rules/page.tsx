"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "../../../lib/supabase";
import PageActionButtons from "../../components/PageActionButtons";

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
  region_id: number;
  week_start_date: string;
  status_color: "red" | "yellow" | "green" | "grey" | null;
  multiplier: number | null;
};

type RuleRow = {
  region_id: number;
  sort_order: number;
  region_name_zh: string;
  quota: string;
  basic_score: string;
  extended_score: string;
  balance_score: string;
};

type WeeklyRow = {
  region_id: number;
  sort_order: number;
  region_name_zh: string;
  weekly_status_color: "" | "red" | "yellow" | "green" | "grey";
};

function getMonthStart() {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  return `${year}-${month}-01`;
}

function getWeekStart(dateString?: string) {
  const date = dateString ? new Date(`${dateString}T00:00:00`) : new Date();
  const day = date.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  date.setDate(date.getDate() + diff);
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const dayText = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${dayText}`;
}

function statusToMultiplier(status: "" | "red" | "yellow" | "green" | "grey") {
  switch (status) {
    case "red":
      return 1.4;
    case "yellow":
      return 1.2;
    case "green":
      return 1;
    case "grey":
      return 0;
    default:
      return null;
  }
}

function multiplierLabel(status: "" | "red" | "yellow" | "green" | "grey") {
  switch (status) {
    case "red":
      return "紅色 1.4";
    case "yellow":
      return "黃色 1.2";
    case "green":
      return "綠色 1";
    case "grey":
      return "灰色 0";
    default:
      return "-";
  }
}

export default function AdminWeeklyRulesPage() {
  const router = useRouter();

  const [loading, setLoading] = useState(true);
  const [savingRules, setSavingRules] = useState(false);
  const [savingWeekly, setSavingWeekly] = useState(false);
  const [message, setMessage] = useState("");

  const [displayName, setDisplayName] = useState("");
  const [selectedMonth, setSelectedMonth] = useState(getMonthStart());
  const [selectedWeekStart, setSelectedWeekStart] = useState(getWeekStart());

  const [regions, setRegions] = useState<RegionCategory[]>([]);
  const [ruleRows, setRuleRows] = useState<RuleRow[]>([]);
  const [weeklyRows, setWeeklyRows] = useState<WeeklyRow[]>([]);

  const totalRegions = useMemo(() => regions.length, [regions]);

  const loadBase = async () => {
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      router.replace("/login");
      return false;
    }

    const { data: profileData } = await supabase
      .from("profiles")
      .select("display_name, role")
      .eq("id", user.id)
      .maybeSingle();

    if (profileData?.role !== "admin") {
      router.replace("/dashboard");
      return false;
    }

    setDisplayName(profileData?.display_name ?? user.email ?? "Admin");

    const { data: regionData, error: regionError } = await supabase
      .from("region_categories")
      .select("id, region_name_zh, sort_order, is_non_mainland")
      .order("sort_order", { ascending: true });

    if (regionError) {
      setMessage(regionError.message);
      return false;
    }

    setRegions((regionData ?? []) as RegionCategory[]);
    return (regionData ?? []) as RegionCategory[];
  };

  const loadMonthlyRules = async (regionList?: RegionCategory[]) => {
    const effectiveRegions = regionList ?? regions;

    const { data: ruleData, error: ruleError } = await supabase
      .from("monthly_region_rules")
      .select(
        "region_id, rule_month, quota, basic_score, extended_score, balance_score"
      )
      .eq("rule_month", selectedMonth);

    if (ruleError) {
      setMessage(ruleError.message);
      return;
    }

    const ruleList = (ruleData ?? []) as MonthlyRegionRule[];
    const ruleMap = new Map<number, MonthlyRegionRule>();
    ruleList.forEach((item) => {
      ruleMap.set(item.region_id, item);
    });

    const nextRuleRows: RuleRow[] = effectiveRegions.map((region) => {
      const rule = ruleMap.get(region.id);

      return {
        region_id: region.id,
        sort_order: region.sort_order,
        region_name_zh: region.region_name_zh,
        quota: rule?.quota != null ? String(rule.quota) : "",
        basic_score: rule?.basic_score != null ? String(rule.basic_score) : "",
        extended_score:
          rule?.extended_score != null ? String(rule.extended_score) : "",
        balance_score:
          rule?.balance_score != null ? String(rule.balance_score) : "",
      };
    });

    setRuleRows(nextRuleRows);
  };

  const loadWeeklyRules = async (regionList?: RegionCategory[]) => {
    const effectiveRegions = regionList ?? regions;

    const { data: weeklyData, error: weeklyError } = await supabase
      .from("weekly_market_status")
      .select("region_id, week_start_date, status_color, multiplier")
      .eq("week_start_date", selectedWeekStart);

    if (weeklyError) {
      setMessage(weeklyError.message);
      return;
    }

    const weeklyList = (weeklyData ?? []) as WeeklyMarketStatus[];
    const weeklyMap = new Map<number, WeeklyMarketStatus>();
    weeklyList.forEach((item) => {
      weeklyMap.set(item.region_id, item);
    });

    const nextWeeklyRows: WeeklyRow[] = effectiveRegions.map((region) => {
      const weekly = weeklyMap.get(region.id);

      return {
        region_id: region.id,
        sort_order: region.sort_order,
        region_name_zh: region.region_name_zh,
        weekly_status_color: (weekly?.status_color ?? "") as
          | ""
          | "red"
          | "yellow"
          | "green"
          | "grey",
      };
    });

    setWeeklyRows(nextWeeklyRows);
  };

  const loadPage = async () => {
    setLoading(true);
    setMessage("");

    const regionList = await loadBase();
    if (!regionList) {
      setLoading(false);
      return;
    }

    await Promise.all([
      loadMonthlyRules(regionList),
      loadWeeklyRules(regionList),
    ]);

    setLoading(false);
  };

  useEffect(() => {
    void loadPage();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedMonth, selectedWeekStart]);

  const handleRuleRowChange = (
    regionId: number,
    field: keyof Pick<
      RuleRow,
      "quota" | "basic_score" | "extended_score" | "balance_score"
    >,
    value: string
  ) => {
    setRuleRows((prev) =>
      prev.map((row) =>
        row.region_id === regionId
          ? {
              ...row,
              [field]: value,
            }
          : row
      )
    );
  };

  const handleWeeklyRowChange = (
    regionId: number,
    value: "" | "red" | "yellow" | "green" | "grey"
  ) => {
    setWeeklyRows((prev) =>
      prev.map((row) =>
        row.region_id === regionId
          ? {
              ...row,
              weekly_status_color: value,
            }
          : row
      )
    );
  };

  const handleSaveRules = async () => {
    setSavingRules(true);
    setMessage("");

    const payload = ruleRows
      .filter(
        (row) =>
          row.quota !== "" ||
          row.basic_score !== "" ||
          row.extended_score !== "" ||
          row.balance_score !== ""
      )
      .map((row) => ({
        rule_month: selectedMonth,
        region_id: row.region_id,
        quota: row.quota === "" ? 0 : Number(row.quota),
        basic_score: row.basic_score === "" ? 0 : Number(row.basic_score),
        extended_score:
          row.extended_score === "" ? 0 : Number(row.extended_score),
        balance_score:
          row.balance_score === "" ? 0 : Number(row.balance_score),
      }));

    const { error } = await supabase
      .from("monthly_region_rules")
      .upsert(payload, { onConflict: "rule_month,region_id" });

    if (error) {
      setMessage(error.message);
      setSavingRules(false);
      return;
    }

    setMessage("本月地區規則已儲存。");
    setSavingRules(false);

    // 只重載本月規則，不碰本週調整未儲存內容
    await loadMonthlyRules();
  };

  const handleSaveWeekly = async () => {
    setSavingWeekly(true);
    setMessage("");

    const payload = weeklyRows
      .filter((row) => row.weekly_status_color !== "")
      .map((row) => ({
        week_start_date: selectedWeekStart,
        region_id: row.region_id,
        status_color: row.weekly_status_color,
        multiplier: statusToMultiplier(row.weekly_status_color),
        note: null,
      }));

    const { error } = await supabase
      .from("weekly_market_status")
      .upsert(payload, { onConflict: "week_start_date,region_id" });

    if (error) {
      setMessage(error.message);
      setSavingWeekly(false);
      return;
    }

    setMessage("本週市場調整分數已儲存。");
    setSavingWeekly(false);

    // 只重載本週調整，不碰本月規則未儲存內容
    await loadWeeklyRules();
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
          
            <div>
              <h1 className="text-2xl font-bold text-slate-900">Admin 規則設定</h1>
              <p className="mt-1 text-sm text-slate-600">管理員：{displayName}</p>
              <p className="mt-1 text-sm text-slate-500">地區數量：{totalRegions}</p>
            </div>
          <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
                    <PageActionButtons />
          </div>  

          <div className="mt-6 grid gap-4 md:grid-cols-2">
            <div>
              <label className="mb-2 block text-sm font-medium text-slate-700">
                規則月份
              </label>
              <input
                type="date"
                value={selectedMonth}
                onChange={(e) => {
                  const value = e.target.value;
                  const monthDate = new Date(`${value}T00:00:00`);
                  monthDate.setDate(1);
                  const year = monthDate.getFullYear();
                  const month = String(monthDate.getMonth() + 1).padStart(2, "0");
                  setSelectedMonth(`${year}-${month}-01`);
                }}
                className="w-full rounded-xl border border-slate-300 px-4 py-2 text-sm outline-none focus:border-slate-500"
              />
            </div>

            <div>
              <label className="mb-2 block text-sm font-medium text-slate-700">
                每星期調整起始日（週一）
              </label>
              <input
                type="date"
                value={selectedWeekStart}
                onChange={(e) => {
                  setSelectedWeekStart(getWeekStart(e.target.value));
                }}
                className="w-full rounded-xl border border-slate-300 px-4 py-2 text-sm outline-none focus:border-slate-500"
              />
            </div>
          </div>

          {message ? (
            <div className="mt-4 rounded-xl bg-slate-50 px-4 py-3 text-sm text-slate-700">
              {message}
            </div>
          ) : null}
        </div>

        <div className="rounded-2xl bg-white p-6 shadow-sm ring-1 ring-slate-200">
          <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <h2 className="text-lg font-semibold text-slate-900">
              {totalRegions} 個地區類別規則設定
            </h2>

            <div className="flex flex-wrap gap-3">
              <button
                type="button"
                onClick={handleSaveRules}
                disabled={savingRules}
                className="rounded-xl bg-slate-900 px-4 py-2 text-sm text-white hover:bg-slate-800 disabled:opacity-50"
              >
                {savingRules ? "儲存中..." : "儲存本月規則"}
              </button>

              <button
                type="button"
                onClick={handleSaveWeekly}
                disabled={savingWeekly}
                className="rounded-xl border border-slate-300 px-4 py-2 text-sm text-slate-700 hover:bg-slate-100 disabled:opacity-50"
              >
                {savingWeekly ? "儲存中..." : "儲存本週調整"}
              </button>
            </div>
          </div>

          <div className="mt-6 overflow-x-auto">
            <table className="min-w-full border-collapse">
              <thead>
                <tr className="border-b border-slate-200 text-left text-sm font-semibold text-slate-600">
                  <th className="px-3 py-3">序號</th>
                  <th className="px-3 py-3">地區</th>
                  <th className="px-3 py-3">建議配額</th>
                  <th className="px-3 py-3">基本分數</th>
                  <th className="px-3 py-3">延伸分數</th>
                  <th className="px-3 py-3">平衡分數</th>
                  <th className="px-3 py-3">每星期調整分數</th>
                </tr>
              </thead>
              <tbody>
                {regions.map((region) => {
                  const ruleRow = ruleRows.find((r) => r.region_id === region.id);
                  const weeklyRow = weeklyRows.find((w) => w.region_id === region.id);

                  return (
                    <tr key={region.id} className="border-b border-slate-100 text-sm">
                      <td className="px-3 py-3">{region.sort_order}</td>
                      <td className="px-3 py-3">{region.region_name_zh}</td>

                      <td className="px-3 py-3">
                        <input
                          type="number"
                          min="0"
                          step="1"
                          placeholder="留空待填"
                          value={ruleRow?.quota ?? ""}
                          onChange={(e) =>
                            handleRuleRowChange(region.id, "quota", e.target.value)
                          }
                          className="w-28 rounded-xl border border-slate-300 px-3 py-2 outline-none focus:border-slate-500"
                        />
                      </td>

                      <td className="px-3 py-3">
                        <input
                          type="number"
                          min="0"
                          step="0.01"
                          placeholder="留空待填"
                          value={ruleRow?.basic_score ?? ""}
                          onChange={(e) =>
                            handleRuleRowChange(region.id, "basic_score", e.target.value)
                          }
                          className="w-28 rounded-xl border border-slate-300 px-3 py-2 outline-none focus:border-slate-500"
                        />
                      </td>

                      <td className="px-3 py-3">
                        <input
                          type="number"
                          min="0"
                          step="0.01"
                          placeholder="留空待填"
                          value={ruleRow?.extended_score ?? ""}
                          onChange={(e) =>
                            handleRuleRowChange(
                              region.id,
                              "extended_score",
                              e.target.value
                            )
                          }
                          className="w-28 rounded-xl border border-slate-300 px-3 py-2 outline-none focus:border-slate-500"
                        />
                      </td>

                      <td className="px-3 py-3">
                        <input
                          type="number"
                          min="0"
                          step="0.01"
                          placeholder="留空待填"
                          value={ruleRow?.balance_score ?? ""}
                          onChange={(e) =>
                            handleRuleRowChange(region.id, "balance_score", e.target.value)
                          }
                          className="w-28 rounded-xl border border-slate-300 px-3 py-2 outline-none focus:border-slate-500"
                        />
                      </td>

                      <td className="px-3 py-3">
                        <div className="flex flex-col gap-2">
                          <select
                            value={weeklyRow?.weekly_status_color ?? ""}
                            onChange={(e) =>
                              handleWeeklyRowChange(
                                region.id,
                                e.target.value as
                                  | ""
                                  | "red"
                                  | "yellow"
                                  | "green"
                                  | "grey"
                              )
                            }
                            className="w-40 rounded-xl border border-slate-300 px-3 py-2 outline-none focus:border-slate-500"
                          >
                            <option value="">留空待用</option>
                            <option value="red">紅色：1.4</option>
                            <option value="yellow">黃色：1.2</option>
                            <option value="green">綠色：1</option>
                            <option value="grey">灰色：0</option>
                          </select>

                          <span className="text-xs text-slate-500">
                            目前：{multiplierLabel(weeklyRow?.weekly_status_color ?? "")}
                          </span>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <div className="mt-6 rounded-2xl bg-slate-50 p-4 text-sm text-slate-600">
            <p>計分規則說明：</p>
            <p className="mt-2">1. 基本分數：累計完成率 ≤ 100%</p>
            <p>2. 延伸分數：累計完成率 &gt; 100% 且 ≤ 130%</p>
            <p>3. 平衡分數：累計完成率 &gt; 130%</p>
            <p>4. 配額統計口徑：全公司在該月該地區的累計份數</p>
            <p>5. 每星期調整分數：最終單份分數 = 階段分數 × 每週 multiplier</p>
            <p>6. 「儲存本月規則」與「儲存本週調整」互相獨立，不會覆蓋對方未儲存的修改。</p>
          </div>
        </div>
      </div>
    </main>
  );
}