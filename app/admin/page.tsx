"use client";

import { useRouter } from "next/navigation";
import PageActionButtons from "../components/PageActionButtons";
import Link from "next/link";


export default function AdminDashboard() {
  const router = useRouter();

  return (
    <main className="min-h-screen bg-slate-100 px-6 py-10">
      <div className="mx-auto max-w-7xl space-y-6">
        
        <div className="flex justify-between items-center">
          <h1 className="text-4xl font-bold">Admin Dashboard</h1>
          
        </div>
        <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
                  <PageActionButtons />
        </div>
        

        {/* 卡片區 */}
        <div className="grid md:grid-cols-3 gap-6">

          <div
            onClick={() => router.push("/admin/users")}
            className="cursor-pointer rounded-3xl bg-white p-6 shadow-sm ring-1 ring-slate-200 hover:shadow-md transition"
          >
            <h2 className="text-xl font-semibold">員工管理</h2>
            <p className="text-sm text-slate-500 mt-2">
              管理帳戶、新增、刪除員工
            </p>
          </div>

          <div className="rounded-3xl bg-white p-6 shadow-sm ring-1 ring-slate-200">
            <h2 className="text-xl font-semibold">報表管理（之後）</h2>
            <p className="text-sm text-slate-500 mt-2">
              之後可以放報表
            </p>
          </div>

          <div className="rounded-3xl bg-white p-6 shadow-sm ring-1 ring-slate-200">
            <h2 className="text-xl font-semibold">系統設定（之後）</h2>
            <p className="text-sm text-slate-500 mt-2">
              權限 / 規則
            </p>
          </div>

        </div>
      </div>
    </main>
  );
}