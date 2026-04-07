"use client";

import { useMemo, useState, useEffect } from "react";
import Link from "next/link";
import {
  Package,
  DollarSign,
  Camera,
  TrendingUp,
  ArrowRight,
} from "lucide-react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import type { Order } from "@/lib/types";
import { isAdmin } from "@/lib/types";
import { useAuthStore } from "@/lib/store";
import { useOrders } from "@/hooks/orders/useOrders";
import { PhotographerDashboard } from "@/components/organisms/PhotographerDashboard";
import { RecentSessions } from "@/components/organisms/RecentSessions";
import { useAdminDashboard } from "@/hooks/stats/useAdminDashboard";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { usePhotographers } from "@/hooks/photographers/usePhotographers";

export default function AdminDashboard() {
  const user = useAuthStore((state) => state.user);

  // --- FILTERS STATE ---
  const [startDateInput, setStartDateInput] = useState<string>("");
  const [endDateInput, setEndDateInput] = useState<string>("");
  const [selectedPhotographerId, setSelectedPhotographerId] = useState<string>("");

  const [appliedFilters, setAppliedFilters] = useState({
    startDate: "",
    endDate: "",
    photographerId: "",
  });
  const [hasAutoFiltered, setHasAutoFiltered] = useState(false);

  const { data: dashboardData, loading: dashboardLoading } = useAdminDashboard(appliedFilters);

  const orderFilters = useMemo(() => {
    const filters: any = { limit: 5 };
    if (appliedFilters.startDate) {
      filters.start_date = appliedFilters.startDate;
    }
    if (appliedFilters.endDate) {
      filters.end_date = appliedFilters.endDate;
    }
    if (appliedFilters.photographerId) {
      filters.photographer_id = appliedFilters.photographerId;
    }
    return filters;
  }, [appliedFilters]);

  const { data: ordersData, loading: ordersLoading } = useOrders(orderFilters);
  const { photographers, loading: photographersLoading } = usePhotographers();

  const photographerId = useMemo(
    () => user?.photographer?.id ?? user?.photographer_id ?? null,
    [user]
  );

  const orders: Order[] = useMemo(
    () => (Array.isArray(ordersData) ? ordersData : ordersData ? [ordersData] : []),
    [ordersData]
  );

  // Auto-filter by the most recent order date on first load
  useEffect(() => {
    if (!appliedFilters.startDate && !appliedFilters.endDate && orders.length > 0 && !hasAutoFiltered) {
      const lastDate = orders[0].created_at?.split("T")[0];
      if (lastDate) {
        setStartDateInput(lastDate);
        setEndDateInput(lastDate);
        setAppliedFilters(prev => ({ ...prev, startDate: lastDate, endDate: lastDate }));
        setHasAutoFiltered(true);
      }
    }
  }, [orders, appliedFilters.startDate, appliedFilters.endDate, hasAutoFiltered]);

  const userIsAdmin = isAdmin(user);
  
  const handleApplyFilters = () => {
    setAppliedFilters({
      startDate: startDateInput,
      endDate: endDateInput,
      photographerId: selectedPhotographerId === "all" ? "" : selectedPhotographerId,
    });
  };

  const stats = useMemo(() => {
    if (!dashboardData) {
      return { totalOrders: 0, totalPhotos: 0, totalPhotosSold: 0, totalRealPhotos: 0, totalRevenue: 0, ordersByPaymentMethod: {} };
    }
    return {
      totalOrders: dashboardData.total_orders,
      totalPhotos: dashboardData.total_photos,
      totalPhotosSold: dashboardData.total_photos_sold,
      totalRealPhotos: dashboardData.total_real_photos_sold,
      totalRevenue: dashboardData.total_gross_revenue,
      ordersByPaymentMethod: dashboardData.orders_by_payment_method,
    };
    }, [dashboardData]);

    const isPhotographer = !userIsAdmin && !!photographerId;

    if (isPhotographer && photographerId) {
    return <PhotographerDashboard photographerId={photographerId} />;
    }

    const isLoading = dashboardLoading;

    if (isLoading) {
    return (
      <div className="container mx-auto px-4 py-8">
        <div className="mb-8">
          <Skeleton className="h-10 w-3/4" />
          <Skeleton className="h-4 w-1/2 mt-2" />
        </div>
        <div className="mb-8 grid gap-6 md:grid-cols-2 lg:grid-cols-5">
          <Skeleton className="h-28" />
          <Skeleton className="h-28" />
          <Skeleton className="h-28" />
          <Skeleton className="h-28" />
          <Skeleton className="h-28" />
        </div>
        <div className="mb-8 grid gap-6 md:grid-cols-2 lg:grid-cols-3">
          <Skeleton className="h-40" />
          <Skeleton className="h-40" />
          <Skeleton className="h-40" />
        </div>
      </div>
    );
    }

    return (
    <div className="container mx-auto px-4 py-8">
      <div className="mb-8">
        <h1 className="mb-2 text-4xl font-bold">Panel de Administración</h1>
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-2">
          <p className="text-muted-foreground">
            Gestiona pedidos, fotos y contenido de Fotos Patagonia
          </p>
          <div className="flex items-center gap-2 text-xs text-muted-foreground bg-muted/50 px-3 py-1 rounded-full w-fit">
            <Camera className="h-3 w-3" />
            <span>Total de fotos en el sistema: <span className="font-semibold text-foreground">{stats.totalPhotos}</span></span>
          </div>
        </div>
      </div>

      <div className="mb-6 flex flex-wrap gap-4 items-end">
        <div>
          <label className="block text-sm font-medium mb-1">Fecha desde</label>
          <input
            type="date"
            className="border rounded-lg p-2 h-10"
            value={startDateInput}
            onChange={(e) => setStartDateInput(e.target.value)}
          />
        </div>
        <div>
          <label className="block text-sm font-medium mb-1">Fecha hasta</label>
          <input
            type="date"
            className="border rounded-lg p-2 h-10"
            value={endDateInput}
            onChange={(e) => setEndDateInput(e.target.value)}
          />
        </div>
        <div>
          <label className="block text-sm font-medium mb-1">Fotógrafo</label>
          <Select
            value={selectedPhotographerId}
            onValueChange={setSelectedPhotographerId}
            disabled={photographersLoading}
          >
            <SelectTrigger className="w-full md:w-[200px] h-10">
              <SelectValue placeholder="Seleccionar fotógrafo" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos los fotógrafos</SelectItem>
              {photographers.map((ph) => (
                <SelectItem key={ph.id} value={String(ph.id)}>
                  {ph.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <Button onClick={handleApplyFilters} disabled={isLoading} className="h-10">
          {isLoading ? "Cargando..." : "Aplicar"}
        </Button>
      </div>

      <div className="mb-8 grid gap-6 md:grid-cols-2 lg:grid-cols-5">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Total Pedidos</CardTitle>
            <Package className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold">{stats.totalOrders}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Fotos Totales Vendidas</CardTitle>
            <Camera className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold">{stats.totalPhotosSold}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Fotos Reales Vendidas</CardTitle>
            <TrendingUp className="h-4 w-4 text-primary" />
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-primary">{stats.totalRealPhotos.toFixed(1)}</div>
            <p className="text-xs text-muted-foreground mt-1">Ajustado por combos/desc.</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Ingresos Totales</CardTitle>
            <DollarSign className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold">${stats.totalRevenue.toLocaleString()}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Ventas por medio de pago</CardTitle>
            <TrendingUp className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            {stats.ordersByPaymentMethod && Object.keys(stats.ordersByPaymentMethod).length > 0 ? (
              Object.entries(stats.ordersByPaymentMethod).map(([method, count]) => (
                <div key={method} className="flex justify-between items-center text-sm">
                  <span className="capitalize">{method}</span>
                  <span className="font-bold">{count}</span>
                </div>
              ))
            ) : (
              <p className="text-sm text-muted-foreground">No hay datos</p>
            )}
          </CardContent>
        </Card>
      </div>

      <div className="mb-8 grid gap-6 md:grid-cols-2 lg:grid-cols-3">
        <Card>
          <CardHeader>
            <CardTitle>Gestión de Pedidos</CardTitle>
            <CardDescription>Ver y administrar todos los pedidos</CardDescription>
          </CardHeader>
          <CardContent>
            <Link href="/admin/pedidos">
              <Button className="w-full">
                Ver Pedidos <ArrowRight className="ml-2 h-4 w-4" />
              </Button>
            </Link>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Gestión de Fotos</CardTitle>
            <CardDescription>Administrar catálogo de fotos</CardDescription>
          </CardHeader>
          <CardContent>
            <Link href="/admin/fotos">
              <Button className="w-full">
                Ver Fotos <ArrowRight className="ml-2 h-4 w-4" />
              </Button>
            </Link>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Gestión de Contenidos (ABM)</CardTitle>
            <CardDescription>Administrar álbumes, fotógrafos, tags y códigos</CardDescription>
          </CardHeader>
          <CardContent>
            <Link href="/admin/abm">
              <Button className="w-full">
                Gestionar Contenido <ArrowRight className="ml-2 h-4 w-4" />
              </Button>
            </Link>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-6 md:grid-cols-2">
        <Card className="md:col-span-1">
          <CardHeader>
            <CardTitle>Pedidos Recientes</CardTitle>
          </CardHeader>
          <CardContent>
            {ordersLoading ? (
              <div>Cargando...</div>
            ) : (
              orders.slice(0, 5).map((order) => (
                <div key={order.id} className="flex items-center justify-between mb-2 p-2 border-b">
                  <div>
                    <p className="font-semibold">Pedido #{order.id}</p>
                    <p className="text-sm text-muted-foreground">{order.customer_email}</p>
                  </div>
                  <div className="text-right">
                    <p className="font-semibold">${order.total}</p>
                    <p className="text-sm capitalize">{order.order_status}</p>
                  </div>
                </div>
              ))
            )}
          </CardContent>
        </Card>
        <RecentSessions />
      </div>
    </div>
  );
}
