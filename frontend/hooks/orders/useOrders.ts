"use client";

import { useState, useEffect, useCallback } from "react";
import { apiFetch } from "@/lib/api";
import { Order } from "@/lib/types";

// Define la interfaz para los parámetros que puede recibir el hook
interface OrderParams {
  orderId?: string;
  limit?: number;
  start_date?: string;
  end_date?: string;
  photographer_id?: string;
}

export function useOrders(params?: OrderParams | string) {
  const [data, setData] = useState<Order | Order[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // `useCallback` para memorizar la función de fetching.
  // Se volverá a crear solo si `params` cambia.
  const fetchOrders = useCallback(async () => {
    setLoading(true);
    let url = "";

    // 1. Lógica robusta para construir la URL
    const basePath = "/orders/";
    
    if (typeof params === 'string') {
      // Caso: se pasa un ID de orden directamente como string
      url = `${basePath}${params}`;
    } else if (params && typeof params === 'object') {
      if (params.orderId) {
        // Caso: se pasa un objeto que contiene un ID de orden
        url = `${basePath}${params.orderId}`;
      } else {
        // Caso: se pasa un objeto con filtros para una lista de órdenes
        const queryParams = new URLSearchParams();
        if (params.limit) queryParams.append('limit', String(params.limit));
        if (params.start_date) queryParams.append('start_date', params.start_date);
        if (params.end_date) queryParams.append('end_date', params.end_date);
        if (params.photographer_id) queryParams.append('photographer_id', params.photographer_id);
        
        const queryString = queryParams.toString();
        url = queryString ? `${basePath}?${queryString}` : basePath;
      }
    } else {
      // Caso por defecto: listar todas las órdenes sin filtros
      url = basePath;
    }

    // 2. Ejecutar la petición
    try {
      const result = await apiFetch<Order | Order[]>(url);
      setData(result);
      setError(null);
    } catch (err: any) {
      setError(err.message);
      console.error(`Error fetching from URL: ${url}`, err);
    } finally {
      setLoading(false);
    }
  }, [params]);

  // 3. `useEffect` para llamar a `fetchOrders` cuando cambie (o en el montaje inicial)
  useEffect(() => {
    fetchOrders();
  }, [fetchOrders]);

  // --- Funciones auxiliares (restauradas y mantenidas) ---

  async function updateOrder(id: string, orderData: Partial<Order>) {
    try {
      return await apiFetch<Order>(`/orders/${id}`, {
        method: "PUT",
        body: JSON.stringify(orderData),
      });
    } catch (err: any) {
      setError(err.message);
      throw err;
    }
  }

  async function updateOrderStatus(id: string, newStatus: string, paymentMethod?: string) {
    try {
      const query = new URLSearchParams({ new_status: newStatus });
      if (paymentMethod) {
        query.append("payment_method", paymentMethod);
      }
      return await apiFetch(`/orders/${id}/status?${query.toString()}`, {
        method: "PUT",
      });
    } catch (err: any) {
      setError(err.message);
      throw err;
    }
  }

  async function getMyOrders() {
    try {
      return await apiFetch<Order[]>("/orders/my-orders");
    } catch (err: any) {
      setError(err.message);
      throw err;
    }
  }

  async function sendOrderEmail(id: string, email: string) {
    try {
      return await apiFetch(`/orders/${id}/send-email`, {
        method: "POST",
        body: JSON.stringify({ email }),
      });
    } catch (err: any) {
      setError(err.message);
      throw err;
    }
  }

  async function generateQRCode(id: string) {
    try {
      return await apiFetch(`/orders/${id}/qr-code`);
    } catch (err: any) {
      setError(err.message);
      throw err;
    }
  }

  async function deleteOrder(id: string) {
    try {
      await apiFetch(`/orders/${id}`, {
        method: "DELETE",
      });
    } catch (err: any) {
      setError(err.message);
      throw err;
    }
  }

  // 4. Devolver la API del hook
  return {
    data,
    loading,
    error,
    refetch: fetchOrders,
    updateOrder,
    updateOrderStatus,
    getMyOrders,
    sendOrderEmail,
    generateQRCode,
    deleteOrder,
  };
}