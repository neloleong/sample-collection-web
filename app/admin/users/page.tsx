"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient, User } from "@supabase/supabase-js";

type Profile = {
  id: string;
  display_name: string | null;
  employee_code: string | null;
  role: "admin" | "staff";
  created_at: string;
};

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL as string,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY as string
);

export default function AdminUsersPage() {
  const router = useRouter();

  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [currentRole, setCurrentRole] = useState<"admin" | "staff" | null>(null);

  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [loading, setLoading] = useState(true);
  const [pageError, setPageError] = useState("");
  const [actionMessage, setActionMessage] = useState("");
  const [busyUserId, setBusyUserId] = useState<string | null>(null);
  const [keyword, setKeyword] = useState("");

  const filteredProfiles = useMemo(() => {
    const q = keyword.trim().toLowerCase();
    if (!q) return profiles;

    return profiles.filter((p) => {
      const name = (p.display_name ?? "").toLowerCase();
      const code = (p.employee_code ?? "").toLowerCase();
      const role = p.role.toLowerCase();
      return name.includes(q) || code.includes(q) || role.includes(q);
    });
  }, [profiles, keyword]);

  useEffect(() => {
    void initPage();
  }, []);

  async function initPage() {
    setLoading(true);
    setPageError("");
    setActionMessage("");

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

      if (myProfileError) {
        setPageError(`讀取目前帳戶角色失敗：${myProfileError.message}`);
        setLoading(false);
        return;
      }

      if (!myProfile) {
        setPageError("找不到目前登入帳戶的 profiles 資料。");
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

      await loadProfiles();
    } catch (error) {
      setPageError(
        error instanceof Error ? error.message : "初始化頁面失敗。"
      );
      setLoading(false);
    }
  }

  async function loadProfiles() {
    setLoading(true);

    const { data, error } = await supabase
      .from("profiles")
      .select("id, display_name, employee_code, role, created_at")
      .order("created_at", { ascending: false });

    if (error) {
      throw new Error(`讀取員工資料失敗：${error.message}`);
    }

    const profileList: Profile[] = (data ?? []).map((item: any) => ({
      id: item.id,
      display_name: item.display_name,
      employee_code: item.employee_code,
      role: item.role === "admin" ? "admin" : "staff",
      created_at: item.created_at,
    }));

    setProfiles(profileList);
    setLoading(false);
  }

  async function handleToggleRole(profile: Profile) {
    if (!currentUser) return;

    if (profile.id === currentUser.id) {
      setActionMessage("不能在這頁把自己角色直接切換，避免鎖死管理權限。");
      return;
    }

    setBusyUserId(profile.id);
    setActionMessage("");

    const nextRole: "admin" | "staff" =
      profile.role === "admin" ? "staff" : "admin";

    const { error } = await supabase
      .from("profiles")
      .update({ role: nextRole })
      .eq("id", profile.id);

    if (error) {
      setActionMessage(`更新角色失敗：${error.message}`);
      setBusyUserId(null);
      return;
    }

    setProfiles((prev) =>
      prev.map((item) =>
        item.id === profile.id ? { ...item, role: nextRole } : item
      )
    );

    setActionMessage(
      `${profile.display_name ?? "未命名用戶"} 已更新為 ${nextRole}`
    );
    setBusyUserId(null);
  }

  async function handleSignOut() {
    await supabase.auth.signOut();
    router.replace("/login");
  }

  function formatDate(value: string) {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return value;
    return date.toLocaleString();
  }

  if (loading) {
    return (
      <div style={styles.page}>
        <div style={styles.card}>
          <h1 style={styles.title}>Admin / 員工總覽</h1>
          <p>載入中...</p>
        </div>
      </div>
    );
  }

  if (pageError) {
    return (
      <div style={styles.page}>
        <div style={styles.card}>
          <h1 style={styles.title}>Admin / 員工總覽</h1>
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
            <h1 style={styles.title}>Admin / 員工總覽</h1>
            <p style={styles.subtext}>
              可查看全部員工，並直接切換 staff / admin。
            </p>
          </div>

          <div style={styles.row}>
            <button style={styles.button} onClick={() => void loadProfiles()}>
              重新整理
            </button>
            <button style={styles.buttonSecondary} onClick={handleSignOut}>
              登出
            </button>
          </div>
        </div>

        <div style={styles.searchWrap}>
          <input
            style={styles.input}
            placeholder="搜尋姓名 / 員工編號 / 角色"
            value={keyword}
            onChange={(e) => setKeyword(e.target.value)}
          />
        </div>

        {actionMessage ? <p style={styles.success}>{actionMessage}</p> : null}

        <div style={styles.tableWrap}>
          <table style={styles.table}>
            <thead>
              <tr>
                <th style={styles.th}>Display Name</th>
                <th style={styles.th}>Employee Code</th>
                <th style={styles.th}>Role</th>
                <th style={styles.th}>Created At</th>
                <th style={styles.th}>Action</th>
              </tr>
            </thead>
            <tbody>
              {filteredProfiles.length === 0 ? (
                <tr>
                  <td style={styles.td} colSpan={5}>
                    沒有找到任何員工資料。
                  </td>
                </tr>
              ) : (
                filteredProfiles.map((profile) => {
                  const isSelf = profile.id === currentUser?.id;
                  const isBusy = busyUserId === profile.id;

                  return (
                    <tr key={profile.id}>
                      <td style={styles.td}>{profile.display_name ?? "-"}</td>
                      <td style={styles.td}>{profile.employee_code ?? "-"}</td>
                      <td style={styles.td}>
                        <span
                          style={
                            profile.role === "admin"
                              ? styles.roleAdmin
                              : styles.roleStaff
                          }
                        >
                          {profile.role}
                        </span>
                      </td>
                      <td style={styles.td}>{formatDate(profile.created_at)}</td>
                      <td style={styles.td}>
                        {isSelf ? (
                          <span style={styles.selfText}>目前登入帳戶</span>
                        ) : (
                          <button
                            style={styles.button}
                            disabled={isBusy}
                            onClick={() => void handleToggleRole(profile)}
                          >
                            {isBusy
                              ? "更新中..."
                              : profile.role === "admin"
                              ? "改為 Staff"
                              : "改為 Admin"}
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
    maxWidth: "1200px",
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
  searchWrap: {
    marginBottom: "16px",
  },
  input: {
    width: "100%",
    maxWidth: "360px",
    padding: "12px 14px",
    borderRadius: "10px",
    border: "1px solid #d7dbe7",
    fontSize: "14px",
    outline: "none",
  },
  tableWrap: {
    overflowX: "auto",
  },
  table: {
    width: "100%",
    borderCollapse: "collapse",
    minWidth: "900px",
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
    verticalAlign: "middle",
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
  success: {
    color: "#065f46",
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
  selfText: {
    color: "#6b7280",
    fontSize: "13px",
  },
};