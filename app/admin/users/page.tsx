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
};

type CreateUserForm = {
  email: string;
  password: string;
  display_name: string;
  employee_code: string;
  role: Role;
};

function normalizeRole(role: unknown): Role {
  return String(role ?? "").toLowerCase().trim() === "admin" ? "admin" : "staff";
}

function formatEmployeeCode(role: Role, n: number): string {
  return role === "admin"
    ? `A${String(n).padStart(3, "0")}`
    : `EMIT-QR${String(n).padStart(2, "0")}`;
}

function parseEmployeeNumber(code: string, role: Role): number | null {
  if (role === "admin") {
    const match = code.match(/^A(\d+)$/i);
    return match ? Number(match[1]) : null;
  }

  const match = code.match(/^EMIT-QR(\d+)$/i);
  return match ? Number(match[1]) : null;
}

function getNextEmployeeCode(rows: UserManagementRow[], role: Role): string {
  const max = rows.reduce((m, r) => {
    const n = parseEmployeeNumber(String(r.employee_code ?? ""), role);
    return n && n > m ? n : m;
  }, 0);

  return formatEmployeeCode(role, max + 1);
}

function formatDateTime(value: string | null): string {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString();
}

export default function AdminUsersPage() {
  const router = useRouter();

  const [rows, setRows] = useState<UserManagementRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [keyword, setKeyword] = useState("");

  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const [submitting, setSubmitting] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [employeeCodeTouched, setEmployeeCodeTouched] = useState(false);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);

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
    setSuccess("");

    try {
      const {
        data: { user },
        error: authError,
      } = await supabase.auth.getUser();

      if (authError || !user) {
        router.replace("/login");
        return;
      }

      setCurrentUserId(user.id);

      const { data: profile, error: profileError } = await supabase
        .from("profiles")
        .select("role")
        .eq("id", user.id)
        .single();

      if (profileError) {
        setError(profileError.message);
        return;
      }

      if (normalizeRole(profile?.role) !== "admin") {
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
    const { data, error } = await supabase
      .from("user_management_view")
      .select("*")
      .order("auth_created_at", { ascending: false });

    if (error) {
      throw new Error(error.message);
    }

    const nextRows = (data ?? []) as UserManagementRow[];
    setRows(nextRows);

    setForm((prev) => ({
      ...prev,
      employee_code: getNextEmployeeCode(nextRows, prev.role),
    }));
    setEmployeeCodeTouched(false);
  }

  useEffect(() => {
    if (employeeCodeTouched) return;

    setForm((prev) => ({
      ...prev,
      employee_code: getNextEmployeeCode(rows, prev.role),
    }));
  }, [rows, form.role, employeeCodeTouched]);

  async function handleCreateUser(e: React.FormEvent<HTMLFormElement>) {
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

      const contentType = res.headers.get("content-type") || "";
      let payload: any = null;

      if (contentType.includes("application/json")) {
        payload = await res.json();
      } else {
        const text = await res.text();
        console.error("Create API returned non-JSON:", text);
        setError("建立帳號 API 沒有回傳 JSON，請檢查 create-user route");
        return;
      }

      if (!res.ok) {
        setError(payload?.error ?? "建立帳號失敗");
        return;
      }

      setSuccess(`帳號建立成功：${payload.user?.email ?? form.email}`);
      await loadUsers();

      setForm((prev) => ({
        email: "",
        password: "",
        display_name: "",
        employee_code: getNextEmployeeCode(rows, prev.role),
        role: prev.role,
      }));
      setEmployeeCodeTouched(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : "建立帳號失敗");
    } finally {
      setSubmitting(false);
    }
  }

  async function handleDeleteUser(userId: string) {
  if (userId === currentUserId) {
    setError("不能刪除目前登入中的管理員帳戶");
    return;
  }

  const confirmed = window.confirm("確定刪除這個帳號？此操作不可回復。");
  if (!confirmed) return;

  setDeletingId(userId);
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

    const res = await fetch(`/api/admin/users/${userId}`, {
      method: "DELETE",
      headers: {
        Authorization: `Bearer ${session.access_token}`,
      },
    });

    const contentType = res.headers.get("content-type") || "";
    let payload: any = null;

    if (contentType.includes("application/json")) {
      payload = await res.json();
    } else {
      const text = await res.text();
      console.error("Delete API returned non-JSON:", text);
      setError("刪除 API 沒有回傳 JSON，請檢查 route 或 middleware");
      return;
    }

    if (!res.ok) {
      setError(payload?.error ?? "刪除失敗");
      return;
    }

    setRows((prev) => prev.filter((row) => row.id !== userId));
    setSuccess("帳號已刪除");
  } catch (e) {
    setError(e instanceof Error ? e.message : "刪除失敗");
  } finally {
    setDeletingId(null);
  }
}

  const filteredRows = useMemo(() => {
    const q = keyword.trim().toLowerCase();

    if (!q) return rows;

    return rows.filter((row) => {
      return (
        (row.email ?? "").toLowerCase().includes(q) ||
        (row.display_name ?? "").toLowerCase().includes(q) ||
        (row.employee_code ?? "").toLowerCase().includes(q) ||
        (row.role ?? "").toLowerCase().includes(q)
      );
    });
  }, [rows, keyword]);

  if (loading) {
    return (
      <main className="min-h-screen bg-slate-100 px-6 py-10">
        <div className="mx-auto max-w-7xl rounded-3xl bg-white p-8 shadow-sm ring-1 ring-slate-200">
          <div className="text-sm text-slate-600">載入中...</div>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-slate-100 px-6 py-10">
      <div className="mx-auto max-w-7xl space-y-6">
        <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
          <div>
            <h1 className="text-4xl font-bold leading-tight text-slate-950">
              員工管理
            </h1>
            <p className="mt-2 text-sm text-slate-600">
              管理 Auth Users 與 Profiles 的融合資料，新增及刪除員工帳戶。
            </p>
            <p className="mt-1 text-sm text-slate-500">
              目前顯示：{filteredRows.length} 位員工
            </p>
          </div>

          <div className="flex flex-wrap gap-3">
            <PageActionButtons />
          </div>
        </div>

        <div className="rounded-3xl bg-white p-6 shadow-sm ring-1 ring-slate-200">
          <div className="mb-5 flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
            <div>
              <h2 className="text-xl font-semibold text-slate-900">新增帳號</h2>
              <p className="mt-1 text-sm text-slate-500">
                staff 預設為 EMIT-QR 編號，admin 預設為 A 編號，亦可手動修改。
              </p>
            </div>

            <button
              type="button"
              onClick={() => {
                setForm((prev) => ({
                  email: "",
                  password: "",
                  display_name: "",
                  employee_code: getNextEmployeeCode(rows, prev.role),
                  role: prev.role,
                }));
                setEmployeeCodeTouched(false);
                setError("");
                setSuccess("");
              }}
              className="inline-flex h-11 items-center justify-center rounded-2xl border border-slate-300 px-4 text-sm font-medium text-slate-700 transition hover:bg-slate-50"
            >
              清空表單
            </button>
          </div>

          <form
            onSubmit={handleCreateUser}
            autoComplete="off"
            className="grid gap-4 md:grid-cols-2 xl:grid-cols-3"
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
                className="h-12 w-full rounded-2xl border border-slate-300 bg-white px-4 text-sm text-slate-900 outline-none transition focus:border-slate-500 focus:ring-2 focus:ring-slate-200"
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
                className="h-12 w-full rounded-2xl border border-slate-300 bg-white px-4 text-sm text-slate-900 outline-none transition focus:border-slate-500 focus:ring-2 focus:ring-slate-200"
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
                className="h-12 w-full rounded-2xl border border-slate-300 bg-white px-4 text-sm text-slate-900 outline-none transition focus:border-slate-500 focus:ring-2 focus:ring-slate-200"
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
                className="h-12 w-full rounded-2xl border border-slate-300 bg-white px-4 text-sm text-slate-900 outline-none transition focus:border-slate-500 focus:ring-2 focus:ring-slate-200"
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
                    employee_code: getNextEmployeeCode(rows, nextRole),
                  }));
                  setEmployeeCodeTouched(false);
                }}
                className="h-12 w-full rounded-2xl border border-slate-300 bg-white px-4 text-sm text-slate-900 outline-none transition focus:border-slate-500 focus:ring-2 focus:ring-slate-200"
              >
                <option value="staff">staff</option>
                <option value="admin">admin</option>
              </select>
            </div>

            <div className="flex items-end">
              <button
                type="submit"
                disabled={submitting}
                className="inline-flex h-12 w-full items-center justify-center rounded-2xl bg-slate-900 px-5 text-sm font-semibold text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {submitting ? "建立中..." : "新增帳號"}
              </button>
            </div>
          </form>

          {success ? (
            <div className="mt-4 rounded-2xl bg-green-50 px-4 py-3 text-sm text-green-700 ring-1 ring-green-200">
              {success}
            </div>
          ) : null}

          {error ? (
            <div className="mt-4 rounded-2xl bg-red-50 px-4 py-3 text-sm text-red-700 ring-1 ring-red-200">
              {error}
            </div>
          ) : null}
        </div>

        <div className="rounded-3xl bg-white p-6 shadow-sm ring-1 ring-slate-200">
          <div className="grid gap-4 md:grid-cols-[1fr_auto] md:items-end">
            <div>
              <label className="mb-2 block text-sm font-medium text-slate-700">
                搜尋
              </label>
              <input
                placeholder="搜尋 Email / 姓名 / 員工編號 / 角色"
                value={keyword}
                onChange={(e) => setKeyword(e.target.value)}
                className="h-12 w-full rounded-2xl border border-slate-300 bg-white px-4 text-sm text-slate-900 outline-none transition focus:border-slate-500 focus:ring-2 focus:ring-slate-200"
              />
            </div>

            <button
              type="button"
              onClick={() => {
                setKeyword("");
                void loadUsers();
              }}
              className="inline-flex h-12 items-center justify-center rounded-2xl border border-slate-300 px-5 text-sm font-medium text-slate-700 transition hover:bg-slate-50"
            >
              重新整理
            </button>
          </div>
        </div>

        <div className="rounded-3xl bg-white p-6 shadow-sm ring-1 ring-slate-200">
          <div className="mb-4 flex items-center justify-between">
            <div>
              <h2 className="text-xl font-semibold text-slate-900">員工總覽</h2>
              <p className="mt-1 text-sm text-slate-500">
                可查看 Email、名稱、員工編號、角色及建立時間。
              </p>
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="min-w-full border-separate border-spacing-0">
              <thead>
                <tr className="text-left text-sm font-semibold text-slate-600">
                  <th className="border-b border-slate-200 px-4 py-3">Email</th>
                  <th className="border-b border-slate-200 px-4 py-3">名稱</th>
                  <th className="border-b border-slate-200 px-4 py-3">員工編號</th>
                  <th className="border-b border-slate-200 px-4 py-3">角色</th>
                  <th className="border-b border-slate-200 px-4 py-3">建立時間</th>
                  <th className="border-b border-slate-200 px-4 py-3">操作</th>
                </tr>
              </thead>

              <tbody>
                {filteredRows.length === 0 ? (
                  <tr>
                    <td className="px-4 py-8 text-sm text-slate-500" colSpan={6}>
                      沒有符合條件的員工
                    </td>
                  </tr>
                ) : (
                  filteredRows.map((row) => {
                    const isCurrentUser = row.id === currentUserId;
                    const role = normalizeRole(row.role);

                    return (
                      <tr key={row.id} className="text-sm text-slate-700">
                        <td className="border-b border-slate-100 px-4 py-4">
                          {row.email || "-"}
                        </td>
                        <td className="border-b border-slate-100 px-4 py-4">
                          {row.display_name || "-"}
                        </td>
                        <td className="border-b border-slate-100 px-4 py-4 font-medium text-slate-900">
                          {row.employee_code || "-"}
                        </td>
                        <td className="border-b border-slate-100 px-4 py-4">
                          <span
                            className={`inline-flex rounded-full px-3 py-1 text-xs font-semibold ${
                              role === "admin"
                                ? "bg-red-100 text-red-700"
                                : "bg-blue-100 text-blue-700"
                            }`}
                          >
                            {role.toUpperCase()}
                          </span>
                        </td>
                        <td className="border-b border-slate-100 px-4 py-4">
                          {formatDateTime(row.auth_created_at)}
                        </td>
                        <td className="border-b border-slate-100 px-4 py-4">
                          {isCurrentUser ? (
                            <span className="text-xs font-medium text-slate-400">
                              目前登入帳戶
                            </span>
                          ) : (
                            <button
                              type="button"
                              onClick={() => handleDeleteUser(row.id)}
                              disabled={deletingId === row.id}
                              className="inline-flex h-10 items-center justify-center rounded-xl border border-red-200 px-4 text-sm font-medium text-red-600 transition hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-50"
                            >
                              {deletingId === row.id ? "刪除中..." : "刪除"}
                            </button>
                          )}
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>

          <div className="mt-6 rounded-2xl bg-slate-50 p-4 text-sm text-slate-600">
            <p>說明：</p>
            <p className="mt-2">1. 此頁只供 admin 管理員使用。</p>
            <p>2. 新增帳號時可自動生成員工編號，亦可手動修改。</p>
            <p>3. 刪除帳號會連同對應登入帳戶一併移除。</p>
          </div>
        </div>
      </div>
    </main>
  );
}