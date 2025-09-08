export default function DashboardHome() {
  return (
    <div className="max-w-7xl mx-auto">
      <h2 className="text-2xl font-bold mb-2">Dashboard</h2>
      <p className="text-gray-600 mb-6">
        Quick overview of high-potential companies, leads, and recent activity.
      </p>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="bg-white border rounded-xl p-5 shadow-sm">
          <h3 className="text-sm font-semibold text-gray-500">Companies Tracked</h3>
          <div className="mt-2 text-3xl font-bold text-blue-600">132</div>
        </div>
        <div className="bg-white border rounded-xl p-5 shadow-sm">
          <h3 className="text-sm font-semibold text-gray-500">Leads Identified</h3>
          <div className="mt-2 text-3xl font-bold text-green-600">29</div>
        </div>
        <div className="bg-white border rounded-xl p-5 shadow-sm">
          <h3 className="text-sm font-semibold text-gray-500">Outreach Sent</h3>
          <div className="mt-2 text-3xl font-bold text-purple-600">47</div>
        </div>
      </div>
    </div>
  );
}
