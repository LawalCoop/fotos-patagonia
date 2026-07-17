import { useState, useEffect } from "react"
import { apiFetch } from "@/lib/api"

interface PresignedUrlResponse {
  url: string
}

const PLACEHOLDER_URL = "/placeholder.svg"

// ✅ caches globales
const urlCache = new Map<string, string>()
const pendingCache = new Map<string, Promise<string>>()

export function usePresignedUrl(objectName?: string | null, options?: { enabled?: boolean }) {
  const { enabled = true } = options ?? {}

  const cachedInitialUrl =
    objectName && urlCache.has(objectName) ? urlCache.get(objectName)! : PLACEHOLDER_URL

  const [url, setUrl] = useState<string>(cachedInitialUrl)
  const [loading, setLoading] = useState<boolean>(
    Boolean(enabled && objectName && !urlCache.has(objectName)),
  )

  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!objectName || !enabled) {
      setLoading(false)
      setError(null)
      return
    }

    // ✅ 1. cache inmediato
    if (urlCache.has(objectName)) {
      setUrl(urlCache.get(objectName)!)
      setLoading(false)
      return
    }

    let cancelled = false
    setLoading(true)

    // ✅ 2. deduplicación de requests
    // El finally corre también si el pedido falla: si no, la promesa rechazada
    // queda en pendingCache y todo montaje posterior la reusa sin reintentar,
    // dejando la foto rota hasta recargar la página.
    const request =
      pendingCache.get(objectName) ??
      apiFetch<PresignedUrlResponse>(
        `/photos/presigned-url/?object_name=${encodeURIComponent(objectName)}`
      )
        .then((res) => {
          urlCache.set(objectName, res.url)
          return res.url
        })
        .finally(() => {
          pendingCache.delete(objectName)
        })

    pendingCache.set(objectName, request)

    request
      .then((resolvedUrl) => {
        if (!cancelled) setUrl(resolvedUrl)
      })
      .catch((e) => {
        if (!cancelled) {
          setError("Failed to fetch image URL")
          console.error(e)
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })

    return () => {
      cancelled = true
    }
  }, [objectName, enabled])

  return { url, loading, error }
}
