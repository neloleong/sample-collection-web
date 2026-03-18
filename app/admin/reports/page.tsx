"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";
import PageActionButtons from "@/app/components/PageActionButtons";

type Profile = {
  id: string;
  display_name: string | null;
  employee_code: string | null;
  role: "admin" | "staff";
};

type DailyReport = {
  id: number;
  user_id: string;
  report_date: string | null;
  content: string | null;
  created_at: string;
};

type ReportRow = DailyReport & {
  profile: Profile | null;
};

function normalizeRole(role: unknown): "admin" | "staff" {
  const r = String(role ?? "").toLowerCase().trim();
  return r === "admin" ? "admin" : "staff";
}

function formatDate(value: string | null) {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString();
}

function formatDateTime(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString();
}

export default function AdminReportsPage() {
  const router = useRouter();

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [displayName, setDisplayName] = useState("");

  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [reports, setReports] = useState<DailyReport[]>([]);

  const [selectedUserId, setSelectedUserId] = useState("all");
  const [keyword, setKeyword] = useState("");

  useEffect(() => {
    void init();
  }, []);

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

      const { data: reportsData, error: reportsError } = await supabase
        .from("daily_reports")
        .select("id, user_id, report_date, content, created_at")
        .order("created_at", { ascending: false });

      if (reportsError) {
        setError(reportsError.message);
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

      setReports(
        (reportsData ?? []).map((r: any) => ({
          id: r.id,
          user_id: r.user_id,
          report_date: r.report_date,
          content: r.content,
          created_at: r.created_at,
        }))
      );
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

  const mergedRows = useMemo<ReportRow[]>(() => {
    return reports.map((report) => ({
      ...report,
      profile: profileMap.get(report.user_id) ?? null,
    }));
  }, [reports, profileMap]);

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
        (row.report_date || "").toLowerCase().includes(q) ||
        (row.content || "").toLowerCase().includes(q)
      );
    });
  }, [mergedRows, selectedUserId, keyword]);

  if (loading) {
    return <div className="p-6">Loading...</div>;
  }

  return (
    <main className="min-h-screen bg-slate-50 px-6 py-10">
      <div className="mx-auto max-w-7xl space-y-6">
        <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div>
            <h1 className="text-2xl font-bold text-slate-900">Admin / 全部員工填報</h1>
            <p className="mt-1 text-sm text-slate-600">
              可一次查看全部員工每日填報，並按員工或關鍵字篩選。
            </p>
            <div className="mt-3 flex flex-wrap gap-3 text-sm">
              <span className="inline-flex rounded-full bg-blue-100 px-3 py-1 text-blue-700">
                管理員：{displayName}
              </span>
              <span className="inline-flex rounded-full bg-slate-100 px-3 py-1 text-slate-700">
                目前顯示：{filteredRows.length} 筆
              </span>
            </div>
          </div>

          <PageActionButtons />
        </div>

        <div className="rounded-2xl bg-white p-6 shadow-sm ring-1 ring-slate-200">
          <div className="grid gap-4 md:grid-cols-2">
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
                placeholder="搜尋姓名 / 員工編號 / 日期 / 內容"
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
                  <th className="px-3 py-3">填報內容</th>
                  <th className="px-3 py-3">建立時間</th>
                </tr>
              </thead>

              <tbody>
                {filteredRows.length === 0 ? (
                  <tr>
                    <td className="px-3 py-6 text-sm text-slate-500" colSpan={6}>
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
                          {(row.profile?.role ?? "-").toUpperCase()}
                        </span>
                      </td>
                      <td className="px-3 py-3">{formatDate(row.report_date)}</td>
                      <td className="px-3 py-3 whitespace-pre-wrap break-words">
                        {row.content ?? "-"}
                      </td>
                      <td className="px-3 py-3">
                        {formatDateTime(row.created_at)}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          <div className="mt-6 rounded-2xl bg-slate-50 p-4 text-sm text-slate-600">
            <p>說明：</p>
            <p className="mt-2">1. 此頁只供 admin 查看全部員工填報資料。</p>
            <p>2. 可用上方員工篩選及關鍵字搜尋快速查閱記錄。</p>
            <p>3. 員工帳戶本身只應看到自己的 dashboard、每日填報及個人歷史記錄。</p>
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