import { expect, type APIRequestContext, type Page } from "@playwright/test";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

// Estos tests corren contra el entorno de desarrollo completo (./dev-up.sh):
// frontend en :3001, backend en :8010, LocalStack como S3. Nunca contra prod.
export const APP_URL = process.env.E2E_APP_URL ?? "http://localhost:3001";
export const API_URL = process.env.E2E_API_URL ?? "http://localhost:8010";

export const ADMIN_EMAIL = process.env.E2E_ADMIN_EMAIL ?? "admin@example.com";
export const ADMIN_PASSWORD = process.env.E2E_ADMIN_PASSWORD ?? "changeme";

// Carpeta con fotos JPEG únicas (el backend descarta duplicados por hash).
// Se generan con: python3 e2e/stack/generate-photos.py <cantidad> <carpeta>
export const PHOTOS_DIR = process.env.E2E_PHOTOS_DIR ?? "";

// Nonce de la corrida: se agrega al final de cada JPEG (después del marcador de
// fin de imagen, que los decodificadores ignoran). La foto se ve igual pero su
// hash cambia, así cada corrida sube fotos "nuevas" y los tests son repetibles.
const RUN_NONCE = Buffer.from(`e2e-${Date.now()}-${Math.random()}`);
let runDir: string | undefined;

export function photoFiles(count: number, offset = 0) {
  if (!PHOTOS_DIR) throw new Error("Definí E2E_PHOTOS_DIR con la carpeta de fotos de prueba");
  const all = fs
    .readdirSync(PHOTOS_DIR)
    .filter((f) => /\.jpe?g$/i.test(f))
    .sort();
  const slice = all.slice(offset, offset + count);
  if (slice.length < count) {
    throw new Error(`Hacen falta ${offset + count} fotos en ${PHOTOS_DIR} (hay ${all.length})`);
  }
  // Playwright no acepta buffers de más de 50 MB en total: se escriben las
  // copias de la corrida en una carpeta temporal y se pasan las rutas.
  runDir ??= fs.mkdtempSync(path.join(os.tmpdir(), "fotos-e2e-"));
  return slice.map((name) => {
    const target = path.join(runDir!, name);
    if (!fs.existsSync(target)) {
      fs.writeFileSync(
        target,
        Buffer.concat([fs.readFileSync(path.join(PHOTOS_DIR, name)), RUN_NONCE])
      );
    }
    return target;
  });
}

async function apiToken(request: APIRequestContext): Promise<string> {
  const res = await request.post(`${API_URL}/auth/login`, {
    form: { username: ADMIN_EMAIL, password: ADMIN_PASSWORD },
  });
  expect(res.ok(), `login admin: ${res.status()}`).toBeTruthy();
  return (await res.json()).access_token;
}

export interface Fixture {
  albumId: number;
  albumName: string;
  photographerName: string;
}

// Crea un álbum y un fotógrafo propios del test, para no depender de datos previos.
export async function createFixture(request: APIRequestContext, tag: string): Promise<Fixture> {
  const token = await apiToken(request);
  const headers = { Authorization: `Bearer ${token}` };
  const stamp = `${tag}-${Date.now()}`;

  const photographerName = `Fotógrafo ${stamp}`;
  const ph = await request.post(`${API_URL}/photographers/`, {
    headers,
    data: {
      name: photographerName,
      commission_percentage: 50,
      contact_info: "e2e",
      email: `e2e-${stamp}@example.com`,
      password: "e2e-password",
    },
  });
  expect(ph.ok(), `crear fotógrafo: ${ph.status()} ${await ph.text()}`).toBeTruthy();

  const albumName = `Álbum ${stamp}`;
  const al = await request.post(`${API_URL}/albums/`, {
    headers,
    data: { name: albumName, description: "e2e", default_photo_price: 15000 },
  });
  expect(al.ok(), `crear álbum: ${al.status()} ${await al.text()}`).toBeTruthy();

  return { albumId: (await al.json()).id, albumName, photographerName };
}

// Cantidad de fotos del álbum según el backend.
export async function albumPhotoCount(request: APIRequestContext, albumId: number): Promise<number> {
  const res = await request.get(`${API_URL}/albums/${albumId}`);
  expect(res.ok()).toBeTruthy();
  const album = await res.json();
  return (album.sessions ?? []).reduce(
    (acc: number, s: { photos?: unknown[] }) => acc + (s.photos?.length ?? 0),
    0
  );
}

export async function loginAsAdmin(page: Page) {
  await page.goto(APP_URL, { waitUntil: "networkidle" });
  await page.getByRole("button", { name: "Iniciar sesión" }).click();
  await page.getByPlaceholder("usuario@ejemplo.com").fill(ADMIN_EMAIL);
  const password = page.getByPlaceholder("••••••••");
  await password.fill(ADMIN_PASSWORD);
  await password.press("Enter");
  await expect(page.getByPlaceholder("usuario@ejemplo.com")).toBeHidden({ timeout: 30_000 });
}

// Abre el modal de subida en /admin/fotos y elige álbum + fotógrafo.
export async function openUploadModal(page: Page, fx: Fixture) {
  await page.goto(`${APP_URL}/admin/fotos`);
  await page.getByRole("button", { name: "Agregar Foto" }).click();
  await page.getByRole("combobox").filter({ hasText: /álbum/i }).click();
  await page.getByRole("option", { name: fx.albumName }).click();
  await page.getByRole("button", { name: new RegExp(fx.photographerName) }).click();
}

// Mide la responsividad del hilo principal durante `ms`: devuelve el mayor
// hueco entre frames. Si la página se congela, el hueco se dispara.
export async function maxFrameGapMs(page: Page, ms: number): Promise<number> {
  return page.evaluate(
    (duration) =>
      new Promise<number>((resolve) => {
        let last = performance.now();
        let worst = 0;
        const end = last + duration;
        const tick = (now: number) => {
          worst = Math.max(worst, now - last);
          last = now;
          if (now < end) requestAnimationFrame(tick);
          else resolve(worst);
        };
        requestAnimationFrame(tick);
      }),
    ms
  );
}
