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
  created_at?: string;
};

function normalizeRole(role: unknown): "admin" | "staff" {
  const r = String(role ?? "").toLowerCase().trim();
  return r === "admin" ? "admin" : "staff";
}

export default function AdminUsersPage() {
  const router = useRouter();

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [profiles, setProfiles] = useState<Profile[]>([]);
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
        .select("role")
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

      const { data, error: listError } = await supabase
        .from("profiles")
        .select("id, display_name, employee_code, role, created_at")
        .order("created_at", { ascending: false });

      if (listError) {
        setError(listError.message);
        return;
      }

      setProfiles(
        (data ?? []).map((p: any) => ({
          id: p.id,
          display_name: p.display_name,
          employee_code: p.employee_code,
          role: normalizeRole(p.role),
          created_at: p.created_at,
        }))
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : "讀取員工資料失敗");
    } finally {
      setLoading(false);
    }
  }

  const filteredProfiles = useMemo(() => {
    const q = keyword.trim().toLowerCase();

    if (!q) return profiles;

    return profiles.filter((p) => {
      return (
        (p.display_name || "").toLowerCase().includes(q) ||
        (p.employee_code || "").toLowerCase().includes(q) ||
        p.role.toLowerCase().includes(q)
      );
    });
  }, [profiles, keyword]);

  if (loading) {
    return <div className="p-6">Loading...</div>;
  }

  return (
    <main className="min-h-screen bg-slate-50 px-6 py-10">
      <div className="mx-auto max-w-7xl space-y-6">
        <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div>
            <h1 className="text-2xl font-bold text-slate-900">Admin / 員工總覽</h1>
            <p className="mt-1 text-sm text-slate-600">
              可查看全部員工，並支援搜尋員工資料與角色辨識。
            </p>
          </div>

          <PageActionButtons />
        </div>

        <div className="rounded-2xl bg-white p-6 shadow-sm ring-1 ring-slate-200">
          <div>
            <label className="mb-2 block text-sm font-medium text-slate-700">
              搜尋
            </label>
            <input
              placeholder="搜尋姓名 / 員工編號 / 角色"
              value={keyword}
              onChange={(e) => setKeyword(e.target.value)}
              className="w-full rounded-xl border border-slate-300 px-4 py-2 text-sm outline-none focus:border-slate-500"
            />
          </div>
        </div>

        <div className="rounded-2xl bg-white p-6 shadow-sm ring-1 ring-slate-200">
          <div className="overflow-x-auto">
            <table className="min-w-full border-collapse">
              <thead>
                <tr className="border-b border-slate-200 text-left text-sm font-semibold text-slate-600">
                  <th className="px-3 py-3">Display Name</th>
                  <th className="px-3 py-3">Employee Code</th>
                  <th className="px-3 py-3">Role</th>
                  <th className="px-3 py-3">Created At</th>
                  <th className="px-3 py-3">Action</th>
                </tr>
              </thead>

              <tbody>
                {filteredProfiles.length === 0 ? (
                  <tr>
                    <td className="px-3 py-6 text-sm text-slate-500" colSpan={5}>
                      沒有符合條件的員工
                    </td>
                  </tr>
                ) : (
                  filteredProfiles.map((p) => (
                    <tr key={p.id} className="border-b border-slate-100 text-sm">
                      <td className="px-3 py-3">{p.display_name || "-"}</td>

                      <td className="px-3 py-3">{p.employee_code || "-"}</td>

                      <td className="px-3 py-3">
                        <span
                          className={`inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ${
                            p.role === "admin"
                              ? "bg-red-100 text-red-700"
                              : "bg-blue-100 text-blue-700"
                          }`}
                        >
                          {p.role.toUpperCase()}
                        </span>
                      </td>

                      <td className="px-3 py-3">
                        {p.created_at ? new Date(p.created_at).toLocaleString() : "-"}
                      </td>

                      <td className="px-3 py-3 text-slate-400">目前登入帳戶</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
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