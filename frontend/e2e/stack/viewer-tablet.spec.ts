import { test, expect, devices } from "@playwright/test";
import { API_URL, APP_URL, loginAsAdmin } from "./helpers";

// Visor de fotos en tablet (táctil). Cubre los botones que en julio no
// respondían: cerrar/corazón en pantalla completa y agregar al carrito.
// La pantalla completa es solo para el personal: se entra como admin.
test.use({ ...devices["iPad (gen 7) landscape"], defaultBrowserType: "chromium" });

test("tablet: pantalla completa se cierra y el carrito responde en el visor", async ({ page }) => {
  await loginAsAdmin(page);
  const albums: Array<{ id: number }> = await (await page.request.get(`${API_URL}/albums/`)).json();
  const albumId = Math.max(...albums.map((a) => a.id));

  await page.goto(`${APP_URL}/albumes/${albumId}`, { waitUntil: "networkidle" });
  const thumb = page.locator('img[alt^="Foto de "]').first();
  await expect(thumb).toBeVisible();
  await thumb.tap({ force: true });
  await expect(page.getByRole("button", { name: "Cerrar" })).toBeVisible();

  // Pantalla completa: el botón de cerrar tiene que responder.
  await page.getByRole("button", { name: "Ver en pantalla completa" }).tap();
  const closeFull = page.getByRole("button", { name: "Cerrar pantalla completa" });
  await expect(closeFull).toBeVisible();
  await closeFull.tap();
  await expect(closeFull).toBeHidden();

  // Agregar al carrito desde el visor.
  await page.getByRole("button", { name: "Agregar al carrito" }).last().tap();
  await expect(page.getByRole("button", { name: "Quitar del carrito" })).toBeVisible();
});
