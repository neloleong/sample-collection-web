export default function HomePage() {
  return (
    <main className="min-h-screen bg-gray-50 flex flex-col items-center justify-center px-6">

      {/* Title */}
      <div className="text-center max-w-2xl">
        <h1 className="text-4xl font-bold text-gray-900 mb-4">
          樣本收集管理系統
        </h1>

        <p className="text-lg text-gray-600 mb-6">
          用於跨地區樣本收集數據的統一管理與分析平台
        </p>

        <p className="text-gray-500 leading-relaxed mb-10">
          本平台協助團隊高效記錄每日數據、追蹤表現，並透過儀表板分析結果。
          支援多地區管理、權限控制及績效監察，讓決策更清晰。
        </p>

        {/* Buttons */}
        <div className="flex justify-center gap-4">
          <a
            href="/login"
            className="px-6 py-3 bg-blue-600 text-white rounded-lg shadow hover:bg-blue-700 transition"
          >
            登入系統
          </a>

          <a
            href="/dashboard"
            className="px-6 py-3 bg-white border border-gray-300 rounded-lg hover:bg-gray-100 transition"
          >
            查看儀表板
          </a>
        </div>
      </div>

      {/* Footer hint */}
      <div className="mt-16 text-sm text-gray-400">
        © 2026 Sample Collection System
      </div>
    </main>
  );
}