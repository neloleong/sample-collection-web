"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";
import PageActionButtons from "@/app/components/PageActionButtons";

type Role = "admin" | "staff";

type UserManagementRow = {
  id: string;
  email: string | null;
  auth_created_at: string | null;
  display_name: string | null;
  employee_code: string | null;
  role: Role | null;
  profile_created_at: string | null;
};

type CreateUserForm = {
  email: string;
  password: string;
  display_name: string;
  employee_code: string;
  role: Role;
};

function normalizeRole(role: unknown): Role {
  const r = String(role ?? "").toLowerCase().trim();
  return r === "admin" ? "admin" : "staff";
}

function formatEmployeeCode(role: Role, n: number) {
  if (role === "admin") {
    return `A${String(n).padStart(3, "0")}`;
  }
  return `EMIT-QR${String(n).padStart(2, "0")}`;
}

function parseEmployeeNumber(code: string, role: Role): number | null {
  if (role === "admin") {
    const match = code.match(/^A(\d+)$/i);
    return match ? Number(match[1]) : null;
  }

  const match = code.match(/^EMIT-QR(\d+)$/i);
  return match ? Number(match[1]) : null;
}

function getNextEmployeeCodeFromRows(
  rows: UserManagementRow[],
  role: Role
): string {
  const maxNo = rows.reduce((max, row) => {
    const code = String(row.employee_code ?? "").trim();
    const n = parseEmployeeNumber(code, role);
    return n && n > max ? n : max;
  }, 0);

  return formatEmployeeCode(role, maxNo + 1);
}

export default function AdminUsersPage() {
  const router = useRouter();

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [rows, setRows] = useState<UserManagementRow[]>([]);
  const [keyword, setKeyword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [employeeCodeTouched, setEmployeeCodeTouched] = useState(false);

  const [form, setForm] = useState<CreateUserForm>({
    email: "",
    password: "",
    display_name: "",
    employee_code: "",
    role: "staff",
  });

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

      const { data: myProfile, error: profileError } = await supabase
        .from("profiles")
        .select("role")
        .eq("id", user.id)
        .single();

      if (profileError) {
        setError(profileError.message);
        return;
      }

      if (normalizeRole(myProfile?.role) !== "admin") {
        router.replace("/dashboard");
        return;
      }

      await loadUsers();
    } catch (e) {
      setError(e instanceof Error ? e.message : "讀取員工資料失敗");
    } finally {
      setLoading(false);
    }
  }

  async function loadUsers() {
    const { data, error: listError } = await supabase
      .from("user_management_view")
      .select("*")
      .order("auth_created_at", { ascending: false });

    if (listError) {
      throw new Error(listError.message);
    }

    const nextRows = (data ?? []) as UserManagementRow[];
    setRows(nextRows);

    setForm((prev) => ({
      ...prev,
      employee_code: getNextEmployeeCodeFromRows(nextRows, prev.role),
    }));
    setEmployeeCodeTouched(false);
  }

  useEffect(() => {
    if (rows.length === 0) return;
    if (employeeCodeTouched) return;

    setForm((prev) => ({
      ...prev,
      employee_code: getNextEmployeeCodeFromRows(rows, prev.role),
    }));
  }, [rows, form.role, employeeCodeTouched]);

  async function handleCreateUser(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError("");
    setSuccess("");

    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();

      if (!session?.access_token) {
        setError("目前登入狀態無效，請重新登入。");
        return;
      }

      const res = await fetch("/api/admin/create-user", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify(form),
      });

      const json = await res.json();

      if (!res.ok) {
        setError(json.error ?? "建立帳號失敗。");
        return;
      }

      setSuccess(`帳號建立成功：${json.user?.email ?? ""}`);

      await loadUsers();

      setForm((prev) => ({
        email: "",
        password: "",
        display_name: "",
        employee_code: getNextEmployeeCodeFromRows(
          [
            ...rows,
            {
              id: json.user?.id ?? crypto.randomUUID(),
              email: json.user?.email ?? "",
              auth_created_at: new Date().toISOString(),
              display_name: form.display_name,
              employee_code: json.user?.employee_code ?? form.employee_code,
              role: form.role,
              profile_created_at: new Date().toISOString(),
            },
          ],
          prev.role
        ),
        role: prev.role,
      }));
      setEmployeeCodeTouched(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : "建立帳號失敗");
    } finally {
      setSubmitting(false);
    }
  }

  const filteredRows = useMemo(() => {
    const q = keyword.trim().toLowerCase();

    if (!q) return rows;

    return rows.filter((row) => {
      return (
        (row.email || "").toLowerCase().includes(q) ||
        (row.display_name || "").toLowerCase().includes(q) ||
        (row.employee_code || "").toLowerCase().includes(q) ||
        (row.role || "").toLowerCase().includes(q)
      );
    });
  }, [rows, keyword]);

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
              在同一頁管理 Auth Users 與 Profiles 的融合資料。
            </p>
          </div>

          <PageActionButtons />
        </div>

        <div className="rounded-2xl bg-white p-6 shadow-sm ring-1 ring-slate-200">
          <h2 className="text-lg font-semibold text-slate-900">新增帳號</h2>
          <p className="mt-1 text-sm text-slate-500">
            staff 預設為 EMIT-QR 編號，admin 預設為 A 編號，亦可手動修改。
          </p>

          <form
            onSubmit={handleCreateUser}
            autoComplete="off"
            className="mt-4 grid gap-4 md:grid-cols-2"
          >
            <div>
              <label className="mb-2 block text-sm font-medium text-slate-700">
                Email
              </label>
              <input
                type="email"
                name="create_user_email"
                autoComplete="off"
                value={form.email}
                onChange={(e) =>
                  setForm((prev) => ({ ...prev, email: e.target.value }))
                }
                className="w-full rounded-xl border border-slate-300 px-4 py-2 text-sm outline-none focus:border-slate-500"
                placeholder="例如：staff01@company.com"
                required
              />
            </div>

            <div>
              <label className="mb-2 block text-sm font-medium text-slate-700">
                密碼
              </label>
              <input
                type="password"
                name="new_user_password"
                autoComplete="new-password"
                value={form.password}
                onChange={(e) =>
                  setForm((prev) => ({ ...prev, password: e.target.value }))
                }
                className="w-full rounded-xl border border-slate-300 px-4 py-2 text-sm outline-none focus:border-slate-500"
                placeholder="至少 6 個字元"
                required
              />
            </div>

            <div>
              <label className="mb-2 block text-sm font-medium text-slate-700">
                顯示名稱
              </label>
              <input
                type="text"
                name="display_name_custom"
                autoComplete="off"
                value={form.display_name}
                onChange={(e) =>
                  setForm((prev) => ({ ...prev, display_name: e.target.value }))
                }
                className="w-full rounded-xl border border-slate-300 px-4 py-2 text-sm outline-none focus:border-slate-500"
                placeholder="例如：Chan Tai Man"
                required
              />
            </div>

            <div>
              <label className="mb-2 block text-sm font-medium text-slate-700">
                員工編號
              </label>
              <input
                type="text"
                name="employee_code_custom"
                autoComplete="off"
                value={form.employee_code}
                onChange={(e) => {
                  setEmployeeCodeTouched(true);
                  setForm((prev) => ({
                    ...prev,
                    employee_code: e.target.value,
                  }));
                }}
                className="w-full rounded-xl border border-slate-300 px-4 py-2 text-sm outline-none focus:border-slate-500"
                placeholder="例如：EMIT-QR04 或 A002"
                required
              />
            </div>

            <div>
              <label className="mb-2 block text-sm font-medium text-slate-700">
                角色
              </label>
              <select
                value={form.role}
                onChange={(e) => {
                  const nextRole = normalizeRole(e.target.value);
                  setForm((prev) => ({
                    ...prev,
                    role: nextRole,
                    employee_code: getNextEmployeeCodeFromRows(rows, nextRole),
                  }));
                  setEmployeeCodeTouched(false);
                }}
                className="w-full rounded-xl border border-slate-300 px-4 py-2 text-sm outline-none focus:border-slate-500"
              >
                <option value="staff">staff</option>
                <option value="admin">admin</option>
              </select>
            </div>

            <div className="flex items-end">
              <button
                type="submit"
                disabled={submitting}
                className="rounded-xl bg-slate-900 px-4 py-2 text-sm text-white hover:bg-slate-800 disabled:opacity-50"
              >
                {submitting ? "建立中..." : "新增帳號"}
              </button>
            </div>
          </form>

          {success ? (
            <div className="mt-4 rounded-xl bg-green-50 px-4 py-3 text-sm text-green-700">
              {success}
            </div>
          ) : null}

          {error ? (
            <div className="mt-4 rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700">
              {error}
            </div>
          ) : null}
        </div>

        <div className="rounded-2xl bg-white p-6 shadow-sm ring-1 ring-slate-200">
          <label className="mb-2 block text-sm font-medium text-slate-700">
            搜尋
          </label>
          <input
            placeholder="搜尋 Email / 姓名 / 員工編號 / 角色"
            value={keyword}
            onChange={(e) => setKeyword(e.target.value)}
            className="w-full rounded-xl border border-slate-300 px-4 py-2 text-sm outline-none focus:border-slate-500"
          />
        </div>

        <div className="rounded-2xl bg-white p-6 shadow-sm ring-1 ring-slate-200">
          <div className="overflow-x-auto">
            <table className="min-w-full border-collapse">
              <thead>
                <tr className="border-b border-slate-200 text-left text-sm font-semibold text-slate-600">
                  <th className="px-3 py-3">Email</th>
                  <th className="px-3 py-3">Display Name</th>
                  <th className="px-3 py-3">Employee Code</th>
                  <th className="px-3 py-3">Role</th>
                  <th className="px-3 py-3">Created At</th>
                  <th className="px-3 py-3">Action</th>
                </tr>
              </thead>

              <tbody>
                {filteredRows.length === 0 ? (
                  <tr>
                    <td className="px-3 py-6 text-sm text-slate-500" colSpan={6}>
                      沒有符合條件的員工
                    </td>
                  </tr>
                ) : (
                  filteredRows.map((row) => (
                    <tr key={row.id} className="border-b border-slate-100 text-sm">
                      <td className="px-3 py-3">{row.email || "-"}</td>
                      <td className="px-3 py-3">{row.display_name || "-"}</td>
                      <td className="px-3 py-3">{row.employee_code || "-"}</td>
                      <td className="px-3 py-3">
                        <span
                          className={`inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ${
                            normalizeRole(row.role) === "admin"
                              ? "bg-red-100 text-red-700"
                              : "bg-blue-100 text-blue-700"
                          }`}
                        >
                          {normalizeRole(row.role).toUpperCase()}
                        </span>
                      </td>
                      <td className="px-3 py-3">
                        {row.auth_created_at
                          ? new Date(row.auth_created_at).toLocaleString()
                          : "-"}
                      </td>
                      <td className="px-3 py-3 text-slate-400">目前登入帳戶</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </main>
  );
}