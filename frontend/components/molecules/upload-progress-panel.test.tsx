import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import type { UploadingPhoto } from "@/lib/types";
import { PANEL_PREVIEW_LIMIT } from "@/lib/upload-queue";
import { UploadProgressPanel } from "./upload-progress-panel";

function placeholders(n: number, status: UploadingPhoto["status"] = "uploading") {
  return Array.from({ length: n }, (_, i) => ({
    tempId: `${status}-${i}`,
    previewUrl: `blob:mock-${i}`,
    status,
  }));
}

describe("UploadProgressPanel", () => {
  it("no se muestra sin subidas en curso", () => {
    const { container } = render(<UploadProgressPanel items={[]} total={0} />);
    expect(container).toBeEmptyDOMElement();
  });

  it("con 1200 fotos dibuja solo unas pocas miniaturas", () => {
    const { container } = render(
      <UploadProgressPanel items={placeholders(1200)} total={1200} />
    );

    // Antes se dibujaba un <img> del original por foto: 1200 decodificaciones.
    expect(container.querySelectorAll("img")).toHaveLength(PANEL_PREVIEW_LIMIT);
    expect(screen.getByText("Subiendo 0 de 1200 fotos")).toBeInTheDocument();
    expect(screen.getByText(`+ ${1200 - PANEL_PREVIEW_LIMIT} en cola`)).toBeInTheDocument();
  });

  it("muestra el avance y las fallidas", () => {
    const items = [...placeholders(10), ...placeholders(2, "error")];
    render(<UploadProgressPanel items={items} total={100} />);

    expect(screen.getByText("Subiendo 88 de 100 fotos")).toBeInTheDocument();
    expect(screen.getByText("88%")).toBeInTheDocument();
    expect(screen.getByText(/2 fotos no se pudieron subir/)).toBeInTheDocument();
  });

  it("al terminar con errores indica que la subida terminó", () => {
    render(<UploadProgressPanel items={placeholders(1, "error")} total={50} />);
    expect(screen.getByText("Subida terminada: 49 de 50 fotos")).toBeInTheDocument();
  });
});
