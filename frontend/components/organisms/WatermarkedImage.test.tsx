import { describe, it, expect, vi } from "vitest";
import { render } from "@testing-library/react";
import WatermarkedImage from "./WatermarkedImage";

// next/image hace cosas que jsdom no soporta: lo reemplazamos por un <img> simple.
vi.mock("next/image", () => ({
  default: (props: Record<string, unknown>) => {
    // eslint-disable-next-line @next/next/no-img-element, jsx-a11y/alt-text
    return <img {...(props as any)} />;
  },
}));

// Usuario público (sin sesión): se muestra la marca de agua.
vi.mock("@/lib/store", () => ({
  useAuthStore: (selector: (s: { user: null }) => unknown) => selector({ user: null }),
}));

describe("WatermarkedImage — capa de protección", () => {
  it("no bloquea el scroll táctil ni los clics (pointer-events-none, sin touch-none)", () => {
    const { container } = render(<WatermarkedImage src="blob:x" />);

    const layer = container.querySelector("[aria-hidden]") as HTMLElement | null;
    expect(layer).not.toBeNull();
    // No debe capturar eventos: si captura, tapa botones (carrito/favorito) en el visor y la grilla.
    expect(layer!.className).toContain("pointer-events-none");
    // touch-none mataba el scroll táctil sobre la galería en tablet/mobile.
    expect(layer!.className).not.toContain("touch-none");
  });
});
