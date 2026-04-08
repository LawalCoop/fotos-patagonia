"use client";

import { useState, useEffect, useCallback, useRef } from "react";
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
  const fetchIdRef = useRef(0);

  const fetchDashboardData = useCallback(async () => {
    const currentFetchId = ++fetchIdRef.current;
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (startDate) params.append("start_date", startDate);
      if (endDate) params.append("end_date", endDate);
      if (photographerId) params.append("photographer_id", photographerId);

      const queryString = params.toString();
      const url = `/admin/dashboard${queryString ? '?' + queryString : ""}`;

      const dashboardData = await apiFetch<AdminDashboardSchema>(url);

      if (currentFetchId === fetchIdRef.current) {
        setData(dashboardData);
        setError(null);
      }
    } catch (err: any) {
      if (currentFetchId === fetchIdRef.current) {
        setError(err.message);
        console.error("Error fetching admin dashboard data:", err);
      }
    } finally {
      if (currentFetchId === fetchIdRef.current) {
        setLoading(false);
      }
    }
  }, [startDate, endDate, photographerId]);

  useEffect(() => {
    fetchDashboardData();
  }, [fetchDashboardData]);

  return { data, loading, error, refetch: fetchDashboardData };
}
