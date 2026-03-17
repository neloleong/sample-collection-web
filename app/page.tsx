"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { supabase } from "../lib/supabase";

type Profile = {
  display_name: string | null;
  employee_code: string | null;
  role: string | null;
};

export default function HomePage() {
  const [loading, setLoading] = useState(true);
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [isAdmin, setIsAdmin] = useState(false);
  const [displayName, setDisplayName] = useState("");
  const [employeeCode, setEmployeeCode] = useState("");
  const [role, setRole] = useState("");

  const loadUserStatus = async () => {
    setLoading(true);

    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      setIsLoggedIn(false);
      setIsAdmin(false);
      setDisplayName("");
      setEmployeeCode("");
      setRole("");
      setLoading(false);
      return;
    }

    setIsLoggedIn(true);

    const { data: profileData } = await supabase
      .from("profiles")
      .select("display_name, employee_code, role")
      .eq("id", user.id)
      .maybeSingle();

    const profile = profileData as Profile | null;

    setDisplayName(profile?.display_name ?? user.email ?? "未命名");
    setEmployeeCode(profile?.employee_code ?? "-");
    setRole(profile?.role ?? "user");
    setIsAdmin(profile?.role === "admin");

    setLoading(false);
  };

  useEffect(() => {
    loadUserStatus();

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange(() => {
      loadUserStatus();
    });

    return () => {
      subscription.unsubscribe();
    };
  }, []);

  const handleSignOut = async () => {
    await supabase.auth.signOut();
    await loadUserStatus();
  };

  if (loading) {
    return (
      <main className="min-h-screen bg-slate-50 px-6 py-10">
        <div className="mx-auto max-w-5xl rounded-2xl bg-white p-8 shadow-sm ring-1 ring-slate-200">
          載入中...
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-slate-50 px-6 py-10">
      <div className="mx-auto max-w-5xl">
        <div className="rounded-2xl bg-white p-8 shadow-sm ring-1 ring-slate-200">
          <h1 className="text-3xl font-bold text-slate-900">
            Sample Collection Management
          </h1>
          <p className="mt-3 text-slate-600">
            第一版功能：登入、每日填報 11 個地區類別、查看本月統計。
          </p>

          {isLoggedIn ? (
            <div className="mt-6 rounded-2xl bg-slate-50 p-5 ring-1 ring-slate-200">
              <h2 className="text-lg font-semibold text-slate-900">目前登入者</h2>

              <div className="mt-4 grid gap-4 md:grid-cols-3">
                <div className="rounded-xl bg-white p-4 ring-1 ring-slate-200">
                  <p className="text-sm text-slate-500">姓名</p>
                  <p className="mt-2 text-lg font-bold text-slate-900">
                    {displayName}
                  </p>
                </div>

                <div className="rounded-xl bg-white p-4 ring-1 ring-slate-200">
                  <p className="text-sm text-slate-500">員工編號</p>
                  <p className="mt-2 text-lg font-bold text-slate-900">
                    {employeeCode}
                  </p>
                </div>

                <div className="rounded-xl bg-white p-4 ring-1 ring-slate-200">
                  <p className="text-sm text-slate-500">角色</p>
                  <p className="mt-2 text-lg font-bold text-slate-900">
                    {role}
                  </p>
                </div>
              </div>
            </div>
          ) : (
            <div className="mt-6 rounded-2xl bg-amber-50 p-4 text-sm text-amber-800 ring-1 ring-amber-200">
              目前未登入，請先登入後再進入系統。
            </div>
          )}

          <div
            className={`mt-8 grid gap-4 ${
              isLoggedIn
                ? isAdmin
                  ? "sm:grid-cols-2 lg:grid-cols-4"
                  : "sm:grid-cols-2 lg:grid-cols-3"
                : "sm:grid-cols-1"
            }`}
          >
            {!isLoggedIn ? (
              <Link
                href="/login"
                className="rounded-xl bg-slate-900 px-4 py-3 text-center text-white hover:bg-slate-800"
              >
                前往登入
              </Link>
            ) : (
              <>
                <Link
                  href="/daily-entry"
                  className="rounded-xl bg-slate-900 px-4 py-3 text-center text-white hover:bg-slate-800"
                >
                  進入每日填報
                </Link>

                <Link
                  href="/dashboard"
                  className="rounded-xl border border-slate-300 px-4 py-3 text-center text-slate-700 hover:bg-slate-100"
                >
                  個人 Dashboard
                </Link>

                {isAdmin ? (
                  <Link
                    href="/admin"
                    className="rounded-xl border border-slate-300 px-4 py-3 text-center text-slate-700 hover:bg-slate-100"
                  >
                    Admin 總覽
                  </Link>
                ) : null}

                <button
                  onClick={handleSignOut}
                  className="rounded-xl border border-slate-300 px-4 py-3 text-center text-slate-700 hover:bg-slate-100"
                >
                  登出
                </button>
              </>
            )}
          </div>
        </div>
      </div>
    </main>
  );
}