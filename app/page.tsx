export default function HomePage() {
  return (
    <main className="min-h-screen bg-white px-6 py-12">
      <div className="mx-auto max-w-3xl space-y-6">
        <h1 className="text-3xl font-bold">
          Sample Collection Management System
        </h1>

        <p className="text-gray-600">
          This platform is designed to manage and analyze sample collection data
          across multiple regions.
        </p>

        <p className="text-gray-600">
          Users can input daily records, track performance, and evaluate monthly
          results through structured dashboards.
        </p>

        <p className="text-gray-600">
          The system supports multi-region data tracking, role-based access,
          and performance monitoring.
        </p>

        <div className="pt-6 flex gap-4">
          <a
            href="/login"
            className="rounded-xl bg-black px-6 py-3 text-white"
          >
            Login
          </a>

          <a
            href="/dashboard"
            className="rounded-xl border px-6 py-3"
          >
            View Dashboard
          </a>
        </div>
      </div>
    </main>
  );
}