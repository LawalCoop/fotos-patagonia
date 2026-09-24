import { test, expect, type Page } from "@playwright/test";
import JSZip from "jszip";
import { API_URL, APP_URL, loginAsAdmin } from "./helpers";

// Recorrido de compra contra el entorno de desarrollo: galería pública, visor,
// carrito y checkout. Nunca se paga de verdad: el flujo web se corta antes de
// ir a Mercado Pago; la venta local (personal) usa efectivo.

async function albumWithPhotos(page: Page): Promise<number> {
  const res = await page.request.get(`${API_URL}/albums/`);
  expect(res.ok()).toBeTruthy();
  const albums: Array<{ id: number }> = await res.json();
  // El más reciente primero: sus fotos las subió upload.spec.ts en esta misma
  // corrida (LocalStack no conserva archivos entre reinicios; álbumes viejos
  // pueden tener registros sin archivo).
  for (const { id } of [...albums].sort((a, b) => b.id - a.id)) {
    const album = await (await page.request.get(`${API_URL}/albums/${id}`)).json();
    const count = (album.sessions ?? []).reduce(
      (acc: number, s: { photos?: unknown[] }) => acc + (s.photos?.length ?? 0),
      0
    );
    if (count >= 3) return id;
  }
  throw new Error("No hay álbumes con fotos: corré antes upload.spec.ts");
}

// Abre una foto del álbum en el visor y la agrega al carrito.
async function addFirstPhotoToCart(page: Page, albumId: number) {
  await page.goto(`${APP_URL}/albumes/${albumId}`, { waitUntil: "networkidle" });
  const thumb = page.locator('img[alt^="Foto de "]').first();
  await expect(thumb).toBeVisible();
  // La capa de protección tapa la miniatura a propósito: se hace clic en la tarjeta.
  await thumb.click({ force: true });
  await expect(page.getByRole("button", { name: "Cerrar" })).toBeVisible();
  await page.getByRole("button", { name: "Agregar al carrito" }).last().click();
  await expect(page.getByRole("button", { name: "Quitar del carrito" })).toBeVisible();
}

async function goToCheckout(page: Page) {
  await page.goto(`${APP_URL}/carrito`, { waitUntil: "networkidle" });
  const pay = page.getByRole("button", { name: "Proceder al pago" });
  await expect(pay).toBeDisabled(); // sin email no deja avanzar
  await page.getByPlaceholder("tu@email.com").fill("e2e@example.com");
  await pay.click();
  await expect(page).toHaveURL(/\/checkout$/);
}

test("cliente: del álbum al checkout, hasta el botón de Mercado Pago", async ({ page }) => {
  const albumId = await albumWithPhotos(page);
  await addFirstPhotoToCart(page, albumId);
  await goToCheckout(page);
  await expect(page.getByText("1 foto", { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Proceder a Mercado Pago" })).toBeVisible();
});

test("venta local: el personal genera la orden, ve la confirmación y el ZIP trae las fotos", async ({ page }) => {
  test.setTimeout(120_000);
  await loginAsAdmin(page);
  const albumId = await albumWithPhotos(page);
  await addFirstPhotoToCart(page, albumId);
  await goToCheckout(page);

  await page.getByText("Efectivo", { exact: true }).click();
  const created = page.waitForResponse(
    (r) => r.url().includes("/checkout/create-order") && r.request().method() === "POST"
  );
  await page.getByRole("button", { name: /Generar Orden Local/ }).click();
  const order = await (await created).json();
  expect(order.public_id).toBeTruthy();

  // Antes, el carrito vacío redirigía a /carrito y la confirmación no se veía.
  await expect(page).toHaveURL(/\/checkout\/success/);
  await expect(page.getByRole("heading", { name: /exitoso/i })).toBeVisible();

  // La página pública del pedido abre.
  await page.goto(`${APP_URL}/pedidos/${order.public_id}`, { waitUntil: "networkidle" });
  await expect(page.locator("body")).not.toContainText(/no encontrado|not found/i);

  // El ZIP trae la foto (en 0.2.9 salía vacío).
  const zipRes = await page.request.get(`${API_URL}/orders/public/${order.public_id}/download-zip`);
  expect(zipRes.ok(), `zip: ${zipRes.status()}`).toBeTruthy();
  const zip = await JSZip.loadAsync(await zipRes.body());
  expect(Object.keys(zip.files).length).toBeGreaterThanOrEqual(1);
});
