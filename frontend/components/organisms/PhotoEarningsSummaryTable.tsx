"use client";

import { usePhotographerEarningsSummary } from "@/hooks/earnings/usePhotographerEarningsSummary";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from "@/components/ui/card";
import { AlertTriangle } from "lucide-react";
import { PaginationControls } from "../molecules/PaginationControls";

interface PhotoEarningsSummaryTableProps {
  photographerId: number;
}

export function PhotoEarningsSummaryTable({ photographerId }: PhotoEarningsSummaryTableProps) {
  const { summary, loading, error, page, setPage, total, limit } = usePhotographerEarningsSummary(photographerId);

  if (loading && page === 1) {
    return <div>Cargando resumen por foto...</div>;
  }

  if (error) {
    return (
      <div className="text-red-500 p-4 rounded-lg border border-red-400 bg-red-50 text-sm flex items-center gap-2">
        <AlertTriangle className="h-4 w-4" />
        <span>Error al cargar el resumen por foto: {error}</span>
      </div>
    );
  }

  if (summary.length === 0) {
    return null; // Don't render the card if there's no data
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Mis Fotos Más Rentables</CardTitle>
        <CardDescription>
          Un resumen de tus fotos ordenadas por las ganancias que han generado.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Foto</TableHead>
              <TableHead className="text-center">Ventas Nominales</TableHead>
              <TableHead className="text-center">Ventas Reales</TableHead>
              <TableHead className="text-right">Ganancia Total</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {summary.map((item) => (
              <TableRow key={item.photo_id}>
                <TableCell className="font-medium">{item.photo_filename}</TableCell>
                <TableCell className="text-center">{item.times_sold}</TableCell>
                <TableCell className="text-center font-semibold text-primary">
                  {item.real_photos_sold.toFixed(1)}
                </TableCell>
                <TableCell className="text-right font-medium">${item.total_earnings.toFixed(2)}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
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
  );
}
