import Topbar from "../components/Topbar";

export default function DashboardHome() {
  const stats = [
    { label: "Companies Tracked", value: 132 },
    { label: "Leads Identified", value: 29 },
    { label: "Outreach Sent", value: 47 },
  ];

  const recent = [
    { id: "ld_103", company: "Oasis Ventures", role: "HR Manager", status: "Contacted" },
    { id: "ld_102", company: "Desert Labs", role: "Admin Lead", status: "Qualified" },
    { id: "ld_101", company: "Falak Tech", role: "Finance Manager", status: "New" },
  ];

  return (
    <div>
      <Topbar title="Dashboard" />

      {/* Stats */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 mb-6">
        {stats.map((s) => (
          <div key={s.label} className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
            <div className="text-sm text-gray-500">{s.label}</div>
            <div className="mt-2 text-3xl font-semibold">{s.value}</div>
          </div>
        ))}
      </div>

      {/* Recent Activity */}
      <div className="rounded-2xl border border-gray-200 bg-white shadow-sm">
        <div className="flex items-center justify-between border-b border-gray-200 px  -5 px-5 py-3">
          <h2 className="text-base font-semibold">Recent Activity</h2>
          <span className="text-sm text-gray-500">Last 24 hours</span>
        </div>
        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead className="bg-gray-50 text-gray-600">
              <tr>
                <th className="px-4 py-3 text-left font-medium">ID</th>
                <th className="px-4 py-3 text-left font-medium">Company</th>
                <th className="px-4 py-3 text-left font-medium">Role</th>
                <th className="px-4 py-3 text-left font-medium">Status</th>
              </tr>
            </thead>
            <tbody>
              {recent.map((r) => (
                <tr key={r.id} className="border-t">
                  <td className="px-4 py-3 text-gray-700">{r.id}</td>
                  <td className="px-4 py-3">{r.company}</td>
                  <td className="px-4 py-3">{r.role}</td>
                  <td className="px-4 py-3">
                    <span className="rounded-lg bg-gray-100 px-2 py-1 text-xs text-gray-700">
                      {r.status}
                    </span>
                  </td>
                </tr>
              ))}
              {recent.length === 0 && (
                <tr>
                  <td className="px-4 py-10 text-center text-gray-500" colSpan={4}>
                    Nothing yet.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
