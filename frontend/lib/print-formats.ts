import type { PrintFormat, PrintFormatId } from "./types"

/**
 * Formatos de impresión disponibles
 */
export const PRINT_FORMATS: PrintFormat[] = [
  {
    id: "polaroid-large",
    name: "Polaroid 10x12",
    size: "10x12 cm",
    price: 1250,
    description: "Seleccionar 2 fotos",
    requiredPhotos: 2,
    active: true,
  },
  {
    id: "polaroid-small",
    name: "Polaroid Mini 6x9",
    size: "6x9 cm",
    price: 833.33,
    description: "Seleccionar 6 fotos",
    requiredPhotos: 6,
    active: true,
  },
  {
    id: "10x15",
    name: "Estándar 10x15",
    size: "10x15 cm",
    price: 5000,
    description: "Formato estándar",
    active: true,
  },
  {
    id: "15x20",
    name: "Mediana 15x20",
    size: "15x20 cm",
    price: 5000,
    description: "Formato mediano",
    active: true,
  },
]

/**
 * Helpers
 */
export function getPrintFormatById(id: PrintFormatId): PrintFormat | undefined {
  return PRINT_FORMATS.find(f => f.id === id)
}

export function getActivePrintFormats(): PrintFormat[] {
  return PRINT_FORMATS.filter(f => f.active)
}

export function getPackSize(format: PrintFormat): number {
  return format.requiredPhotos ?? 1
}

export function isPackFormat(format: PrintFormat): boolean {
  return (format.requiredPhotos ?? 1) > 1
}
