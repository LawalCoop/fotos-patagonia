// Estado de la subida en la galería del admin. Se mantiene puro (sin React)
// para poder testear el comportamiento con lotes grandes (1200+ fotos).

import type { UploadingPhoto } from "@/lib/types";

// Miniaturas que muestra el panel de progreso. El resto se sube igual, pero no
// se dibuja: decodificar cientos de originales a la vez agota la memoria de la
// pestaña y el navegador la recarga.
export const PANEL_PREVIEW_LIMIT = 6;

// Actualiza el progreso de los placeholders indicados. O(n): usa un Set en vez
// de `includes` (con 1200 fotos, includes era 1200×1200 por cada evento).
export function applyUploadProgress(
  items: UploadingPhoto[],
  tempIds: string[],
  progress: number
): UploadingPhoto[] {
  if (!tempIds.length) return items;
  const ids = new Set(tempIds);
  return items.map((photo) =>
    ids.has(photo.tempId) && photo.status !== "error"
      ? { ...photo, progress, status: "uploading" }
      : photo
  );
}

// Saca los placeholders subidos y marca como error los fallidos.
export function resolveUploads(
  items: UploadingPhoto[],
  success: string[],
  failed: string[]
): UploadingPhoto[] {
  const ok = new Set(success);
  const ko = new Set(failed);
  return items
    .filter((photo) => !ok.has(photo.tempId))
    .map((photo) =>
      ko.has(photo.tempId)
        ? { ...photo, status: "error", progress: undefined }
        : photo
    );
}

export interface UploadSummary {
  total: number;
  done: number;
  uploading: number;
  failed: number;
  percent: number;
  previews: UploadingPhoto[];
}

// Resumen para el panel: cuántas van, cuántas fallaron y unas pocas miniaturas.
// `total` es la cantidad de fotos de la subida en curso (las ya subidas ya no
// están en `items`).
export function summarizeUploads(
  items: UploadingPhoto[],
  total: number
): UploadSummary {
  let uploading = 0;
  let failed = 0;
  const previews: UploadingPhoto[] = [];
  for (const photo of items) {
    if (photo.status === "error") {
      failed += 1;
    } else {
      uploading += 1;
      if (previews.length < PANEL_PREVIEW_LIMIT) previews.push(photo);
    }
  }
  const safeTotal = Math.max(total, items.length);
  const done = Math.max(0, safeTotal - items.length);
  const percent = safeTotal ? Math.round((done / safeTotal) * 100) : 0;
  return { total: safeTotal, done, uploading, failed, percent, previews };
}

type WithId = { id: number };

// Agrega fotos nuevas al principio sin duplicar ids.
export function prependUnique<T extends WithId>(prev: T[], incoming: T[]): T[] {
  if (!incoming.length) return prev;
  const known = new Set(prev.map((p) => p.id));
  const fresh: T[] = [];
  for (const p of incoming) {
    if (!known.has(p.id)) {
      known.add(p.id);
      fresh.push(p);
    }
  }
  return fresh.length ? [...fresh, ...prev] : prev;
}

// Umbral (px) para considerar que la grilla está "arriba de todo". Si el usuario
// scrolleó más abajo, las fotos nuevas quedan en espera en vez de insertarse y
// correr lo que está mirando.
export const AT_TOP_THRESHOLD_PX = 8;

export function isAtTop(scrollTop: number | undefined | null): boolean {
  return (scrollTop ?? 0) <= AT_TOP_THRESHOLD_PX;
}
