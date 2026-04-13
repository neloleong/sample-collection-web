"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "../../lib/supabase";
import PageActionButtons from "../components/PageActionButtons";

type Role = "admin" | "staff" | "part_time";

type RegionCategory = {
  id: number;
  region_name_zh: string;
  sort_order: number;
  is_non_mainland: boolean;
};

type DailyEntryRow = {
  id?: number;
  region_id: number;
  quantity: number;
};

type DailyWorkLogRow = {
  id?: number;
  user_id?: string;
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

type WorkLogForm = {
  interviewer_id: string;
  survey_location: string;
  working_shift: string;
  abnormal_case_count: string;
  abnormal_included_in_completed: "" | "yes" | "no";
  issue_types: string[];
  estimated_footfall: string;
  issues_and_suggestions: string;
};

type ProfileRow = {
  display_name: string | null;
  employee_code: string | null;
  role: Role | null;
};

type RegionQuotaStat = {
  region_id: number;
  quota: number;
  rawMonthTotal: number;
  savedTodayQty: number;
  currentInputQty: number;
  nextMonthTotal: number;
  remainingBeforeToday: number;
  isLocked: boolean;
  isOverLimit: boolean;
};

function getLocalTodayString() {
  const now = new Date();
  const local = new Date(now.getTime() - now.getTimezoneOffset() * 60000);
  return local.toISOString().slice(0, 10);
}

function getShiftParts(value: string) {
  if (!value) {
    return { start: "", end: "" };
  }

  const [start, end] = value.split("-");
  return {
    start: (start ?? "").trim(),
    end: (end ?? "").trim(),
  };
}

function buildShiftValue(start: string, end: string) {
  const cleanStart = start.trim();
  const cleanEnd = end.trim();

  if (!cleanStart && !cleanEnd) return "";
  return `${cleanStart}-${cleanEnd}`;
}

function isValidTimeText(value: string) {
  return /^\d{2}:\d{2}$/.test(value);
}

function getEmptyWorkLogForm(): WorkLogForm {
  return {
    interviewer_id: "",
    survey_location: "",
    working_shift: "",
    abnormal_case_count: "",
    abnormal_included_in_completed: "",
    issue_types: [],
    estimated_footfall: "",
    issues_and_suggestions: "",
  };
}

function getMonthBounds(dateString: string) {
  const base = new Date(`${dateString}T00:00:00`);
  const year = base.getFullYear();
  const month = base.getMonth();

  const start = new Date(year, month, 1);
  const next = new Date(year, month + 1, 1);

  const format = (d: Date) => {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, "0");
    const day = String(d.getDate()).padStart(2, "0");
    return `${y}-${m}-${day}`;
  };

  return {
    monthStart: format(start),
    nextMonthStart: format(next),
  };
}

const SURVEY_LOCATION_OPTIONS = [
  { value: "outer_harbour", label: "外港碼頭 Outer Harbour" },
  { value: "taipa_ferry_terminal", label: "氹仔客運碼頭（北安） Taipa Ferry Terminal" },
  { value: "border_gate", label: "關閘 Border Gate" },
  { value: "hkzm_bridge", label: "港珠澳大橋 HK-Zhuhai-Macao Bridge" },
  { value: "hengqin_port", label: "橫琴口岸 Hengqin Port" },
  { value: "macau_airport", label: "澳門國際機場 Macau International Airport" },
  { value: "qingmao_port", label: "青茂口岸 Qingmao Port" },
  { value: "inner_harbor_ferry_terminal", label: "内港客運碼頭 Inner Harbor Ferry Terminal" },
];

const ISSUE_TYPE_OPTIONS = [
  {
    value: "questionnaire_misunderstanding",
    label: "問卷理解問題 Questionnaire misunderstanding",
  },
  {
    value: "system_device_issue",
    label: "系統或設備問題 System or device issue",
  },
  {
    value: "visitor_reaction",
    label: "訪客反應或情緒 Visitor reaction or concern",
  },
  {
    value: "refusal_early_termination",
    label: "拒答或中途退出 Refusal or early termination",
  },
  {
    value: "field_environment_issue",
    label: "現場環境影響 Field environment issue",
  },
  {
    value: "other",
    label: "其他 Other",
  },
];

const FOOTFALL_OPTIONS = [
  {
    value: "almost_no_flow",
    label: "幾乎無人流，訪問困難 Almost no passenger flow",
  },
  {
    value: "light_flow",
    label: "零星人流，訪問需主動尋找受訪者 Light passenger flow",
  },
  {
    value: "normal_flow",
    label: "持續有人流，訪問較順暢 Normal passenger flow",
  },
  {
    value: "heavy_flow",
    label: "人流密集，需挑選合適受訪者 Heavy passenger flow",
  },
  {
    value: "peak_congested",
    label: "高峰時段，現場較擠迫 Peak period / Congested",
  },
];

export default function DailyEntryPage() {
  const router = useRouter();

  const [userId, setUserId] = useState<string>("");
  const [displayName, setDisplayName] = useState<string>("");
  const [employeeCode, setEmployeeCode] = useState<string>("");
  const [role, setRole] = useState<Role>("staff");

  const [regions, setRegions] = useState<RegionCategory[]>([]);
  const [selectedDate, setSelectedDate] = useState<string>(getLocalTodayString());

  const [quantities, setQuantities] = useState<Record<number, string>>({});
  const [savedQuantities, setSavedQuantities] = useState<Record<number, string>>(
    {}
  );
  const [monthlyRuleMap, setMonthlyRuleMap] = useState<Record<number, number>>({});
  const [monthRegionTotalsRaw, setMonthRegionTotalsRaw] = useState<
    Record<number, number>
  >({});

  const [workLog, setWorkLog] = useState<WorkLogForm>(getEmptyWorkLogForm());

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");

  const isPartTime = role === "part_time";

  const buildEmptyQuantities = (regionList: RegionCategory[]) => {
    const initial: Record<number, string> = {};
    regionList.forEach((region) => {
      initial[region.id] = "";
    });
    return initial;
  };

  const buildEmptyNumberMap = (regionList: RegionCategory[]) => {
    const initial: Record<number, number> = {};
    regionList.forEach((region) => {
      initial[region.id] = 0;
    });
    return initial;
  };

  const totalQty = useMemo(() => {
    return regions.reduce((sum, region) => {
      const raw = quantities[region.id] ?? "";
      const value = raw === "" ? 0 : Number(raw);
      return sum + (Number.isNaN(value) ? 0 : value);
    }, 0);
  }, [regions, quantities]);

  const nonMainlandQty = useMemo(() => {
    return regions
      .filter((region) => region.is_non_mainland)
      .reduce((sum, region) => {
        const raw = quantities[region.id] ?? "";
        const value = raw === "" ? 0 : Number(raw);
        return sum + (Number.isNaN(value) ? 0 : value);
      }, 0);
  }, [regions, quantities]);

  const shiftParts = useMemo(() => {
    return getShiftParts(workLog.working_shift);
  }, [workLog.working_shift]);

  const regionQuotaStats = useMemo<Record<number, RegionQuotaStat>>(() => {
    const next: Record<number, RegionQuotaStat> = {};

    regions.forEach((region) => {
      const quota = Number(monthlyRuleMap[region.id] ?? 0);
      const rawMonthTotal = Number(monthRegionTotalsRaw[region.id] ?? 0);
      const savedTodayQty = Number(savedQuantities[region.id] ?? 0);
      const currentInputQty = Number(quantities[region.id] ?? 0);

      const baseWithoutTodaySaved = Math.max(rawMonthTotal - savedTodayQty, 0);
      const nextMonthTotal = baseWithoutTodaySaved + currentInputQty;
      const remainingBeforeToday =
        quota > 0 ? Math.max(quota - baseWithoutTodaySaved, 0) : 0;

      const isLocked =
        isPartTime && quota > 0 && remainingBeforeToday === 0 && savedTodayQty === 0;

      const isOverLimit = isPartTime && quota > 0 && nextMonthTotal > quota;

      next[region.id] = {
        region_id: region.id,
        quota,
        rawMonthTotal,
        savedTodayQty,
        currentInputQty,
        nextMonthTotal,
        remainingBeforeToday,
        isLocked,
        isOverLimit,
      };
    });

    return next;
  }, [
    regions,
    monthlyRuleMap,
    monthRegionTotalsRaw,
    savedQuantities,
    quantities,
    isPartTime,
  ]);

  const hasPartTimeOverLimit = useMemo(() => {
    if (!isPartTime) return false;
    return Object.values(regionQuotaStats).some((item) => item.isOverLimit);
  }, [isPartTime, regionQuotaStats]);

  const loadDailyEntries = async (
    currentUserId: string,
    currentDate: string,
    regionList: RegionCategory[]
  ) => {
    const { data, error } = await supabase
      .from("daily_entries")
      .select("region_id, quantity")
      .eq("user_id", currentUserId)
      .eq("entry_date", currentDate);

    if (error) {
      setMessage(error.message);
      return;
    }

    const nextQuantities = buildEmptyQuantities(regionList);

    ((data ?? []) as DailyEntryRow[]).forEach((row) => {
      nextQuantities[row.region_id] = String(row.quantity);
    });

    setQuantities(nextQuantities);
    setSavedQuantities(nextQuantities);
  };

  const loadMonthlyQuotaAndTotals = async (
    currentDate: string,
    regionList: RegionCategory[]
  ) => {
    const { monthStart } = getMonthBounds(currentDate);

    const [rulesResult, totalsResult] = await Promise.all([
      supabase
        .from("monthly_region_rules")
        .select("region_id, quota")
        .eq("rule_month", monthStart),

      supabase
        .from("monthly_region_totals_public")
        .select("region_id, total_quantity")
        .eq("month_start", monthStart),
    ]);

    if (rulesResult.error) {
      setMessage(rulesResult.error.message);
      return;
    }

    if (totalsResult.error) {
      setMessage(totalsResult.error.message);
      return;
    }

    const nextRuleMap = buildEmptyNumberMap(regionList);
    const nextMonthTotals = buildEmptyNumberMap(regionList);

    (rulesResult.data ?? []).forEach((row: any) => {
      nextRuleMap[row.region_id] = Number(row.quota ?? 0);
    });

    (totalsResult.data ?? []).forEach((row: any) => {
      nextMonthTotals[row.region_id] = Number(row.total_quantity ?? 0);
    });

    setMonthlyRuleMap(nextRuleMap);
    setMonthRegionTotalsRaw(nextMonthTotals);
  };

  const loadDailyWorkLog = async (
    currentUserId: string,
    currentDate: string,
    currentEmployeeCode: string
  ) => {
    const { data, error } = await supabase
      .from("daily_work_logs")
      .select(
        "work_date, interviewer_id, survey_location, working_shift, abnormal_case_count, abnormal_included_in_completed, issue_types, estimated_footfall, issues_and_suggestions"
      )
      .eq("user_id", currentUserId)
      .eq("work_date", currentDate)
      .maybeSingle();

    if (error) {
      setMessage(error.message);
      return;
    }

    const row = (data ?? null) as DailyWorkLogRow | null;

    if (!row) {
      setWorkLog({
        ...getEmptyWorkLogForm(),
        interviewer_id: currentEmployeeCode,
      });
      return;
    }

    setWorkLog({
      interviewer_id: currentEmployeeCode,
      survey_location: row.survey_location ?? "",
      working_shift: row.working_shift ?? "",
      abnormal_case_count:
        row.abnormal_case_count === null || row.abnormal_case_count === undefined
          ? ""
          : String(row.abnormal_case_count),
      abnormal_included_in_completed:
        row.abnormal_included_in_completed === true
          ? "yes"
          : row.abnormal_included_in_completed === false
          ? "no"
          : "",
      issue_types: row.issue_types ?? [],
      estimated_footfall: row.estimated_footfall ?? "",
      issues_and_suggestions: row.issues_and_suggestions ?? "",
    });
  };

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

      setUserId(user.id);

      const { data: profileData, error: profileError } = await supabase
        .from("profiles")
        .select("display_name, employee_code, role")
        .eq("id", user.id)
        .maybeSingle();

      if (profileError) {
        setMessage(profileError.message);
        setLoading(false);
        return;
      }

      const profile = (profileData ?? null) as ProfileRow | null;
      const resolvedDisplayName = profile?.display_name ?? user.email ?? "User";
      const resolvedEmployeeCode = profile?.employee_code ?? "";
      const resolvedRole = (profile?.role ?? "staff") as Role;

      setDisplayName(resolvedDisplayName);
      setEmployeeCode(resolvedEmployeeCode);
      setRole(resolvedRole);

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
      setQuantities(buildEmptyQuantities(regionList));
      setSavedQuantities(buildEmptyQuantities(regionList));

      await Promise.all([
        loadDailyEntries(user.id, selectedDate, regionList),
        loadMonthlyQuotaAndTotals(selectedDate, regionList),
        loadDailyWorkLog(user.id, selectedDate, resolvedEmployeeCode),
      ]);

      setLoading(false);
    };

    void init();
  }, [router]);

  useEffect(() => {
    if (!employeeCode) return;

    setWorkLog((prev) => ({
      ...prev,
      interviewer_id: employeeCode,
    }));
  }, [employeeCode]);

  useEffect(() => {
    const reloadByDate = async () => {
      if (!userId || regions.length === 0) return;

      await Promise.all([
        loadDailyEntries(userId, selectedDate, regions),
        loadMonthlyQuotaAndTotals(selectedDate, regions),
        loadDailyWorkLog(userId, selectedDate, employeeCode),
      ]);
    };

    void reloadByDate();
  }, [userId, selectedDate, regions, employeeCode]);

  const handleQuantityChange = (regionId: number, value: string) => {
    const stat = regionQuotaStats[regionId];

    if (value === "") {
      setQuantities((prev) => ({ ...prev, [regionId]: "" }));
      return;
    }

    if (isPartTime && stat?.isLocked) {
      return;
    }

    const numericValue = Number(value);

    if (Number.isNaN(numericValue) || numericValue < 0) {
      return;
    }

    setQuantities((prev) => ({ ...prev, [regionId]: value }));
  };

  const updateWorkLogField = <K extends keyof WorkLogForm>(
    field: K,
    value: WorkLogForm[K]
  ) => {
    setWorkLog((prev) => ({
      ...prev,
      [field]: value,
    }));
  };

  const updateWorkingShiftPart = (part: "start" | "end", value: string) => {
    const current = getShiftParts(workLog.working_shift);

    const nextStart = part === "start" ? value : current.start;
    const nextEnd = part === "end" ? value : current.end;

    updateWorkLogField("working_shift", buildShiftValue(nextStart, nextEnd));
  };

  const toggleIssueType = (value: string) => {
    setWorkLog((prev) => {
      const exists = prev.issue_types.includes(value);
      return {
        ...prev,
        issue_types: exists
          ? prev.issue_types.filter((item) => item !== value)
          : [...prev.issue_types, value],
      };
    });
  };

  const handleSave = async () => {
    if (!userId) return;

    setSaving(true);
    setMessage("");

    const shift = getShiftParts(workLog.working_shift);

    if (shift.start && !isValidTimeText(shift.start)) {
      setMessage("開始時間格式錯誤，請使用 HH:mm，例如 09:00。");
      setSaving(false);
      return;
    }

    if (shift.end && !isValidTimeText(shift.end)) {
      setMessage("結束時間格式錯誤，請使用 HH:mm，例如 18:00。");
      setSaving(false);
      return;
    }

    if (!shift.start || !shift.end) {
      setMessage("請完整填寫開始時間及結束時間。");
      setSaving(false);
      return;
    }

    if (isPartTime && hasPartTimeOverLimit) {
      setMessage("有地區已超過當月份數上限，請先調整後再儲存。");
      setSaving(false);
      return;
    }

    const positivePayload = regions
      .map((region) => {
        const raw = quantities[region.id] ?? "";
        const qty = raw === "" ? 0 : Math.max(0, Number(raw) || 0);

        return {
          user_id: userId,
          entry_date: selectedDate,
          region_id: region.id,
          quantity: qty,
          note: null,
        };
      })
      .filter((row) => row.quantity > 0);

    const zeroRegionIds = regions
      .filter((region) => {
        const raw = quantities[region.id] ?? "";
        const qty = raw === "" ? 0 : Math.max(0, Number(raw) || 0);
        return qty === 0;
      })
      .map((region) => region.id);

    if (positivePayload.length > 0) {
      const { error: upsertError } = await supabase
        .from("daily_entries")
        .upsert(positivePayload, { onConflict: "user_id,entry_date,region_id" });

      if (upsertError) {
        setMessage(upsertError.message);
        setSaving(false);
        return;
      }
    }

    if (zeroRegionIds.length > 0) {
      const { error: deleteError } = await supabase
        .from("daily_entries")
        .delete()
        .eq("user_id", userId)
        .eq("entry_date", selectedDate)
        .in("region_id", zeroRegionIds);

      if (deleteError) {
        setMessage(deleteError.message);
        setSaving(false);
        return;
      }
    }

    const workLogPayload = {
      user_id: userId,
      work_date: selectedDate,
      interviewer_id: workLog.interviewer_id || null,
      survey_location: workLog.survey_location || null,
      working_shift: workLog.working_shift || null,
      abnormal_case_count:
        workLog.abnormal_case_count === ""
          ? 0
          : Math.max(0, Number(workLog.abnormal_case_count) || 0),
      abnormal_included_in_completed:
        workLog.abnormal_included_in_completed === "yes"
          ? true
          : workLog.abnormal_included_in_completed === "no"
          ? false
          : null,
      issue_types: workLog.issue_types,
      estimated_footfall: workLog.estimated_footfall || null,
      issues_and_suggestions: workLog.issues_and_suggestions || null,
    };

    const { error: workLogError } = await supabase
      .from("daily_work_logs")
      .upsert(workLogPayload, { onConflict: "user_id,work_date" });

    if (workLogError) {
      setMessage(workLogError.message);
      setSaving(false);
      return;
    }

    await Promise.all([
      loadDailyEntries(userId, selectedDate, regions),
      loadMonthlyQuotaAndTotals(selectedDate, regions),
      loadDailyWorkLog(userId, selectedDate, employeeCode),
    ]);

    setMessage("已成功儲存每日填報及現場工作記錄。");
    setSaving(false);
  };

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
        <div>
          <h1 className="text-2xl font-bold text-slate-900">每日填報</h1>
          <p className="mt-1 text-sm text-slate-600">使用者：{displayName}</p>
          <p className="mt-1 text-sm text-slate-500">請填寫指定日期各地區完成份數</p>
          <p className="mt-1 text-sm text-slate-500">
            角色：{role === "part_time" ? "兼職" : role === "admin" ? "管理員" : "全職"}
          </p>
        </div>

        <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <PageActionButtons />
        </div>

        <div className="rounded-2xl bg-white p-6 shadow-sm ring-1 ring-slate-200">
          <div className="grid gap-4 md:grid-cols-3">
            <div>
              <label className="mb-2 block text-sm font-medium text-slate-700">
                填報日期
              </label>
              <input
                type="date"
                value={selectedDate}
                onChange={(e) => setSelectedDate(e.target.value)}
                className="w-full rounded-xl border border-slate-300 px-4 py-3 outline-none focus:border-slate-500"
              />
            </div>

            <div className="rounded-xl bg-slate-50 p-4">
              <p className="text-sm text-slate-500">當日總份數</p>
              <p className="mt-2 text-2xl font-bold text-slate-900">{totalQty}</p>
            </div>

            <div className="rounded-xl bg-slate-50 p-4">
              <p className="text-sm text-slate-500">當日非內地份數</p>
              <p className="mt-2 text-2xl font-bold text-slate-900">
                {nonMainlandQty}
              </p>
            </div>
          </div>
        </div>

        <div className="rounded-2xl bg-white p-6 shadow-sm ring-1 ring-slate-200">
          <h2 className="text-lg font-semibold text-slate-900">
            現場工作記錄問卷（調查員填寫）
          </h2>
          <p className="mt-1 text-sm text-slate-600">
            請調查員通過此記錄，多謝合作！如有任何意見，請跟管理員反映。
          </p>
          <p className="mt-1 text-sm text-slate-500">
            Please complete this record accordingly. Thank you for your cooperation.
            If you have any comments or suggestions, please contact the administrator.
          </p>

          <div className="mt-6 grid gap-4 md:grid-cols-2">
            <div>
              <label className="mb-2 block text-sm font-medium text-slate-700">
                1. 訪問員編號 Interviewer ID
              </label>
              <input
                type="text"
                value={workLog.interviewer_id}
                readOnly
                className="w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-slate-600 outline-none"
              />
            </div>

            <div>
              <label className="mb-2 block text-sm font-medium text-slate-700">
                2. 日期 Date
              </label>
              <input
                type="date"
                value={selectedDate}
                readOnly
                className="w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-slate-500 outline-none"
              />
            </div>

            <div>
              <label className="mb-2 block text-sm font-medium text-slate-700">
                3. 工作口岸 Survey Location
              </label>
              <select
                value={workLog.survey_location}
                onChange={(e) => updateWorkLogField("survey_location", e.target.value)}
                className="w-full rounded-xl border border-slate-300 px-4 py-3 outline-none focus:border-slate-500"
              >
                <option value="">請選擇工作口岸</option>
                {SURVEY_LOCATION_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="mb-2 block text-sm font-medium text-slate-700">
                4. 工作時段 Working Shift
              </label>

              <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-3">
                <input
                  type="text"
                  value={shiftParts.start}
                  onChange={(e) => updateWorkingShiftPart("start", e.target.value)}
                  placeholder="開始時間，例如 09:00"
                  className="w-full rounded-xl border border-slate-300 px-4 py-3 outline-none focus:border-slate-500"
                />

                <span className="text-sm text-slate-500">至</span>

                <input
                  type="text"
                  value={shiftParts.end}
                  onChange={(e) => updateWorkingShiftPart("end", e.target.value)}
                  placeholder="結束時間，例如 18:00"
                  className="w-full rounded-xl border border-slate-300 px-4 py-3 outline-none focus:border-slate-500"
                />
              </div>

              <p className="mt-2 text-xs text-slate-500">
                請輸入格式：HH:mm，例如 09:00、18:00
              </p>

              <p className="mt-1 text-xs text-slate-500">
                已選時段：
                {shiftParts.start || shiftParts.end
                  ? `${shiftParts.start || "未填"} 至 ${shiftParts.end || "未填"}`
                  : "未選擇"}
              </p>
            </div>

            <div>
              <label className="mb-2 block text-sm font-medium text-slate-700">
                5. 異常樣本數量 Number of abnormal cases
              </label>
              <input
                type="number"
                min="0"
                step="1"
                value={workLog.abnormal_case_count}
                onChange={(e) =>
                  updateWorkLogField("abnormal_case_count", e.target.value)
                }
                className="w-full rounded-xl border border-slate-300 px-4 py-3 outline-none focus:border-slate-500"
              />
            </div>

            <div>
              <label className="mb-2 block text-sm font-medium text-slate-700">
                6. 異常樣本是否包括在完成份數內？
              </label>
              <select
                value={workLog.abnormal_included_in_completed}
                onChange={(e) =>
                  updateWorkLogField(
                    "abnormal_included_in_completed",
                    e.target.value as "" | "yes" | "no"
                  )
                }
                className="w-full rounded-xl border border-slate-300 px-4 py-3 outline-none focus:border-slate-500"
              >
                <option value="">請選擇</option>
                <option value="yes">是 Yes</option>
                <option value="no">否 No</option>
              </select>
            </div>
          </div>

          <div className="mt-6">
            <label className="mb-3 block text-sm font-medium text-slate-700">
              7. 異常類型 Type of issue
            </label>
            <div className="grid gap-3 md:grid-cols-2">
              {ISSUE_TYPE_OPTIONS.map((option) => (
                <label
                  key={option.value}
                  className="flex items-start gap-3 rounded-xl border border-slate-200 px-4 py-3"
                >
                  <input
                    type="checkbox"
                    checked={workLog.issue_types.includes(option.value)}
                    onChange={() => toggleIssueType(option.value)}
                    className="mt-1"
                  />
                  <span className="text-sm text-slate-700">{option.label}</span>
                </label>
              ))}
            </div>
          </div>

          <div className="mt-6 grid gap-4 md:grid-cols-1">
            <div>
              <label className="mb-2 block text-sm font-medium text-slate-700">
                8. 今日口岸預估人流量 Estimated footfall at the location today
              </label>
              <select
                value={workLog.estimated_footfall}
                onChange={(e) =>
                  updateWorkLogField("estimated_footfall", e.target.value)
                }
                className="w-full rounded-xl border border-slate-300 px-4 py-3 outline-none focus:border-slate-500"
              >
                <option value="">請選擇預估人流量</option>
                {FOOTFALL_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="mb-2 block text-sm font-medium text-slate-700">
                9. 問卷期間發現的問題及建議
              </label>
              <textarea
                rows={5}
                placeholder="請填寫今日現場發現的問題及建議"
                value={workLog.issues_and_suggestions}
                onChange={(e) =>
                  updateWorkLogField("issues_and_suggestions", e.target.value)
                }
                className="w-full rounded-xl border border-slate-300 px-4 py-3 outline-none focus:border-slate-500"
              />
            </div>
          </div>
        </div>

        <div className="rounded-2xl bg-white p-6 shadow-sm ring-1 ring-slate-200">
          <h2 className="text-lg font-semibold text-slate-900">地區類別填報</h2>

          {isPartTime ? (
            <div className="mt-3 rounded-xl bg-amber-50 px-4 py-3 text-sm text-amber-700 ring-1 ring-amber-200">
              兼職會按每個地區分開計算當月上限；若某地區已達上限，該地區不能再填寫。
            </div>
          ) : null}

          <div className="mt-4 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {regions.map((region) => {
              const stat = regionQuotaStats[region.id];

              return (
                <div
                  key={region.id}
                  className="rounded-2xl border border-slate-200 p-4"
                >
                  <div>
                    <p className="text-sm text-slate-500">序號 {region.sort_order}</p>
                    <h3 className="mt-1 font-semibold text-slate-900">
                      {region.region_name_zh}
                    </h3>
                    <p className="mt-1 text-xs text-slate-500">
                      {region.is_non_mainland ? "非內地類別" : "內地類別"}
                    </p>
                  </div>

                  {isPartTime ? (
                    <div className="mt-4 space-y-1 rounded-xl bg-slate-50 px-3 py-3 text-xs text-slate-600">
                      <p>
                        本月累計（含目前輸入）：{" "}
                        <span className="font-semibold text-slate-900">
                          {stat?.nextMonthTotal ?? 0}
                        </span>
                      </p>
                      <p>
                        建議配額：{" "}
                        <span className="font-semibold text-slate-900">
                          {stat?.quota ?? 0}
                        </span>
                      </p>
                      <p>
                        尚餘可填：{" "}
                        <span className="font-semibold text-slate-900">
                          {stat?.quota > 0
                            ? Math.max((stat?.quota ?? 0) - (stat?.nextMonthTotal ?? 0), 0)
                            : 0}
                        </span>
                      </p>
                    </div>
                  ) : null}

                  <div className="mt-4">
                    <label className="mb-2 block text-sm font-medium text-slate-700">
                      今日完成份數
                    </label>
                    <input
                      type="number"
                      min="0"
                      step="1"
                      placeholder="請輸入份數"
                      value={quantities[region.id] ?? ""}
                      onChange={(e) => handleQuantityChange(region.id, e.target.value)}
                      disabled={Boolean(isPartTime && stat?.isLocked)}
                      className={`w-full rounded-xl border px-4 py-3 outline-none ${
                        isPartTime && stat?.isLocked
                          ? "border-red-200 bg-red-50 text-red-500"
                          : "border-slate-300 focus:border-slate-500"
                      }`}
                    />

                    {isPartTime && stat?.isLocked ? (
                      <p className="mt-2 text-xs font-medium text-red-600">
                        已達份數上限，不能再填寫。
                      </p>
                    ) : null}

                    {isPartTime && stat?.isOverLimit ? (
                      <p className="mt-2 text-xs font-medium text-red-600">
                        已超過此地區當月份數上限，請調整。
                      </p>
                    ) : null}
                  </div>
                </div>
              );
            })}
          </div>

          {message ? (
            <div className="mt-4 rounded-xl bg-slate-50 px-4 py-3 text-sm text-slate-700">
              {message}
            </div>
          ) : null}

          <div className="mt-6">
            <button
              onClick={handleSave}
              disabled={saving || hasPartTimeOverLimit}
              className="rounded-xl bg-slate-900 px-6 py-3 font-medium text-white hover:bg-slate-800 disabled:opacity-50"
            >
              {saving ? "儲存中..." : "儲存今日填報"}
            </button>
          </div>
        </div>
      </div>
    </main>
  );
}