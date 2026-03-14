import { useEffect, useState } from "react";
import { Users, ShoppingBag, Activity } from "lucide-react";
import { fetchDashboardStats, type DashboardStats } from "../lib/api";

const Dashboard = () => {
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const load = async () => {
      try {
        const data = await fetchDashboardStats();
        setStats(data);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Unknown error");
      } finally {
        setLoading(false);
      }
    };

    load();
  }, []);

  return (
    <div>
      <h1 className="page-title">Dashboard</h1>

      {loading && <p>Loading dashboard data...</p>}
      {error && <p style={{ color: "red" }}>Error: {error}</p>}

      {!loading && !error && stats && (
        <>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))",
              gap: "1.5rem",
              marginBottom: "2rem",
            }}
          >
            <div className="card" style={{ display: "flex", alignItems: "center" }}>
              <div
                style={{
                  padding: "1rem",
                  backgroundColor: "#e0e7ff",
                  borderRadius: "8px",
                  marginRight: "1rem",
                }}
              >
                <Users size={24} color="#4f46e5" />
              </div>
              <div>
                <p style={{ color: "#6b7280", fontSize: "0.875rem" }}>
                  Total Todos
                </p>
                <p style={{ fontSize: "1.5rem", fontWeight: "bold" }}>
                  {stats.pendingMerchantRequests}
                </p>
              </div>
            </div>

            <div className="card" style={{ display: "flex", alignItems: "center" }}>
              <div
                style={{
                  padding: "1rem",
                  backgroundColor: "#dcfce7",
                  borderRadius: "8px",
                  marginRight: "1rem",
                }}
              >
                <ShoppingBag size={24} color="#16a34a" />
              </div>
              <div>
                <p style={{ color: "#6b7280", fontSize: "0.875rem" }}>
                  Todos Created Today
                </p>
                <p style={{ fontSize: "1.5rem", fontWeight: "bold" }}>
                  {stats.totalOrdersToday}
                </p>
              </div>
            </div>

            <div className="card" style={{ display: "flex", alignItems: "center" }}>
              <div
                style={{
                  padding: "1rem",
                  backgroundColor: "#fef3c7",
                  borderRadius: "8px",
                  marginRight: "1rem",
                }}
              >
                <Activity size={24} color="#d97706" />
              </div>
              <div>
                <p style={{ color: "#6b7280", fontSize: "0.875rem" }}>
                  Active Users
                </p>
                <p style={{ fontSize: "1.5rem", fontWeight: "bold" }}>
                  {stats.activeUsers}
                </p>
              </div>
            </div>
          </div>

          <div className="card">
            <h2 style={{ fontSize: "1.25rem", fontWeight: 600, marginBottom: "1rem" }}>
              Welcome to the Admin Portal
            </h2>
            <p style={{ color: "#4b5563" }}>
              Dashboard data is now loaded from AppCube through a Netlify Function.
            </p>
          </div>
        </>
      )}
    </div>
  );
};

export default Dashboard;
