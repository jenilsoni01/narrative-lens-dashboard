import { NavLink, Route, Routes } from "react-router-dom";
import OverviewPage from "./pages/OverviewPage";
import TimeseriesPage from "./pages/TimeseriesPage";
import NetworkPage from "./pages/NetworkPage";
import SearchPage from "./pages/SearchPage";
import ChatbotPage from "./pages/ChatbotPage";
import ClustersPage from "./pages/ClustersPage";

const links = [
  { to: "/", label: "Overview" },
  { to: "/timeseries", label: "Time Series" },
  { to: "/network", label: "Network" },
  { to: "/search", label: "Semantic Search" },
  { to: "/chatbot", label: "RAG Chatbot" },
  { to: "/clusters", label: "Clusters" },
];

export default function App() {
  return (
    <div className="app-shell">
      <aside className="sidebar">
        <h1>Narrative Lens</h1>
        <p>Flask + React migration</p>
        <nav>
          {links.map((link) => (
            <NavLink
              key={link.to}
              to={link.to}
              end={link.to === "/"}
              className={({ isActive }) => (isActive ? "nav-link active" : "nav-link")}
            >
              {link.label}
            </NavLink>
          ))}
        </nav>
      </aside>

      <main className="content">
        <Routes>
          <Route path="/" element={<OverviewPage />} />
          <Route path="/timeseries" element={<TimeseriesPage />} />
          <Route path="/network" element={<NetworkPage />} />
          <Route path="/search" element={<SearchPage />} />
          <Route path="/chatbot" element={<ChatbotPage />} />
          <Route path="/clusters" element={<ClustersPage />} />
        </Routes>
      </main>
    </div>
  );
}
