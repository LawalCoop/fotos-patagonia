import { test, expect } from "@playwright/test";
import {
  APP_URL,
  albumPhotoCount,
  createFixture,
  loginAsAdmin,
  maxFrameGapMs,
  openUploadModal,
  photoFiles,
  type Fixture,
} from "./helpers";

// Subida de fotos desde /admin/fotos, contra el entorno de desarrollo completo.
// Las fotos se reparten por rangos para que cada test suba fotos que no
// existan todavía (el backend rechaza duplicados por hash).

test.describe.configure({ mode: "serial", timeout: 180_000 });

let fx: Fixture;

test.beforeAll(async ({ request }) => {
  fx = await createFixture(request, "subida");
});

test.beforeEach(async ({ page }) => {
  await loginAsAdmin(page);
});

test("un lote chico muestra el panel de progreso y las fotos llegan a la galería", async ({ page, request }) => {
  test.setTimeout(180_000);
  await openUploadModal(page, fx);
  await page.locator('input[type="file"]').setInputFiles(photoFiles(20, 0));
  await page.getByRole("button", { name: "Subir", exact: true }).click();

  const panel = page.getByTestId("upload-progress-panel");
  await expect(panel).toBeVisible();
  await expect(panel).toContainText(/de 20 fotos/);
  // Nunca una tarjeta por foto: como mucho las miniaturas del panel.
  expect(await page.locator('img[alt="Subiendo foto"]').count()).toBeLessThanOrEqual(6);

  // Al terminar, el panel desaparece y no quedan fallidas.
  await expect(panel).toBeHidden({ timeout: 150_000 });
  expect(await albumPhotoCount(request, fx.albumId)).toBe(20);

  // Y se ven en el álbum público.
  await page.goto(`${APP_URL}/albumes/${fx.albumId}`);
  await expect(page.getByText(fx.albumName).first()).toBeVisible();
});

test("las fotos nuevas no corren la grilla si el usuario scrolleó", async ({ page }) => {
  test.setTimeout(180_000);
  await page.goto(`${APP_URL}/admin/fotos`);
  const grid = page.locator("div.relative[style*='overflow: auto']").first();
  await expect(grid).toBeVisible();

  // Bajamos en la grilla y anotamos qué foto está arriba de la vista.
  await grid.evaluate((el) => el.scrollTo({ top: 600 }));
  const scrollBefore = await grid.evaluate((el) => el.scrollTop);
  expect(scrollBefore).toBeGreaterThan(100);

  await page.getByRole("button", { name: "Agregar Foto" }).click();
  await page.getByRole("combobox").filter({ hasText: /álbum/i }).click();
  await page.getByRole("option", { name: fx.albumName }).click();
  await page.getByRole("button", { name: new RegExp(fx.photographerName) }).click();
  await page.locator('input[type="file"]').setInputFiles(photoFiles(10, 20));
  await page.getByRole("button", { name: "Subir", exact: true }).click();

  // Las fotos nuevas quedan en espera detrás del aviso, sin mover la grilla.
  const pill = page.getByRole("button", { name: /fotos? nuevas?/ });
  await expect(pill).toBeVisible({ timeout: 150_000 });
  expect(await grid.evaluate((el) => el.scrollTop)).toBe(scrollBefore);

  // Al tocar el aviso se incorporan y la grilla vuelve arriba.
  await pill.click();
  await expect(pill).toBeHidden();
  await expect.poll(() => grid.evaluate((el) => el.scrollTop)).toBeLessThan(10);
});

test("1200 fotos: la página no se congela y dibuja solo unas pocas miniaturas", async ({ page }) => {
  test.setTimeout(600_000);
  await openUploadModal(page, fx);
  await page.locator('input[type="file"]').setInputFiles(photoFiles(1200, 30));
  await page.getByRole("button", { name: "Subir", exact: true }).click();

  const panel = page.getByTestId("upload-progress-panel");
  await expect(panel).toBeVisible({ timeout: 60_000 });
  await expect(panel).toContainText(/de 1200 fotos/);

  // Antes: 1200 <img> con el original -> la pestaña se quedaba sin memoria.
  expect(await page.locator('img[alt="Subiendo foto"]').count()).toBeLessThanOrEqual(6);

  // El hilo principal sigue respondiendo mientras sube (sin trabas de segundos).
  const gap = await maxFrameGapMs(page, 10_000);
  expect(gap, `mayor hueco entre frames: ${Math.round(gap)} ms`).toBeLessThan(2_000);

  // La subida avanza: el contador de subidas crece.
  const done = async () => {
    const m = (await panel.textContent())?.match(/(\d+) de 1200/);
    return m ? Number(m[1]) : 0;
  };
  const first = await done();
  await expect.poll(done, { timeout: 180_000 }).toBeGreaterThan(first + 20);

  // La pestaña no se recargó: la página sigue viva y el panel en pantalla.
  await expect(panel).toBeVisible();
});
