"use client";

import { useState, useEffect, useCallback } from "react";
import { apiFetch } from "@/lib/api";

export interface OrderEarningSummary {
  order_id: number;
  created_at: string;
  total_photos: number;
  order_total_photos: number;
  percentage_in_order: number;
  real_photos_sold: number;
  earned_photo_fraction: number;
  total_earnings: number;
}

interface PaginatedResponse<T> {
  items: T[];
  total: number;
}

const LIMIT = 15;

export function usePhotographerEarningsByOrder(
  photographerId: string | number | undefined,
  dateRange: { from?: string; to?: string } | undefined
) {
  const [data, setData] = useState<PaginatedResponse<OrderEarningSummary>>({ items: [], total: 0 });
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchEarnings = useCallback(async () => {
    if (!photographerId) {
      setData({ items: [], total: 0 });
      setLoading(false);
      return;
    }
    try {
      setLoading(true);
      const skip = (page - 1) * LIMIT;
      let url = `/photographers/${photographerId}/earnings/summary_by_order?skip=${skip}&limit=${LIMIT}`;
      
      if (dateRange?.from) {
        url += `&start_date=${dateRange.from}`;
      }
      if (dateRange?.to) {
        url += `&end_date=${dateRange.to}`;
      }

      const response = await apiFetch<PaginatedResponse<OrderEarningSummary>>(url);
      setData(response);
      setError(null);
    } catch (err: any) {
      setError(err.message);
      console.error("Error fetching photographer earnings by order:", err);
    } finally {
      setLoading(false);
    }
  }, [photographerId, page, dateRange?.from, dateRange?.to]);

  useEffect(() => {
    fetchEarnings();
  }, [fetchEarnings]);

  return {
    earnings: data.items,
    total: data.total,
    page,
    setPage,
    limit: LIMIT,
    loading,
    error,
    refetch: fetchEarnings,
  };
}
