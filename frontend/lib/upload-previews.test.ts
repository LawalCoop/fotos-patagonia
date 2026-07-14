import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  createFilePreviews,
  visiblePreviews,
  hiddenPreviewCount,
  revokePreview,
} from "./upload-previews";

function fakeFile(name: string): File {
  return new File([new Uint8Array([1, 2, 3])], name, { type: "image/jpeg" });
}

describe("upload-previews", () => {
  beforeEach(() => {
    let n = 0;
    // jsdom no implementa estos métodos; los stubeamos.
    URL.createObjectURL = vi.fn(() => `blob:mock-${n++}`);
    URL.revokeObjectURL = vi.fn();
  });

  it("genera una preview por archivo, en orden, incluso con 1200 archivos", () => {
    const files = Array.from({ length: 1200 }, (_, i) => fakeFile(`f${i}.jpg`));
    const urls = createFilePreviews(files);

    expect(urls).toHaveLength(1200);
    expect(URL.createObjectURL).toHaveBeenCalledTimes(1200);
    expect(urls.every((u) => u.startsWith("blob:"))).toBe(true);
  });

  it("no decodifica imágenes ni crea elementos canvas (no debe trabar el hilo)", () => {
    const spy = vi.spyOn(document, "createElement");
    createFilePreviews([fakeFile("a.jpg"), fakeFile("b.jpg")]);
    expect(spy).not.toHaveBeenCalled();
    spy.mockRestore();
  });

  it("devuelve vacío sin archivos", () => {
    expect(createFilePreviews([])).toEqual([]);
    expect(URL.createObjectURL).not.toHaveBeenCalled();
  });

  it("visiblePreviews recorta al límite y nunca pide más de las que hay", () => {
    const urls = Array.from({ length: 100 }, (_, i) => `blob:${i}`);
    expect(visiblePreviews(urls, 48)).toHaveLength(48);
    expect(visiblePreviews(urls, 200)).toHaveLength(100);
    expect(visiblePreviews(urls, 0)).toHaveLength(0);
  });

  it("hiddenPreviewCount cuenta el resto no mostrado", () => {
    const urls = Array.from({ length: 1200 }, (_, i) => `blob:${i}`);
    expect(hiddenPreviewCount(urls, 48)).toBe(1152);
    expect(hiddenPreviewCount(urls.slice(0, 10), 48)).toBe(0);
  });

  it("revokePreview solo revoca object URLs (no data URLs ni undefined)", () => {
    revokePreview("blob:x");
    revokePreview("data:image/png;base64,abc");
    revokePreview(undefined);
    expect(URL.revokeObjectURL).toHaveBeenCalledTimes(1);
    expect(URL.revokeObjectURL).toHaveBeenCalledWith("blob:x");
  });
});
