"use client";

import { useState, useEffect, useCallback } from "react";
import { apiFetch } from "@/lib/api";
import type { AdminDashboardSchema } from "@/lib/types";

interface DashboardFilters {
  startDate?: string;
  endDate?: string;
  photographerId?: string;
}

export function useAdminDashboard(filters: DashboardFilters = {}) {
  const { startDate, endDate, photographerId } = filters;
  const [data, setData] = useState<AdminDashboardSchema | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchDashboardData = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (startDate) params.append("start_date", startDate);
      if (endDate) params.append("end_date", endDate);
      if (photographerId) params.append("photographer_id", photographerId);
      
      const queryString = params.toString();
      const url = `/admin/dashboard${queryString ? `?${queryString}` : ""}`;
      
      const dashboardData = await apiFetch<AdminDashboardSchema>(url);
      setData(dashboardData);
      setError(null);
    } catch (err: any) {
      setError(err.message);
      console.error("Error fetching admin dashboard data:", err);
    } finally {
      setLoading(false);
    }
  }, [startDate, endDate, photographerId]);

  useEffect(() => {
    fetchDashboardData();
  }, [fetchDashboardData]);

  return { data, loading, error, refetch: fetchDashboardData };
}
