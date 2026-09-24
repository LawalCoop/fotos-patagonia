"use client";

import { AlertCircle, Loader2 } from "lucide-react";
import type { UploadingPhoto } from "@/lib/types";
import { summarizeUploads } from "@/lib/upload-queue";

interface UploadProgressPanelProps {
  items: UploadingPhoto[];
  total: number;
}

// Panel de alto fijo con el avance de la subida. Reemplaza la grilla de una
// tarjeta por foto: con lotes grandes esa grilla dibujaba cientos de originales
// a la vez y la pestaña se quedaba sin memoria.
export function UploadProgressPanel({ items, total }: UploadProgressPanelProps) {
  if (items.length === 0) return null;
  const { total: count, done, uploading, failed, percent, previews } =
    summarizeUploads(items, total);

  return (
    <div
      className="mb-6 rounded-2xl border-2 border-primary/40 bg-muted p-4"
      data-testid="upload-progress-panel"
    >
      <div className="flex items-center gap-3">
        {uploading > 0 ? (
          <Loader2 className="h-5 w-5 animate-spin text-primary" />
        ) : (
          <AlertCircle className="h-5 w-5 text-destructive" />
        )}
        <p className="font-semibold">
          {uploading > 0
            ? `Subiendo ${done} de ${count} fotos`
            : `Subida terminada: ${done} de ${count} fotos`}
        </p>
        <span className="ml-auto text-sm text-muted-foreground">{percent}%</span>
      </div>

      <div className="mt-3 h-2 overflow-hidden rounded-full bg-background">
        <div
          className="h-full rounded-full bg-primary transition-[width]"
          style={{ width: `${percent}%` }}
        />
      </div>

      {previews.length > 0 && (
        <div className="mt-3 flex gap-2">
          {previews.map((photo) => (
            <img
              key={photo.tempId}
              src={photo.previewUrl || "/placeholder.svg"}
              alt="Subiendo foto"
              loading="lazy"
              decoding="async"
              className="h-14 w-14 rounded-lg object-cover opacity-80"
            />
          ))}
          {uploading > previews.length && (
            <div className="flex h-14 items-center px-2 text-sm text-muted-foreground">
              + {uploading - previews.length} en cola
            </div>
          )}
        </div>
      )}

      {failed > 0 && (
        <p className="mt-3 text-sm text-destructive">
          {failed} foto{failed !== 1 ? "s" : ""} no se pudieron subir. Podés
          reintentar desde el modal.
        </p>
      )}
    </div>
  );
}
