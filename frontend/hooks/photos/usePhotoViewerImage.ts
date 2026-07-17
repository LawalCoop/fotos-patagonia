import { useMemo } from "react"
import type { Photo } from "@/lib/types"
import { buildThumbObjectName } from "@/lib/photo-thumbnails"
import { usePresignedUrl } from "@/hooks/photos/usePresignedUrl"

/**
 * Obtiene las URLs necesarias para el visor:
 * - Usa thumbnail/previsualización como placeholder inmediato.
 * - Pide la original sólo cuando el visor está montado (modal abierta).
 * - Prioriza la original en cuanto esté lista.
 */
export function usePhotoViewerImage(photo: Photo | null) {
  const previewObjectName = useMemo(() => {
    if (!photo) return null
    return photo.previewObjectName ?? buildThumbObjectName(photo.objectName)
  }, [photo?.previewObjectName, photo?.objectName])

  const {
    url: previewUrl,
    loading: previewLoading,
    error: previewError,
  } = usePresignedUrl(previewObjectName, {
    enabled: !!previewObjectName,
  })

  const {
    url: originalUrl,
    loading: originalLoading,
    error: originalError,
  } = usePresignedUrl(photo?.objectName, {
    enabled: !!photo?.objectName,
  })

  const originalReady = !!originalUrl && !originalLoading && !originalError
  const previewReady = !!previewUrl && !previewLoading && !previewError

  const displayUrl = useMemo(() => {
    if (originalReady) return originalUrl
    if (previewReady) return previewUrl
    return undefined
  }, [originalReady, originalUrl, previewReady, previewUrl])
  

  // Sólo mostramos error si ambas fuentes fallan
  const error = previewError && originalError ? "No se pudo cargar la foto" : null

  return {
    displayUrl,
    previewUrl: previewReady ? previewUrl : undefined,
    originalUrl: originalReady ? originalUrl : undefined,
    previewLoading,
    originalLoading,
    originalError,
    error,
  }
}

