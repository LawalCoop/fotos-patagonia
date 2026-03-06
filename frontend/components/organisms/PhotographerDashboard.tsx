"use client";

import { useEffect, useState } from "react";
import { usePhotographerEarningsByOrder } from "@/hooks/earnings/usePhotographerEarningsByOrder";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Card, CardContent, CardHeader, CardTitle, CardFooter, CardDescription } from "@/components/ui/card";
import { formatDateTime } from "@/lib/datetime";
import { format } from "date-fns";
import { Terminal, TrendingUp, DollarSign, Camera, Calendar } from "lucide-react";
import { PhotoEarningsSummaryTable } from "./PhotoEarningsSummaryTable";
import { PaginationControls } from "../molecules/PaginationControls";
import { usePhotographers } from "@/hooks/photographers/usePhotographers";
import { PhotographerEarningsSummary } from "@/lib/types";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { DateRange } from "react-day-picker";

interface PhotographerDashboardProps {
  photographerId: number;
}

export function PhotographerDashboard({ photographerId }: PhotographerDashboardProps) {
  const [startDate, setStartDate] = useState<string>("");
  const [endDate, setEndDate] = useState<string>("");
  const [appliedDateRange, setAppliedDateRange] = useState<DateRange | undefined>();

  const { earnings, loading, error, page, setPage, total, limit } = usePhotographerEarningsByOrder(
    photographerId,
    appliedDateRange
  );
  
  const { getPhotographerEarningsSummary } = usePhotographers();
  const [summary, setSummary] = useState<PhotographerEarningsSummary | null>(null);

  useEffect(() => {
    const params: { startDate?: string; endDate?: string } = {};
    if (appliedDateRange?.from) {
      params.startDate = format(appliedDateRange.from, "yyyy-MM-dd");
    }
    if (appliedDateRange?.to) {
      params.endDate = format(appliedDateRange.to, "yyyy-MM-dd");
    }

    getPhotographerEarningsSummary(photographerId, params)
      .then((res) => setSummary(res as any))
      .catch(console.error);
  }, [photographerId, getPhotographerEarningsSummary, appliedDateRange]);

  const handleApplyFilters = () => {
    const fromDate = startDate ? new Date(startDate) : undefined;
    const toDate = endDate ? new Date(endDate) : undefined;
    setAppliedDateRange({ from: fromDate, to: toDate });
    setPage(1);
  };

  const handleClearFilters = () => {
    setStartDate("");
    setEndDate("");
    setAppliedDateRange(undefined);
    setPage(1);
  };

  return (
    <div className="space-y-8">
      {/* Tarjetas de Resumen General */}
      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Ventas Totales (Nominales)</CardTitle>
            <Camera className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{summary?.total_photos_sold || 0}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-primary">Ventas Totales (Reales)</CardTitle>
            <TrendingUp className="h-4 w-4 text-primary" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-primary">
              {summary?.total_real_photos_sold?.toFixed(1) || "0.0"}
            </div>
            <CardDescription className="text-xs mt-1">Ajustado por descuentos/combos</CardDescription>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-green-600">Ganancias Netas</CardTitle>
            <DollarSign className="h-4 w-4 text-green-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-green-600">
              ${summary?.total_earnings.toFixed(2) || "0.00"}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Detalle de Ganancias Individuales (Ancho Completo) */}
      <Card>
        <CardHeader>
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div>
              <CardTitle>Detalle de Ganancias Recientes</CardTitle>
              <CardDescription>Agrupado por número de orden de compra</CardDescription>
            </div>
            
            <div className="flex flex-wrap items-end gap-3 rounded-lg border border-gray-100 bg-gray-50/50 p-3">
              <div className="space-y-1.5">
                <Label htmlFor="start-date" className="text-xs text-muted-foreground">Desde</Label>
                <div className="relative">
                  <Input
                    id="start-date"
                    type="date"
                    value={startDate}
                    onChange={(e) => setStartDate(e.target.value)}
                    className="h-8 bg-white"
                  />
                </div>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="end-date" className="text-xs text-muted-foreground">Hasta</Label>
                <div className="relative">
                  <Input
                    id="end-date"
                    type="date"
                    value={endDate}
                    onChange={(e) => setEndDate(e.target.value)}
                    className="h-8 bg-white"
                  />
                </div>
              </div>
              <div className="flex gap-2 h-8">
                <Button onClick={handleApplyFilters} size="sm" variant="default" className="h-full">
                  Filtrar
                </Button>
                {(startDate || endDate) && (
                  <Button onClick={handleClearFilters} size="sm" variant="outline" className="h-full">
                    Limpiar
                  </Button>
                )}
              </div>
              {appliedDateRange && (appliedDateRange.from || appliedDateRange.to) && summary && (
                <div className="ml-2 flex h-8 items-center rounded bg-green-50 px-3 text-sm font-semibold text-green-700 border border-green-200">
                  Total Filtrado: ${summary.total_earnings?.toFixed(2) || "0.00"}
                </div>
              )}
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {loading && page === 1 && <div>Cargando detalle de ganancias...</div>}
          {error && (
            <div className="text-red-500 p-4 rounded-lg border border-red-400 bg-red-50 text-sm flex items-center gap-2">
              <Terminal className="h-4 w-4" />
              <span>Error al cargar el detalle: {error}</span>
            </div>
          )}
          {!loading && !error && earnings.length === 0 && (
            <p>Aún no tienes ganancias registradas para este período.</p>
          )}
          {!loading && !error && earnings.length > 0 && (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Fecha</TableHead>
                  <TableHead>Nº Orden</TableHead>
                  <TableHead className="text-center" title="Fotos totales en la orden">Totales Orden</TableHead>
                  <TableHead className="text-center">Tus Fotos</TableHead>
                  <TableHead className="text-center" title="Ajustado por descuentos">Tus Fotos (Reales)</TableHead>
                  <TableHead className="text-center">% Orden</TableHead>
                  <TableHead className="text-right">Ganancia (Neta)</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {earnings.map((earning) => (
                  <TableRow key={earning.order_id}>
                    <TableCell>
                      {formatDateTime(earning.created_at, { month: "short", includeYear: false })}
                    </TableCell>
                    <TableCell>#{earning.order_id}</TableCell>
                    <TableCell className="text-center">{earning.order_total_photos}</TableCell>
                    <TableCell className="text-center">{earning.total_photos}</TableCell>
                    <TableCell className="text-center font-semibold text-primary">{earning.real_photos_sold?.toFixed(1)}</TableCell>
                    <TableCell className="text-center font-medium">
                      {earning.percentage_in_order?.toFixed(0)}%
                    </TableCell>
                    <TableCell className="text-right font-medium text-green-600">${earning.total_earnings?.toFixed(2)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
        <CardFooter>
          <PaginationControls
            currentPage={page}
            totalItems={total}
            itemsPerPage={limit}
            onPageChange={setPage}
          />
        </CardFooter>
      </Card>

      <div className="grid gap-8 md:grid-cols-2">
        {/* Resumen Agrupado por Foto */}
        <PhotoEarningsSummaryTable photographerId={photographerId} />
      </div>
    </div>
  );
}
