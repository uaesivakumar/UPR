import React from "react";
import { NavLink } from "react-router-dom";
import { Home, Users, FileText, Search } from "lucide-react";

const Sidebar = () => {
  return (
    <div className="h-full w-64 bg-white border-r shadow-sm p-4">
      <nav className="space-y-4">
        <NavLink
          to="/"
          className={({ isActive }) =>
            `flex items-center space-x-2 px-3 py-2 rounded-md text-sm font-medium ${
              isActive ? "bg-blue-100 text-blue-600" : "text-gray-700 hover:bg-gray-100"
            }`
          }
        >
          <Home className="w-4 h-4" />
          <span>Dashboard</span>
        </NavLink>
        <NavLink
          to="/leads"
          className={({ isActive }) =>
            `flex items-center space-x-2 px-3 py-2 rounded-md text-sm font-medium ${
              isActive ? "bg-blue-100 text-blue-600" : "text-gray-700 hover:bg-gray-100"
            }`
          }
        >
          <Users className="w-4 h-4" />
          <span>Leads</span>
        </NavLink>
        <NavLink
          to="/enrichment"
          className={({ isActive }) =>
            `flex items-center space-x-2 px-3 py-2 rounded-md text-sm font-medium ${
              isActive ? "bg-blue-100 text-blue-600" : "text-gray-700 hover:bg-gray-100"
            }`
          }
        >
          <Search className="w-4 h-4" />
          <span>Enrichment</span>
        </NavLink>
        <NavLink
          to="/messages"
          className={({ isActive }) =>
            `flex items-center space-x-2 px-3 py-2 rounded-md text-sm font-medium ${
              isActive ? "bg-blue-100 text-blue-600" : "text-gray-700 hover:bg-gray-100"
            }`
          }
        >
          <FileText className="w-4 h-4" />
          <span>Messages</span>
        </NavLink>
      </nav>
    </div>
  );
};

export default Sidebar;
