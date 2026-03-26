"use client";

import { useRouter } from "next/navigation";
import PageActionButtons from "../components/PageActionButtons";

export default function AdminDashboard() {
  const router = useRouter();

  return (
    <main className="min-h-screen bg-slate-100 px-4 py-6 sm:px-6 sm:py-8 lg:px-8">
      <div className="mx-auto max-w-7xl space-y-6">
        {/* 頁面標題 */}
        <div className="space-y-4">
          <div>
            <h1 className="text-2xl font-bold text-slate-900 sm:text-3xl">
              Admin Dashboard
            </h1>
            <p className="mt-1 text-sm text-slate-600">
              管理員功能總覽與快捷入口
            </p>
          </div>

          <PageActionButtons />
        </div>

        {/* 功能卡片區 */}
        <div className="grid grid-cols-1 gap-6 md:grid-cols-3">
          <div
            onClick={() => router.push("/admin/users")}
            className="cursor-pointer rounded-3xl bg-white p-6 shadow-sm ring-1 ring-slate-200 transition hover:shadow-md"
          >
            <h2 className="text-xl font-semibold text-slate-900">員工管理</h2>
            <p className="mt-2 text-sm text-slate-500">
              管理帳戶、新增、刪除員工
            </p>
          </div>

          <div
            onClick={() => router.push("/admin/report-management")}
            className="cursor-pointer rounded-3xl bg-white p-6 shadow-sm ring-1 ring-slate-200 transition hover:shadow-md"
          >
            <h2 className="text-xl font-semibold text-slate-900">報表管理</h2>
            <p className="mt-2 text-sm text-slate-500">
              查看全部員工資料彙總與達標進度
            </p>
          </div>

          <div
            onClick={() => router.push("/admin/weekly-rules")}
            className="cursor-pointer rounded-3xl bg-white p-6 shadow-sm ring-1 ring-slate-200 transition hover:shadow-md"
          >
            <h2 className="text-xl font-semibold text-slate-900">系統設定</h2>
            <p className="mt-2 text-sm text-slate-500">
              管理每月規則、每週調分與相關設定
            </p>
          </div>
        </div>
      </div>
    </main>
  );
}