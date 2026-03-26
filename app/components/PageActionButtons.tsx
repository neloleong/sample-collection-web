"use client";

import { useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { supabase } from "../../lib/supabase";

type Role = "admin" | "staff" | null;

type PageActionButtonsProps = {
  className?: string;
};

export default function PageActionButtons({
  className = "",
}: PageActionButtonsProps) {
  const router = useRouter();
  const pathname = usePathname();

  const [role, setRole] = useState<Role>(null);
  const [loading, setLoading] = useState(true);
  const [loggingOut, setLoggingOut] = useState(false);

  useEffect(() => {
    let mounted = true;

    async function loadRole() {
      setLoading(true);

      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!mounted) return;

      if (!user) {
        setRole(null);
        setLoading(false);
        return;
      }

      const { data } = await supabase
        .from("profiles")
        .select("role")
        .eq("id", user.id)
        .single();

      if (!mounted) return;

      const normalizedRole =
        String(data?.role ?? "").toLowerCase().trim() === "admin"
          ? "admin"
          : "staff";

      setRole(normalizedRole);
      setLoading(false);
    }

    loadRole();

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange(() => {
      loadRole();
    });

    return () => {
      mounted = false;
      subscription.unsubscribe();
    };
  }, []);

  async function handleLogout() {
    try {
      setLoggingOut(true);
      await supabase.auth.signOut();
      router.replace("/login");
      router.refresh();
    } finally {
      setLoggingOut(false);
    }
  }

  function buttonClass(active: boolean, primary = false) {
    return [
      "inline-flex min-h-[44px] w-full items-center justify-center rounded-2xl border px-4 py-2 text-sm font-medium transition",
      "sm:w-auto",
      active
        ? "border-slate-900 bg-slate-900 text-white"
        : primary
        ? "border-blue-600 bg-blue-600 text-white hover:bg-blue-700 hover:border-blue-700"
        : "border-slate-300 bg-white text-slate-700 hover:bg-slate-50",
    ].join(" ");
  }

  return (
    <div className={`grid grid-cols-2 gap-3 sm:flex sm:flex-wrap ${className}`}>
      <button
        type="button"
        onClick={() => router.push("/admin")}
        className={buttonClass(false, true)}
      >
        重新計算本月結算
      </button>

      <button
        type="button"
        onClick={() => router.push("/dashboard")}
        className={buttonClass(pathname === "/dashboard")}
      >
        個人 Dashboard
      </button>

      {role === "admin" && (
        <button
          type="button"
          onClick={() => router.push("/admin")}
          className={buttonClass(pathname === "/admin")}
        >
          Admin 規則頁
        </button>
      )}

      {role === "admin" && (
        <button
          type="button"
          onClick={() => router.push("/admin/users")}
          className={buttonClass(pathname === "/admin/users")}
        >
          員工總覽
        </button>
      )}

      {role === "admin" && (
        <button
          type="button"
          onClick={() => router.push("/admin/reports")}
          className={buttonClass(pathname === "/admin/reports")}
        >
          全部填報
        </button>
      )}

      {role === "admin" && (
        <button
          type="button"
          onClick={() => router.push("/admin/weekly-rules")}
          className={buttonClass(pathname === "/admin/weekly-rules")}
        >
          每週調分
        </button>
      )}

      <button
        type="button"
        onClick={() => router.push("/daily-entry")}
        className={buttonClass(pathname === "/daily-entry")}
      >
        每日填報
      </button>

      <button
        type="button"
        onClick={() => router.push("/history")}
        className={buttonClass(pathname === "/history")}
      >
        過往記錄
      </button>

      <button
        type="button"
        onClick={() => router.push("/")}
        className={buttonClass(pathname === "/")}
      >
        首頁
      </button>

      <button
        type="button"
        onClick={handleLogout}
        disabled={loading || loggingOut}
        className={buttonClass(false)}
      >
        {loggingOut ? "登出中..." : "登出"}
      </button>
    </div>
  );
}