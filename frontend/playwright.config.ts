import { defineConfig } from "@playwright/test";

// E2E en navegador real (Chromium). Se usa para verificar comportamiento que un
// DOM simulado no puede medir, como la responsividad del hilo principal.
export default defineConfig({
  testDir: "./e2e",
  timeout: 30_000,
  fullyParallel: true,
  use: {
    browserName: "chromium",
    headless: true,
  },
});
