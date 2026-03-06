"use client";

import { useState, useEffect, useCallback } from "react";
import { apiFetch } from "@/lib/api";

export interface PhotoEarningSummary {
  photo_id: number;
  photo_filename: string;
  times_sold: number;
  real_photos_sold: number;
  total_earnings: number;
}

interface PaginatedResponse<T> {
  items: T[];
  total: number;
}

const LIMIT = 15;

export function usePhotographerEarningsSummary(photographerId: string | number | undefined) {
  const [data, setData] = useState<PaginatedResponse<PhotoEarningSummary>>({ items: [], total: 0 });
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchSummary = useCallback(async () => {
    if (!photographerId) {
      setData({ items: [], total: 0 });
      setLoading(false);
      return;
    }
    try {
      setLoading(true);
      const skip = (page - 1) * LIMIT;
      const response = await apiFetch<PaginatedResponse<PhotoEarningSummary>>(
        `/photographers/${photographerId}/earnings/summary_by_photo?skip=${skip}&limit=${LIMIT}`
      );
      setData(response);
      setError(null);
    } catch (err: any) {      setError(err.message);
      console.error("Error fetching photographer earnings summary:", err);
    } finally {
      setLoading(false);
    }
  }, [photographerId, page]);

  useEffect(() => {
    fetchSummary();
  }, [fetchSummary]);

  return {
    summary: data.items,
    total: data.total,
    page,
    setPage,
    limit: LIMIT,
    loading,
    error,
    refetch: fetchSummary,
  };
}
