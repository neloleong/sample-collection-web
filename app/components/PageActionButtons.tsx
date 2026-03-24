"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "../../lib/supabase";

type ProfileRow = {
  role: "staff" | "admin";
};

function getMonthStart() {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  return `${year}-${month}-01`;
}

export default function PageActionButtons() {
  const router = useRouter();

  const [isAdmin, setIsAdmin] = useState(false);
  const [recalcLoading, setRecalcLoading] = useState(false);

  useEffect(() => {
    const loadProfile = async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user) return;

      const { data, error } = await supabase
        .from("profiles")
        .select("role")
        .eq("id", user.id)
        .maybeSingle();

      if (error) return;

      const profile = (data as ProfileRow | null) ?? null;
      setIsAdmin(profile?.role === "admin");
    };

    void loadProfile();
  }, []);

  const handleRecalculate = async () => {
    setRecalcLoading(true);

    try {
      const monthStart = getMonthStart();

      const { error } = await supabase.rpc("recalculate_monthly_summary_v2", {
        p_summary_month: monthStart,
      });

      if (error) {
        alert(error.message);
        return;
      }

      router.refresh();
      alert("本月月結算已重新計算完成。");
    } finally {
      setRecalcLoading(false);
    }
  };

  const handleSignOut = async () => {
    await supabase.auth.signOut();
    router.replace("/login");
  };

  return (
    <div className="flex flex-wrap gap-3">
      {isAdmin ? (
        <button
          onClick={handleRecalculate}
          disabled={recalcLoading}
          className="rounded-xl bg-slate-900 px-4 py-2 text-sm text-white hover:bg-slate-800 disabled:opacity-50"
        >
          {recalcLoading ? "計算中..." : "重新計算本月結算"}
        </button>
      ) : null}

      <Link
        href="/dashboard"
        className="rounded-xl border border-slate-300 px-4 py-2 text-sm text-slate-700 hover:bg-slate-100"
      >
        個人 Dashboard
      </Link>

      {isAdmin ? (
        <>
          <Link
            href="/admin"
            className="rounded-xl border border-slate-300 px-4 py-2 text-sm text-slate-700 hover:bg-slate-100"
          >
            Admin 規則頁
          </Link>

          <Link
            href="/admin/users"
            className="rounded-xl border border-slate-300 px-4 py-2 text-sm text-slate-700 hover:bg-slate-100"
          >
            員工總覽
          </Link>

          <Link
            href="/admin/reports"
            className="rounded-xl border border-slate-300 px-4 py-2 text-sm text-slate-700 hover:bg-slate-100"
          >
            全部填報
          </Link>
        </>
      ) : null}

      <Link
        href="/daily-entry"
        className="rounded-xl border border-slate-300 px-4 py-2 text-sm text-slate-700 hover:bg-slate-100"
      >
        每日填報
      </Link>

      <Link
        href="/history"
        className="rounded-xl border border-slate-300 px-4 py-2 text-sm text-slate-700 hover:bg-slate-100"
      >
        過往記錄
      </Link>

      {isAdmin ? (
        <Link
          href="/weekly-rules"
          className="rounded-xl border border-slate-300 px-4 py-2 text-sm text-slate-700 hover:bg-slate-100"
        >
          每週調分
        </Link>
      ) : null}

      <Link
        href="/"
        className="rounded-xl border border-slate-300 px-4 py-2 text-sm text-slate-700 hover:bg-slate-100"
      >
        首頁
      </Link>

      <button
        onClick={handleSignOut}
        className="rounded-xl border border-slate-300 px-4 py-2 text-sm text-slate-700 hover:bg-slate-100"
      >
        登出
      </button>
    </div>
  );
}