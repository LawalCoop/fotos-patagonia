import { test, expect } from "@playwright/test"

// Verifica en un navegador real que al abrir un album grande las miniaturas
// piden su URL firmada en lote (POST /photos/presigned-urls/) en vez de una
// por foto (GET /photos/presigned-url/), que era lo que agotaba el pool.
test("la galeria pide las URLs firmadas en lote, no una por foto", async ({ page }) => {
  const batchCalls: number[] = []
  let individualCalls = 0

  page.on("request", (req) => {
    const url = req.url()
    if (req.method() === "POST" && url.includes("/photos/presigned-urls/")) {
      batchCalls.push(1)
    } else if (url.includes("/photos/presigned-url/")) {
      individualCalls += 1
    }
  })

  await page.goto("http://localhost:3001/albumes/2", { waitUntil: "networkidle" })

  // Al menos un pedido en lote se disparo.
  expect(batchCalls.length).toBeGreaterThan(0)
  // Y NO una avalancha de pedidos individuales (el patron que tildaba).
  expect(individualCalls).toBeLessThan(10)
  // Y las miniaturas efectivamente cargaron.
  expect(await page.locator("img").count()).toBeGreaterThan(10)
})
