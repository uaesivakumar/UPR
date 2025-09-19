// dashboard/src/App.jsx
import { BrowserRouter, Routes, Route } from "react-router-dom";
import Sidebar from "./components/sidebar.jsx";
import Topbar from "./components/Topbar.jsx";
import DashboardPage from "./pages/DashboardHome.jsx";
import EnrichmentPage from "./pages/EnrichmentPage.jsx";
// ... other imports

export default function App() {
  return (
    <BrowserRouter>
      <div className="min-h-screen bg-gray-50 md:flex">
        <Sidebar />
        <div className="flex min-h-screen flex-1 flex-col">
          <Topbar />
          <div className="p-6">
            <Routes>
              <Route path="/" element={<DashboardPage />} />
              <Route path="/enrichment" element={<EnrichmentPage />} />
              {/* ...other routes */}
            </Routes>
          </div>
        </div>
      </div>
    </BrowserRouter>
  );
}
