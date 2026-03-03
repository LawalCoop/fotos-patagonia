"use client";

import { useState, useEffect, useCallback } from "react";
import { apiFetch } from "@/lib/api";
import { Order } from "@/lib/types";

export function useOrders(orderId?: string) {
  const [data, setData] = useState<Order | Order[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchOrders = useCallback(async () => {
    try {
      setLoading(true);

      const url = orderId ? `/orders/${orderId}` : `/orders/`;
      const result = await apiFetch<Order | Order[]>(url);

      setData(result);
      setError(null);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [orderId]);

  // NOTA: Para crear una orden, usa POST /checkout/create-order (ver useCheckout.ts)
  // Este endpoint POST /orders/ NO existe en el OpenAPI actual

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

  async function updateOrderStatus(
    id: string,
    newStatus: string,
    paymentMethod?: string
  ) {
    try {
      // OpenAPI: PUT /orders/{order_id}/status?new_status=X&payment_method=Y
      const params = new URLSearchParams();
      params.append("new_status", newStatus);
      if (paymentMethod) {
        params.append("payment_method", paymentMethod);
      }

      return await apiFetch(`/orders/${id}/status?${params.toString()}`, {
        method: "PUT",
      });
    } catch (err: any) {
      setError(err.message);
      throw err;
    }
  }

  /**
   * Obtiene las órdenes del usuario actual - OpenAPI: GET /orders/my-orders
   */
  async function getMyOrders() {
    try {
      return await apiFetch<Order[]>("/orders/my-orders");
    } catch (err: any) {
      setError(err.message);
      throw err;
    }
  }

  /**
   * Envía email con la orden - OpenAPI: POST /orders/{order_id}/send-email
   */
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

  /**
   * Genera código QR para la orden - OpenAPI: GET /orders/{order_id}/qr-code
   */
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

  // NOTA: Los siguientes endpoints NO existen en el OpenAPI actual:
  // - POST /orders/{id}/cancel (usa updateOrderStatus en su lugar)
  // - GET /orders/by-email/{email} (usa getMyOrders para usuario actual)
  // - GET /orders/{id}/download (debe implementarse en el backend si se necesita)

  useEffect(() => {
    fetchOrders();
  }, [orderId]);

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
