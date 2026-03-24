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
};

type RegionCategory = {
  id: number;
  region_name_zh: string;
  sort_order: number;
  is_non_mainland: boolean;
};

type DailyEntry = {
  id: number;
  user_id: string;
  entry_date: string;
  region_id: number;
  quantity: number;
  created_at: string;
};

type ReportRow = DailyEntry & {
  profile: Profile | null;
  region: RegionCategory | null;
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

function formatDateTime(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString("zh-HK");
}

export default function AdminReportsPage() {
  const router = useRouter();

  const currentYear = getCurrentYear();
  const { month: currentMonth } = getCurrentYearMonth();

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [displayName, setDisplayName] = useState("");

  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [regions, setRegions] = useState<RegionCategory[]>([]);
  const [entries, setEntries] = useState<DailyEntry[]>([]);

  const [selectedUserId, setSelectedUserId] = useState("all");
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

      const { data: profilesData, error: profilesError } = await supabase
        .from("profiles")
        .select("id, display_name, employee_code, role")
        .order("created_at", { ascending: false });

      if (profilesError) {
        setError(profilesError.message);
        return;
      }

      const { data: regionData, error: regionError } = await supabase
        .from("region_categories")
        .select("id, region_name_zh, sort_order, is_non_mainland")
        .order("sort_order", { ascending: true });

      if (regionError) {
        setError(regionError.message);
        return;
      }

      const { data: entryData, error: entryError } = await supabase
        .from("daily_entries")
        .select("id, user_id, entry_date, region_id, quantity, created_at")
        .gte("entry_date", monthStart)
        .lt("entry_date", nextMonthStart)
        .order("created_at", { ascending: false });

      if (entryError) {
        setError(entryError.message);
        return;
      }

      setProfiles(
        (profilesData ?? []).map((p: any) => ({
          id: p.id,
          display_name: p.display_name,
          employee_code: p.employee_code,
          role: normalizeRole(p.role),
        }))
      );

      setRegions((regionData ?? []) as RegionCategory[]);

      setEntries(
        (entryData ?? []).map((row: any) => ({
          id: row.id,
          user_id: row.user_id,
          entry_date: row.entry_date,
          region_id: row.region_id,
          quantity: Number(row.quantity ?? 0),
          created_at: row.created_at,
        }))
      );

      setSelectedUserId("all");
    } catch (e) {
      setError(e instanceof Error ? e.message : "讀取全部員工填報失敗");
    } finally {
      setLoading(false);
    }
  }

  const profileMap = useMemo(() => {
    const map = new Map<string, Profile>();
    profiles.forEach((p) => map.set(p.id, p));
    return map;
  }, [profiles]);

  const regionMap = useMemo(() => {
    const map = new Map<number, RegionCategory>();
    regions.forEach((r) => map.set(r.id, r));
    return map;
  }, [regions]);

  const mergedRows = useMemo<ReportRow[]>(() => {
    return entries.map((entry) => ({
      ...entry,
      profile: profileMap.get(entry.user_id) ?? null,
      region: regionMap.get(entry.region_id) ?? null,
    }));
  }, [entries, profileMap, regionMap]);

  const filteredRows = useMemo(() => {
    const q = keyword.trim().toLowerCase();

    return mergedRows.filter((row) => {
      const matchUser =
        selectedUserId === "all" ? true : row.user_id === selectedUserId;

      if (!matchUser) return false;
      if (!q) return true;

      return (
        (row.profile?.display_name || "").toLowerCase().includes(q) ||
        (row.profile?.employee_code || "").toLowerCase().includes(q) ||
        (row.profile?.role || "").toLowerCase().includes(q) ||
        (row.entry_date || "").toLowerCase().includes(q) ||
        (row.region?.region_name_zh || "").toLowerCase().includes(q) ||
        String(row.quantity).includes(q)
      );
    });
  }, [mergedRows, selectedUserId, keyword]);

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
              可一次查看全部員工每日填報，並按月份、員工或關鍵字篩選。
            </p>
            <div className="mt-3 flex flex-wrap gap-3 text-sm">
              <span className="inline-flex rounded-full bg-blue-100 px-3 py-1 text-blue-700">
                管理員：{displayName}
              </span>
              <span className="inline-flex rounded-full bg-slate-100 px-3 py-1 text-slate-700">
                目前月份：{selectedYear}年 {selectedMonth}月
              </span>
              <span className="inline-flex rounded-full bg-slate-100 px-3 py-1 text-slate-700">
                目前顯示：{filteredRows.length} 筆
              </span>
            </div>
          </div>

          <PageActionButtons />
        </div>

        <div className="rounded-2xl bg-white p-6 shadow-sm ring-1 ring-slate-200">
          <div className="grid gap-4 md:grid-cols-4">
            <div>
              <label className="mb-2 block text-sm font-medium text-slate-700">
                年份
              </label>
              <select
                value={selectedYear}
                onChange={(e) => setSelectedYear(Number(e.target.value))}
                className="w-full rounded-xl border border-slate-300 px-4 py-2 text-sm outline-none focus:border-slate-500"
              >
                {years.map((year) => (
                  <option key={year} value={year}>
                    {year}年
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="mb-2 block text-sm font-medium text-slate-700">
                月份
              </label>
              <select
                value={selectedMonth}
                onChange={(e) => setSelectedMonth(Number(e.target.value))}
                className="w-full rounded-xl border border-slate-300 px-4 py-2 text-sm outline-none focus:border-slate-500"
              >
                {months.map((month) => (
                  <option key={month} value={month}>
                    {monthLabel(month)}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="mb-2 block text-sm font-medium text-slate-700">
                篩選員工
              </label>
              <select
                value={selectedUserId}
                onChange={(e) => setSelectedUserId(e.target.value)}
                className="w-full rounded-xl border border-slate-300 px-4 py-2 text-sm outline-none focus:border-slate-500"
              >
                <option value="all">全部員工</option>
                {profiles.map((profile) => (
                  <option key={profile.id} value={profile.id}>
                    {profile.display_name ?? "未命名用戶"}
                    {profile.employee_code ? `（${profile.employee_code}）` : ""}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="mb-2 block text-sm font-medium text-slate-700">
                搜尋
              </label>
              <input
                type="text"
                value={keyword}
                onChange={(e) => setKeyword(e.target.value)}
                placeholder="搜尋姓名 / 員工編號 / 日期 / 地區 / 份數"
                className="w-full rounded-xl border border-slate-300 px-4 py-2 text-sm outline-none focus:border-slate-500"
              />
            </div>
          </div>
        </div>

        <div className="rounded-2xl bg-white p-6 shadow-sm ring-1 ring-slate-200">
          <div className="overflow-x-auto">
            <table className="min-w-full border-collapse">
              <thead>
                <tr className="border-b border-slate-200 text-left text-sm font-semibold text-slate-600">
                  <th className="px-3 py-3">員工名稱</th>
                  <th className="px-3 py-3">員工編號</th>
                  <th className="px-3 py-3">角色</th>
                  <th className="px-3 py-3">填報日期</th>
                  <th className="px-3 py-3">地區</th>
                  <th className="px-3 py-3">份數</th>
                  <th className="px-3 py-3">建立時間</th>
                </tr>
              </thead>

              <tbody>
                {filteredRows.length === 0 ? (
                  <tr>
                    <td className="px-3 py-6 text-sm text-slate-500" colSpan={7}>
                      目前沒有符合條件的填報資料。
                    </td>
                  </tr>
                ) : (
                  filteredRows.map((row) => (
                    <tr key={row.id} className="border-b border-slate-100 text-sm">
                      <td className="px-3 py-3">{row.profile?.display_name ?? "-"}</td>
                      <td className="px-3 py-3">{row.profile?.employee_code ?? "-"}</td>
                      <td className="px-3 py-3">
                        <span
                          className={`inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ${
                            row.profile?.role === "admin"
                              ? "bg-red-100 text-red-700"
                              : "bg-blue-100 text-blue-700"
                          }`}
                        >
                          {row.profile?.role === "admin" ? "ADMIN" : "STAFF"}
                        </span>
                      </td>
                      <td className="px-3 py-3">{formatDate(row.entry_date)}</td>
                      <td className="px-3 py-3">{row.region?.region_name_zh ?? "-"}</td>
                      <td className="px-3 py-3 font-medium text-slate-900">
                        {row.quantity}
                      </td>
                      <td className="px-3 py-3">{formatDateTime(row.created_at)}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          <div className="mt-6 rounded-2xl bg-slate-50 p-4 text-sm text-slate-600">
            <p>說明：</p>
            <p className="mt-2">1. 此頁只供 admin 查看全部員工填報資料。</p>
            <p>2. 此頁顯示的是 daily_entries 的地區份數填報記錄，不是舊版 daily_reports 文字內容。</p>
            <p>3. 系統會按所選年份及月份顯示資料，與 Dashboard / 過往記錄的月份邏輯一致。</p>
            <p>4. 管理員進入此頁時，系統會預設顯示當月、全部員工的資料。</p>
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