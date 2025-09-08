import React from "react";
import { useAuth } from "../lib/AuthContext";
import { Button } from "@/components/ui/button";

const AdminDashboard = () => {
  const { logout } = useAuth();

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-gray-50 p-4">
      <div className="bg-white rounded-2xl shadow-md w-full max-w-4xl p-6">
        <div className="flex justify-between items-center mb-6">
          <h1 className="text-2xl font-bold text-gray-800">Admin Dashboard</h1>
          <Button variant="outline" onClick={logout}>
            Logout
          </Button>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          <div className="p-4 rounded-xl shadow bg-white border">
            <h2 className="text-lg font-semibold">Companies Tracked</h2>
            <p className="text-3xl font-bold text-blue-600">132</p>
          </div>
          <div className="p-4 rounded-xl shadow bg-white border">
            <h2 className="text-lg font-semibold">Leads Identified</h2>
            <p className="text-3xl font-bold text-green-600">29</p>
          </div>
          <div className="p-4 rounded-xl shadow bg-white border">
            <h2 className="text-lg font-semibold">Emails Sent</h2>
            <p className="text-3xl font-bold text-purple-600">47</p>
          </div>
        </div>
        <div className="mt-8 text-gray-500 text-sm text-center">
          Data auto-updated by AI agent | UAE Premium Radar
        </div>
      </div>
    </div>
  );
};

export default AdminDashboard;
