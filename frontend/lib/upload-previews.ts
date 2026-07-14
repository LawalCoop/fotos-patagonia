// Previsualización de archivos para la subida. Se mantiene puro (sin React) para
// poder testear el comportamiento con lotes grandes de forma aislada.

// Genera una URL de preview por archivo usando object URLs: es O(1) por archivo
// y no decodifica la imagen en un canvas, por lo que escala a lotes grandes.
// Devuelve una URL por archivo, en el mismo orden (relación 1:1 con `files`).
export function createFilePreviews(files: File[]): string[] {
  return files.map((file) => URL.createObjectURL(file));
}

// Miniaturas efectivamente renderizadas (recorte a `limit`).
export function visiblePreviews(urls: string[], limit: number): string[] {
  return urls.slice(0, Math.max(0, limit));
}

// Cantidad de miniaturas no renderizadas (el resto igual se sube).
export function hiddenPreviewCount(urls: string[], limit: number): number {
  return Math.max(0, urls.length - Math.max(0, limit));
}

// Libera un object URL si corresponde (los data URLs no se revocan).
export function revokePreview(url: string | undefined): void {
  if (url?.startsWith("blob:")) URL.revokeObjectURL(url);
}
