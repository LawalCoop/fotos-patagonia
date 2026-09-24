import { describe, it, expect } from "vitest";
import type { UploadingPhoto } from "@/lib/types";
import {
  PANEL_PREVIEW_LIMIT,
  applyUploadProgress,
  isAtTop,
  prependUnique,
  resolveUploads,
  summarizeUploads,
} from "./upload-queue";

function placeholders(n: number): UploadingPhoto[] {
  return Array.from({ length: n }, (_, i) => ({
    tempId: `t${i}`,
    previewUrl: `blob:mock-${i}`,
    status: "uploading" as const,
    progress: 0,
  }));
}

describe("upload-queue", () => {
  it("aplica el progreso solo a los placeholders indicados y respeta los errores", () => {
    const items = placeholders(3);
    items[2] = { ...items[2], status: "error", progress: undefined };
    const next = applyUploadProgress(items, ["t0", "t2"], 40);

    expect(next[0].progress).toBe(40);
    expect(next[1].progress).toBe(0);
    expect(next[2]).toEqual(items[2]); // un error no vuelve a "subiendo"
  });

  it("actualizar el progreso de 1200 fotos muchas veces no traba (O(n), no O(n²))", () => {
    const items = placeholders(1200);
    const ids = items.map((p) => p.tempId);

    const startedAt = performance.now();
    let current = items;
    for (let tick = 0; tick < 100; tick++) {
      current = applyUploadProgress(current, ids, tick);
    }
    const elapsed = performance.now() - startedAt;

    expect(current.every((p) => p.progress === 99)).toBe(true);
    // Con includes() eran ~144 millones de comparaciones; con Set, ~120 mil.
    expect(elapsed).toBeLessThan(500);
  });

  it("saca los subidos y marca los fallidos", () => {
    const next = resolveUploads(placeholders(4), ["t0", "t1"], ["t3"]);

    expect(next.map((p) => p.tempId)).toEqual(["t2", "t3"]);
    expect(next[0].status).toBe("uploading");
    expect(next[1].status).toBe("error");
    expect(next[1].progress).toBeUndefined();
  });

  it("resume una subida grande con pocas miniaturas", () => {
    const items = resolveUploads(placeholders(1200), ["t0", "t1", "t2"], ["t3"]);
    const summary = summarizeUploads(items, 1200);

    expect(summary.total).toBe(1200);
    expect(summary.done).toBe(3);
    expect(summary.failed).toBe(1);
    expect(summary.uploading).toBe(1196);
    expect(summary.percent).toBe(0);
    expect(summary.previews).toHaveLength(PANEL_PREVIEW_LIMIT);
    expect(summary.previews.every((p) => p.status !== "error")).toBe(true);
  });

  it("el total nunca queda por debajo de lo pendiente", () => {
    const summary = summarizeUploads(placeholders(10), 0);
    expect(summary.total).toBe(10);
    expect(summary.done).toBe(0);
  });

  it("agrega fotos nuevas al principio sin duplicar", () => {
    const prev = [{ id: 1 }, { id: 2 }];
    expect(prependUnique(prev, [{ id: 3 }, { id: 2 }, { id: 3 }])).toEqual([
      { id: 3 },
      { id: 1 },
      { id: 2 },
    ]);
    // Sin nada nuevo devuelve la misma referencia (evita re-render).
    expect(prependUnique(prev, [{ id: 1 }])).toBe(prev);
  });

  it("considera 'arriba de todo' solo cerca del inicio", () => {
    expect(isAtTop(0)).toBe(true);
    expect(isAtTop(undefined)).toBe(true);
    expect(isAtTop(8)).toBe(true);
    expect(isAtTop(300)).toBe(false);
  });
});
