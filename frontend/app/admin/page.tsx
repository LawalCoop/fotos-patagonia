"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  Package,
  DollarSign,
  Camera,
  TrendingUp,
  ArrowRight,
  User as UserIcon,
} from "lucide-react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import type { Order, PhotographerEarningsSummary } from "@/lib/types";
import { getUserRoleName, isAdmin } from "@/lib/types";
import { usePhotos } from "@/hooks/photos/usePhotos";
import { useAuthStore } from "@/lib/store";
import { usePhotographers } from "@/hooks/photographers/usePhotographers";
import { useEarningsSummaryAll } from "@/hooks/earnings/useEarningsSummaryAll";
import { useOrders } from "@/hooks/orders/useOrders";
import { PhotographerDashboard } from "@/components/organisms/PhotographerDashboard";
import { RecentSessions } from "@/components/organisms/RecentSessions";

export default function AdminDashboard() {
  const user = useAuthStore((state) => state.user);
  const { photos, loading: photosLoading } = usePhotos();
  const { data: ordersData, loading: ordersLoading } = useOrders();
  const { photographers, loading: photographersLoading } = usePhotographers();

  const photographerId = useMemo(
    () => user?.photographer?.id ?? user?.photographer_id ?? null,
    [user]
  );

  const orders: Order[] = useMemo(
    () => (Array.isArray(ordersData) ? ordersData : ordersData ? [ordersData] : []),
    [ordersData]
  );

  const roleName = getUserRoleName(user)?.toLowerCase();
  const userIsAdmin = isAdmin(user);

  // --- FILTERS STATE ---
  const [startDateInput, setStartDateInput] = useState<string>("");
  const [endDateInput, setEndDateInput] = useState<string>("");
  const [selectedPhotographerId, setSelectedPhotographerId] = useState<string>("");

  const [appliedStartDate, setAppliedStartDate] = useState<string | undefined>(undefined);
  const [appliedEndDate, setAppliedEndDate] = useState<string | undefined>(undefined);
  const [appliedPhotographerId, setAppliedPhotographerId] = useState<string>("");

  // --- DATA FETCHING ---
  const { data: earningsAll, loading: earningsAllLoading } = useEarningsSummaryAll(
    appliedStartDate,
    appliedEndDate,
    { enabled: userIsAdmin && !appliedPhotographerId }
  );

  const { getPhotographerEarningsSummary } = usePhotographers();
  const [
    photographerSummary,
    setPhotographerSummary,
  ] = useState<PhotographerEarningsSummary | null>(null);
  const [photographerSummaryLoading, setPhotographerSummaryLoading] = useState(false);

  // --- LOGIC ---
  const handleApplyFilters = () => {
    setAppliedStartDate(startDateInput || undefined);
    setAppliedEndDate(endDateInput || undefined);
    setAppliedPhotographerId(selectedPhotographerId === "all" ? "" : selectedPhotographerId);
  };

  useEffect(() => {
    const fetchSummary = async () => {
      if (appliedPhotographerId && userIsAdmin) {
        setPhotographerSummaryLoading(true);
        try {
          const summary = await getPhotographerEarningsSummary(
            parseInt(appliedPhotographerId, 10),
            {
              startDate: appliedStartDate,
              endDate: appliedEndDate,
            }
          );
          setPhotographerSummary(summary);
        } catch (error) {
          console.error("Error fetching photographer summary:", error);
          setPhotographerSummary(null);
        } finally {
          setPhotographerSummaryLoading(false);
        }
      } else {
        setPhotographerSummary(null);
      }
    };

    fetchSummary();
  }, [
    appliedPhotographerId,
    appliedStartDate,
    appliedEndDate,
    userIsAdmin,
    getPhotographerEarningsSummary,
  ]);
  
  const filteredOrders = useMemo(() => {
    if (ordersLoading) return [];
    if (!userIsAdmin) return []; // Simplified for admin view

    if (!appliedPhotographerId) return orders;

    const phId = parseInt(appliedPhotographerId, 10);
    return orders.filter(order => 
      order.items?.some(item => item.photo?.photographer_id === phId)
    );
  }, [orders, ordersLoading, userIsAdmin, appliedPhotographerId]);

  const stats = useMemo(() => {
    if (ordersLoading || photosLoading)
      return { totalOrders: 0, pendingOrders: 0, totalPhotos: 0, totalRevenue: 0 };
    
    const phId = appliedPhotographerId ? parseInt(appliedPhotographerId, 10) : null;

    const currentOrders = phId
      ? orders.filter(o => o.items?.some(item => item.photo?.photographer_id === phId))
      : orders;

    const pendingOrders = currentOrders.filter(
      (o) => o.order_status === "pending" || o.order_status === "paid"
    ).length;

    const totalPhotos = phId
      ? photos.filter((p) => p.photographer_id === phId).length
      : photos.length;

    let totalRevenue = 0;
    if (phId) {
      totalRevenue = photographerSummary?.total_earnings ?? 0;
    } else {
      totalRevenue = earningsAll?.reduce((sum, r) => sum + r.total_earnings, 0) || 0;
    }
    
    return {
      totalOrders: currentOrders.length,
      pendingOrders,
      totalPhotos,
      totalRevenue,
    };
  }, [
    orders,
    photos,
    photosLoading,
    ordersLoading,
    appliedPhotographerId,
    photographerSummary,
    earningsAll,
  ]);

  const isPhotographer = !userIsAdmin && !!photographerId;

  if (isPhotographer && photographerId) {
    return <PhotographerDashboard photographerId={photographerId} />;
  }
  
  const isLoading = earningsAllLoading || photographerSummaryLoading;

  return (
    <div className="container mx-auto px-4 py-8">
      <div className="mb-8">
        <h1 className="mb-2 text-4xl font-bold">Panel de Administración</h1>
        <p className="text-muted-foreground">
          Gestiona pedidos, fotos y contenido de Fotos Patagonia
        </p>
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

      <div className="mb-8 grid gap-6 md:grid-cols-2 lg:grid-cols-4">
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
            <CardTitle className="text-sm font-medium">Ingresos Totales</CardTitle>
            <DollarSign className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold">
              ${stats.totalRevenue.toLocaleString()}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Pedidos Pendientes</CardTitle>
            <TrendingUp className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold">{stats.pendingOrders}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Total Fotos</CardTitle>
            <Camera className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold">{stats.totalPhotos}</div>
          </CardContent>
        </Card>
      </div>

      <div className="mb-8 grid gap-6 md:grid-cols-2">
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
            {filteredOrders.slice(0, 5).map((order) => (
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
            ))}
          </CardContent>
        </Card>
        <RecentSessions />
      </div>
    </div>
  );
}
