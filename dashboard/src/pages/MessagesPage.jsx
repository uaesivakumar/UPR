export default function MessagesPage() {
  return (
    <div className="max-w-7xl mx-auto">
      <h2 className="text-2xl font-bold mb-2">Messages</h2>
      <p className="text-gray-600 mb-6">
        This section will show generated outreach drafts, recent emails, and LinkedIn DMs.
      </p>

      <div className="bg-white border rounded-xl p-6 shadow-sm">
        <div className="text-gray-500 text-sm">
          No messages yet. Once the AI agent drafts outreach, items will appear here.
        </div>
      </div>
    </div>
  );
}
