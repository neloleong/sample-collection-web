"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient, User } from "@supabase/supabase-js";

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

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL as string,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY as string
);

export default function AdminReportsPage() {
  const router = useRouter();

  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [currentRole, setCurrentRole] = useState<"admin" | "staff" | null>(null);

  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [reports, setReports] = useState<DailyReport[]>([]);

  const [selectedUserId, setSelectedUserId] = useState("all");
  const [keyword, setKeyword] = useState("");
  const [loading, setLoading] = useState(true);
  const [pageError, setPageError] = useState("");

  useEffect(() => {
    void initPage();
  }, []);

  async function initPage() {
    setLoading(true);
    setPageError("");

    try {
      const {
        data: { user },
        error: authError,
      } = await supabase.auth.getUser();

      if (authError || !user) {
        router.replace("/login");
        return;
      }

      setCurrentUser(user);

      const { data: myProfile, error: myProfileError } = await supabase
        .from("profiles")
        .select("role")
        .eq("id", user.id)
        .single();

      if (myProfileError || !myProfile) {
        setPageError(myProfileError?.message ?? "讀取目前帳戶角色失敗。");
        setLoading(false);
        return;
      }

      const myRole: "admin" | "staff" =
        myProfile.role === "admin" ? "admin" : "staff";

      setCurrentRole(myRole);

      if (myRole !== "admin") {
        router.replace("/dashboard");
        return;
      }

      await Promise.all([loadProfiles(), loadReports()]);
      setLoading(false);
    } catch (error) {
      setPageError(
        error instanceof Error ? error.message : "初始化頁面失敗。"
      );
      setLoading(false);
    }
  }

  async function loadProfiles() {
    const { data, error } = await supabase
      .from("profiles")
      .select("id, display_name, employee_code, role")
      .order("created_at", { ascending: false });

    if (error) {
      throw new Error(`讀取員工資料失敗：${error.message}`);
    }

    const profileList: Profile[] = (data ?? []).map((item: any) => ({
      id: item.id,
      display_name: item.display_name,
      employee_code: item.employee_code,
      role: item.role === "admin" ? "admin" : "staff",
    }));

    setProfiles(profileList);
  }

  async function loadReports() {
    const { data, error } = await supabase
      .from("daily_reports")
      .select("id, user_id, report_date, content, created_at")
      .order("created_at", { ascending: false });

    if (error) {
      throw new Error(`讀取填報資料失敗：${error.message}`);
    }

    const reportList: DailyReport[] = (data ?? []).map((item: any) => ({
      id: item.id,
      user_id: item.user_id,
      report_date: item.report_date,
      content: item.content,
      created_at: item.created_at,
    }));

    setReports(reportList);
  }

  async function handleRefresh() {
    setLoading(true);
    setPageError("");

    try {
      await Promise.all([loadProfiles(), loadReports()]);
      setLoading(false);
    } catch (error) {
      setPageError(
        error instanceof Error ? error.message : "重新整理失敗。"
      );
      setLoading(false);
    }
  }

  async function handleSignOut() {
    await supabase.auth.signOut();
    router.replace("/login");
  }

  const profileMap = useMemo(() => {
    const map = new Map<string, Profile>();
    profiles.forEach((profile) => {
      map.set(profile.id, profile);
    });
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

      const displayName = (row.profile?.display_name ?? "").toLowerCase();
      const employeeCode = (row.profile?.employee_code ?? "").toLowerCase();
      const content = (row.content ?? "").toLowerCase();
      const reportDate = (row.report_date ?? "").toLowerCase();
      const role = (row.profile?.role ?? "").toLowerCase();

      return (
        displayName.includes(q) ||
        employeeCode.includes(q) ||
        content.includes(q) ||
        reportDate.includes(q) ||
        role.includes(q)
      );
    });
  }, [mergedRows, selectedUserId, keyword]);

  function formatDateTime(value: string) {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return value;
    return date.toLocaleString();
  }

  function formatDate(value: string | null) {
    if (!value) return "-";
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return value;
    return date.toLocaleDateString();
  }

  if (loading) {
    return (
      <div style={styles.page}>
        <div style={styles.card}>
          <h1 style={styles.title}>Admin / 全部員工填報</h1>
          <p>載入中...</p>
        </div>
      </div>
    );
  }

  if (pageError) {
    return (
      <div style={styles.page}>
        <div style={styles.card}>
          <h1 style={styles.title}>Admin / 全部員工填報</h1>
          <p style={styles.error}>{pageError}</p>
          <div style={styles.row}>
            <button style={styles.button} onClick={() => void initPage()}>
              重新載入
            </button>
            <button style={styles.buttonSecondary} onClick={handleSignOut}>
              登出
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (currentRole !== "admin") {
    return null;
  }

  return (
    <div style={styles.page}>
      <div style={styles.card}>
        <div style={styles.header}>
          <div>
            <h1 style={styles.title}>Admin / 全部員工填報</h1>
            <p style={styles.subtext}>
              可一次查看全部員工每日填報，並按員工或關鍵字篩選。
            </p>
          </div>

          <div style={styles.row}>
            <button style={styles.button} onClick={() => void handleRefresh()}>
              重新整理
            </button>
            <button
              style={styles.buttonSecondary}
              onClick={() => router.push("/admin")}
            >
              返回 Admin
            </button>
            <button style={styles.buttonSecondary} onClick={handleSignOut}>
              登出
            </button>
          </div>
        </div>

        <div style={styles.filters}>
          <select
            style={styles.select}
            value={selectedUserId}
            onChange={(e) => setSelectedUserId(e.target.value)}
          >
            <option value="all">全部員工</option>
            {profiles.map((profile) => (
              <option key={profile.id} value={profile.id}>
                {profile.display_name ?? "未命名"}{" "}
                {profile.employee_code ? `(${profile.employee_code})` : ""}
              </option>
            ))}
          </select>

          <input
            style={styles.input}
            placeholder="搜尋姓名 / 員工編號 / 日期 / 內容"
            value={keyword}
            onChange={(e) => setKeyword(e.target.value)}
          />
        </div>

        <div style={styles.summaryWrap}>
          <span style={styles.summaryText}>目前登入：admin</span>
          <span style={styles.summaryText}>報告總數：{filteredRows.length}</span>
          <span style={styles.summaryText}>
            登入者：{currentUser?.email ?? "-"}
          </span>
        </div>

        <div style={styles.tableWrap}>
          <table style={styles.table}>
            <thead>
              <tr>
                <th style={styles.th}>員工名稱</th>
                <th style={styles.th}>員工編號</th>
                <th style={styles.th}>角色</th>
                <th style={styles.th}>填報日期</th>
                <th style={styles.th}>填報內容</th>
                <th style={styles.th}>建立時間</th>
              </tr>
            </thead>
            <tbody>
              {filteredRows.length === 0 ? (
                <tr>
                  <td style={styles.td} colSpan={6}>
                    目前沒有符合條件的填報資料。
                  </td>
                </tr>
              ) : (
                filteredRows.map((row) => (
                  <tr key={row.id}>
                    <td style={styles.td}>{row.profile?.display_name ?? "-"}</td>
                    <td style={styles.td}>{row.profile?.employee_code ?? "-"}</td>
                    <td style={styles.td}>
                      <span
                        style={
                          row.profile?.role === "admin"
                            ? styles.roleAdmin
                            : styles.roleStaff
                        }
                      >
                        {row.profile?.role ?? "-"}
                      </span>
                    </td>
                    <td style={styles.td}>{formatDate(row.report_date)}</td>
                    <td style={styles.tdContent}>{row.content ?? "-"}</td>
                    <td style={styles.td}>{formatDateTime(row.created_at)}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  page: {
    minHeight: "100vh",
    background: "#f6f7fb",
    padding: "24px",
  },
  card: {
    maxWidth: "1400px",
    margin: "0 auto",
    background: "#ffffff",
    borderRadius: "16px",
    padding: "24px",
    boxShadow: "0 10px 30px rgba(0,0,0,0.08)",
  },
  header: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "flex-start",
    gap: "16px",
    flexWrap: "wrap",
    marginBottom: "20px",
  },
  title: {
    margin: 0,
    fontSize: "28px",
    fontWeight: 700,
  },
  subtext: {
    marginTop: "8px",
    color: "#666",
  },
  row: {
    display: "flex",
    gap: "12px",
    flexWrap: "wrap",
  },
  filters: {
    display: "flex",
    gap: "12px",
    flexWrap: "wrap",
    marginBottom: "16px",
  },
  select: {
    minWidth: "260px",
    padding: "12px 14px",
    borderRadius: "10px",
    border: "1px solid #d7dbe7",
    fontSize: "14px",
    background: "#fff",
  },
  input: {
    flex: 1,
    minWidth: "260px",
    padding: "12px 14px",
    borderRadius: "10px",
    border: "1px solid #d7dbe7",
    fontSize: "14px",
    outline: "none",
  },
  summaryWrap: {
    display: "flex",
    gap: "12px",
    flexWrap: "wrap",
    marginBottom: "16px",
  },
  summaryText: {
    display: "inline-block",
    padding: "8px 12px",
    borderRadius: "999px",
    background: "#eef2ff",
    color: "#3730a3",
    fontSize: "13px",
    fontWeight: 600,
  },
  tableWrap: {
    overflowX: "auto",
  },
  table: {
    width: "100%",
    borderCollapse: "collapse",
    minWidth: "1200px",
  },
  th: {
    textAlign: "left",
    padding: "14px 12px",
    borderBottom: "1px solid #e5e7ef",
    background: "#fafbff",
    fontSize: "14px",
  },
  td: {
    padding: "14px 12px",
    borderBottom: "1px solid #eef1f6",
    fontSize: "14px",
    verticalAlign: "top",
  },
  tdContent: {
    padding: "14px 12px",
    borderBottom: "1px solid #eef1f6",
    fontSize: "14px",
    whiteSpace: "pre-wrap",
    wordBreak: "break-word",
    minWidth: "360px",
    verticalAlign: "top",
  },
  button: {
    padding: "10px 14px",
    borderRadius: "10px",
    border: "none",
    cursor: "pointer",
    background: "#111827",
    color: "#ffffff",
    fontWeight: 600,
  },
  buttonSecondary: {
    padding: "10px 14px",
    borderRadius: "10px",
    border: "1px solid #d1d5db",
    cursor: "pointer",
    background: "#ffffff",
    color: "#111827",
    fontWeight: 600,
  },
  error: {
    color: "#b91c1c",
    marginBottom: "16px",
  },
  roleAdmin: {
    display: "inline-block",
    padding: "4px 10px",
    borderRadius: "999px",
    background: "#fee2e2",
    color: "#991b1b",
    fontWeight: 700,
    fontSize: "12px",
    textTransform: "uppercase",
  },
  roleStaff: {
    display: "inline-block",
    padding: "4px 10px",
    borderRadius: "999px",
    background: "#dbeafe",
    color: "#1d4ed8",
    fontWeight: 700,
    fontSize: "12px",
    textTransform: "uppercase",
  },
};