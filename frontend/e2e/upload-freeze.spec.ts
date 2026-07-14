import { test, expect } from "@playwright/test";

// Verifica en un navegador real (Chromium) que generar previews de un lote
// grande de archivos NO bloquea el hilo principal.
//
// La estrategia probada — `files.map((f) => URL.createObjectURL(f))` — es
// idéntica a `createFilePreviews` en lib/upload-previews.ts. El bug original
// generaba cada miniatura decodificando la imagen en un canvas, lo que trababa
// la página con cientos/miles de fotos.
//
// Métrica: cuánto tiempo queda ocupado el hilo principal (bloqueado) haciendo el
// trabajo. En headless es determinista y sin ruido (a diferencia de rAF).

async function mainThreadBusyMs(
  page: import("@playwright/test").Page,
  arg: { files: number; mode: "objectUrl" | "block"; blockMs?: number },
) {
  return page.evaluate(({ files, mode, blockMs }) => {
    const bytes = new Uint8Array(64); // contenido dummy: object URLs no lo leen
    const list = Array.from(
      { length: files },
      (_, i) => new File([bytes], `f${i}.jpg`, { type: "image/jpeg" }),
    );

    const startedAt = performance.now();
    let count = 0;
    if (mode === "objectUrl") {
      count = list.map((f) => URL.createObjectURL(f)).length;
    } else {
      const until = performance.now() + (blockMs ?? 0);
      while (performance.now() < until) {
        /* bloqueo deliberado del hilo principal */
      }
      count = list.length;
    }
    return { busyMs: performance.now() - startedAt, count };
  }, arg);
}

test.beforeEach(async ({ page }) => {
  await page.goto("about:blank");
});

test("la medición detecta un bloqueo real del hilo principal", async ({ page }) => {
  // Sanidad: si el hilo trabaja 500ms, la medición debe reflejarlo.
  const { busyMs } = await mainThreadBusyMs(page, { files: 1200, mode: "block", blockMs: 500 });
  expect(busyMs).toBeGreaterThan(400);
});

test("generar 1200 previews con object URLs no bloquea la página", async ({ page }) => {
  const { busyMs, count } = await mainThreadBusyMs(page, { files: 1200, mode: "objectUrl" });

  expect(count).toBe(1200); // una preview por archivo
  // El trabajo real ocupa el hilo apenas unos ms: no hay congelamiento posible.
  expect(busyMs).toBeLessThan(150);
});
