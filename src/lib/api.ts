export type DashboardStats = {
  pendingMerchantRequests: number;
  totalOrdersToday: number;
  activeUsers: number;
};

export async function fetchDashboardStats(): Promise<DashboardStats> {
  const res = await fetch("/.netlify/functions/dashboard-stats");

  if (!res.ok) {
    const text = await res.text();
    throw new Error(text || "Failed to load dashboard stats");
  }

  return res.json();
}