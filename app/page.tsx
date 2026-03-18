"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { supabase } from "../lib/supabase";

type Profile = {
  display_name: string | null;
  employee_code: string | null;
  role: "admin" | "staff" | null;
};

export default function HomePage() {
  const [loading, setLoading] = useState(true);
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [isAdmin, setIsAdmin] = useState(false);
  const [displayName, setDisplayName] = useState("");
  const [employeeCode, setEmployeeCode] = useState("");
  const [role, setRole] = useState<"admin" | "staff" | "">("");
  const [debugMessage, setDebugMessage] = useState("");

  const loadUserStatus = async () => {
    setLoading(true);
    setDebugMessage("");

    console.log(
      "SUPABASE URL =",
      process.env.NEXT_PUBLIC_SUPABASE_URL ?? "undefined"
    );

    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser();

    console.log("auth user =", user);
    console.log("auth userError =", userError);

    if (!user) {
      setIsLoggedIn(false);
      setIsAdmin(false);
      setDisplayName("");
      setEmployeeCode("");
      setRole("");
      setDebugMessage(
        `未登入，或未取得 auth user。SUPABASE URL = ${
          process.env.NEXT_PUBLIC_SUPABASE_URL ?? "undefined"
        }`
      );
      setLoading(false);
      return;
    }

    setIsLoggedIn(true);

    const { data: profileData, error: profileError } = await supabase
      .from("profiles")
      .select("display_name, employee_code, role")
      .eq("id", user.id)
      .maybeSingle();

    console.log("user.id =", user.id);
    console.log("profileData =", profileData);
    console.log("profileError =", profileError);
    console.log("profile role =", profileData?.role);

    if (profileError) {
      console.error("讀取 profile 失敗：", profileError.message);
      setDebugMessage(
        `讀取 profile 失敗：${profileError.message}｜SUPABASE URL = ${
          process.env.NEXT_PUBLIC_SUPABASE_URL ?? "undefined"
        }`
      );
    }

    const profile = (profileData as Profile | null) ?? null;

    const resolvedRole: "admin" | "staff" =
      profile?.role === "admin" ? "admin" : "staff";

    setDisplayName(profile?.display_name ?? user.email ?? "員工");
    setEmployeeCode(profile?.employee_code ?? "-");
    setRole(resolvedRole);
    setIsAdmin(resolvedRole === "admin");

    if (!profile) {
      setDebugMessage(
        `找不到 profiles 資料｜user.id = ${user.id}｜SUPABASE URL = ${
          process.env.NEXT_PUBLIC_SUPABASE_URL ?? "undefined"
        }`
      );
    } else {
      setDebugMessage(
        `user.id = ${user.id}｜profiles.role = ${
          profile.role ?? "null"
        }｜SUPABASE URL = ${
          process.env.NEXT_PUBLIC_SUPABASE_URL ?? "undefined"
        }`
      );
    }

    setLoading(false);
  };

  useEffect(() => {
    void loadUserStatus();

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange(() => {
      void loadUserStatus();
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

          {debugMessage ? (
            <div className="mt-4 rounded-xl bg-amber-50 px-4 py-3 text-sm text-amber-800 ring-1 ring-amber-200">
              Debug：{debugMessage}
            </div>
          ) : null}

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
                    {role === "admin" ? "admin" : "staff"}
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
                  ? "sm:grid-cols-2 lg:grid-cols-5"
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
                  <>
                    <Link
                      href="/admin"
                      className="rounded-xl border border-slate-300 px-4 py-3 text-center text-slate-700 hover:bg-slate-100"
                    >
                      Admin 規則頁
                    </Link>

                    <Link
                      href="/admin/users"
                      className="rounded-xl border border-slate-300 px-4 py-3 text-center text-slate-700 hover:bg-slate-100"
                    >
                      員工總覽
                    </Link>

                    <Link
                      href="/admin/reports"
                      className="rounded-xl border border-slate-300 px-4 py-3 text-center text-slate-700 hover:bg-slate-100"
                    >
                      全部填報
                    </Link>
                  </>
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