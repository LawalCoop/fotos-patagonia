"use client";

import { useState, useEffect, useCallback } from "react";
import { apiFetch } from "@/lib/api";
import { DateRange } from "react-day-picker";
import { format } from "date-fns";

export interface OrderEarningSummary {
  order_id: number;
  created_at: string;
  total_photos: number;
  order_total_photos: number;
  percentage_in_order: number;
  real_photos_sold: number;
  total_earnings: number;
}

interface PaginatedResponse<T> {
  items: T[];
  total: number;
}

const LIMIT = 15;

export function usePhotographerEarningsByOrder(
  photographerId: string | number | undefined,
  dateRange: DateRange | undefined
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
        url += `&start_date=${format(dateRange.from, "yyyy-MM-dd")}`;
      }
      if (dateRange?.to) {
        url += `&end_date=${format(dateRange.to, "yyyy-MM-dd")}`;
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
  }, [photographerId, page, dateRange]);

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
