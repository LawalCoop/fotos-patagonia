"use client"

import { useEffect, useState, useMemo } from "react"
import Link from "next/link"
import { useParams } from "next/navigation"
import { ArrowLeft, Download, AlertCircle } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import type { Order, OrderItem, OrderItemPhoto } from "@/lib/types"
import { OrderStatus } from "@/lib/types"
import { apiFetch } from "@/lib/api"
import Image from "next/image"
import { Logo } from "@/components/atoms/logo"
import { formatDateTime } from "@/lib/datetime"

type OrderWithPublicPhotoItems = Omit<Order, "items"> & {
  items: Array<Omit<OrderItem, "photo"> & { photo: OrderItemPhoto }>
}

const buildPhotoFilename = (photo: OrderItemPhoto) => {
  const sanitizedDescription =
    photo.description
      ?.trim()
      .toLowerCase()
      .replace(/\s+/g, "-")
      .replace(/[^a-z0-9-]/g, "") || `foto-${photo.id}`
  return `${sanitizedDescription}.jpg`
}

const splitOrderItems = (items: OrderItem[]) => {
  const digital: OrderItem[] = []
  const print: OrderItem[] = []
  items.forEach((item) => {
    if (item.format) {
      print.push(item)
    } else {
      digital.push(item)
    }
  })
  return { digital, print }
}

/**
 * Safari/iOS-safe download:
 *
 * Safari bloquea fetch→blob→objectURL si no ocurre EXACTAMENTE dentro del
 * handler de un gesto del usuario (tap/click). Para descarga individual el
 * gesto es directo, así que usamos la estrategia de <a download> con el URL
 * original cuando el navegador lo permite, y caemos a window.open() como
 * fallback para iOS Safari donde <a download> tampoco funciona en cross-origin.
 *
 * Para "Descargar todas" usamos apertura secuencial con pequeño delay entre
 * pestañas, que es lo máximo que Safari permite sin bloquear el popup.
 */
const isSafariBrowser = (): boolean => {
  if (typeof navigator === "undefined") return false
  const ua = navigator.userAgent
  return /Safari/i.test(ua) && !/Chrome|CriOS|FxiOS|EdgA/i.test(ua)
}

const isIOSDevice = (): boolean => {
  if (typeof navigator === "undefined") return false
  return /iPad|iPhone|iPod/.test(navigator.userAgent)
}

/**
 * Descarga un único archivo de forma compatible con Safari/iOS.
 * - Chrome/Firefox: fetch → blob → objectURL → <a download>
 * - Safari desktop: <a download> directo (funciona si es same-origin o el
 *   servidor envía Content-Disposition; sino cae a window.open)
 * - iOS Safari: window.open() — única opción confiable (el usuario ve la
 *   imagen en una nueva pestaña y puede guardarla con el menú contextual)
 */
const triggerFileDownload = async (url: string, filename: string): Promise<void> => {
  if (!url || typeof document === "undefined") return

  const isIOS = isIOSDevice()
  const isSafari = isSafariBrowser()

  // iOS Safari: ningún método programático funciona de forma fiable.
  // Abrimos en nueva pestaña y el usuario guarda desde el menú largo-press.
  if (isIOS) {
    window.open(url, "_blank", "noopener,noreferrer")
    return
  }

  // Safari desktop: intentamos fetch→blob primero; si falla abrimos pestaña.
  if (isSafari) {
    try {
      const response = await fetch(url, { credentials: "omit" })
      if (!response.ok) throw new Error("fetch failed")
      const blob = await response.blob()
      const objectUrl = URL.createObjectURL(blob)
      const anchor = document.createElement("a")
      anchor.href = objectUrl
      anchor.download = filename
      document.body.appendChild(anchor)
      anchor.click()
      document.body.removeChild(anchor)
      // Revocamos con delay para asegurar que Safari terminó de leer el blob
      setTimeout(() => URL.revokeObjectURL(objectUrl), 1000)
    } catch {
      window.open(url, "_blank", "noopener,noreferrer")
    }
    return
  }

  // Chrome / Firefox / Edge: fetch → blob → objectURL (más confiable para CORS)
  try {
    const response = await fetch(url, { credentials: "omit" })
    if (!response.ok) throw new Error("fetch failed")
    const blob = await response.blob()
    const objectUrl = URL.createObjectURL(blob)
    const anchor = document.createElement("a")
    anchor.href = objectUrl
    anchor.download = filename
    document.body.appendChild(anchor)
    anchor.click()
    document.body.removeChild(anchor)
    setTimeout(() => URL.revokeObjectURL(objectUrl), 1000)
  } catch (error) {
    console.error("Download failed:", error)
  }
}

/**
 * Descarga secuencial con delay para "Descargar todas".
 * Safari bloquea descargas en paralelo iniciadas por JS; la secuencial con
 * ~500 ms entre cada una es el patrón más compatible.
 */
const downloadAllSequentially = async (
  photos: OrderItemPhoto[],
  onProgress?: (current: number, total: number) => void,
): Promise<void> => {
  for (let i = 0; i < photos.length; i++) {
    const photo = photos[i]
    const url = photo.url || photo.watermark_url
    if (!url) continue
    onProgress?.(i + 1, photos.length)
    await triggerFileDownload(url, buildPhotoFilename(photo))
    // Delay entre descargas — necesario en Safari para no bloquear la cola
    if (i < photos.length - 1) {
      await new Promise((r) => setTimeout(r, 500))
    }
  }
}

// ---------------------------------------------------------------------------
// PhotoGridItem — optimizado para Safari/iOS
// ---------------------------------------------------------------------------
function PhotoGridItem({ photo }: { photo: OrderItemPhoto }) {
  const imageUrl = photo.url || photo.watermark_url || "/placeholder.svg"

  return (
    /**
     * Safari/iOS no respeta bien `aspect-square` con `position:relative` y
     * `fill` en todos los casos. Usamos padding-bottom trick vía Tailwind
     * (`pb-[100%]`) con `absolute inset-0` para garantizar el cuadrado.
     */
    <div className="group relative w-full overflow-hidden rounded-xl bg-muted" style={{ paddingBottom: "100%" }}>
      <div className="absolute inset-0">
        <Image
          src={imageUrl}
          alt={photo.description || "Foto"}
          fill
          sizes="(max-width: 768px) 50vw, (max-width: 1024px) 33vw, 25vw"
          className="object-cover transition-transform duration-300 group-hover:scale-105"
          // Sin objectFit prop (deprecada): usamos className `object-cover`
        />
      </div>
      <div className="absolute inset-0 flex items-center justify-center bg-black/50 opacity-0 transition-opacity duration-300 group-hover:opacity-100">
        <Button
          size="sm"
          // En iOS touch no existe hover; usamos onClick directo
          onClick={() => triggerFileDownload(imageUrl, buildPhotoFilename(photo))}
          className="gap-2 rounded-lg bg-primary text-foreground"
        >
          <Download className="h-4 w-4" />
          Descargar
        </Button>
      </div>

      {/*
        En iOS el hover overlay nunca se muestra. Agregamos un botón siempre
        visible en mobile (md:hidden) para que la descarga sea accesible.
      */}
      <div className="absolute bottom-2 right-2 md:hidden">
        <Button
          size="sm"
          onClick={() => triggerFileDownload(imageUrl, buildPhotoFilename(photo))}
          className="gap-1 rounded-lg bg-primary/90 px-2 py-1 text-xs text-foreground shadow-md"
        >
          <Download className="h-3 w-3" />
        </Button>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Page component
// ---------------------------------------------------------------------------
export default function PublicOrderDetailPage() {
  const params = useParams()
  const publicId = params.publicId as string
  const [order, setOrder] = useState<OrderWithPublicPhotoItems | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [isDownloading, setIsDownloading] = useState(false)
  const [downloadProgress, setDownloadProgress] = useState<{ current: number; total: number } | null>(null)
  // Detectamos iOS una sola vez para mostrar aviso contextual
  const [isIOS, setIsIOS] = useState(false)

  useEffect(() => {
    setIsIOS(isIOSDevice())
  }, [])

  useEffect(() => {
    if (!publicId) return
    const fetchOrder = async () => {
      try {
        setLoading(true)
        const fetchedOrder = await apiFetch<OrderWithPublicPhotoItems>(`/orders/public/${publicId}`)
        setOrder(fetchedOrder)
      } catch (err) {
        setError("No pudimos encontrar un pedido con este código. Verifica el link o contacta con soporte.")
        console.error("Failed to fetch public order:", err)
      } finally {
        setLoading(false)
      }
    }
    fetchOrder()
  }, [publicId])

  const { digital: digitalItems, print: printItems } = useMemo(
    () => splitOrderItems(order?.items ?? []),
    [order],
  )

  // Fotos digitales únicas (sin duplicados)
  const digitalOrderPhotos = useMemo(() => {
    if (!order?.items) return []
    const seen = new Set<number>()
    return order.items
      .filter((item) => !item.format)
      .map((item) => item.photo)
      .filter((photo): photo is OrderItemPhoto => {
        if (!photo) return false
        if (seen.has(photo.id)) return false
        seen.add(photo.id)
        return true
      })
  }, [order?.items])

  const getStatusBadge = (status: Order["order_status"] | undefined) => {
    const statusConfig = {
      [OrderStatus.PENDING]: { label: "Pendiente", className: "bg-yellow-500/10 text-yellow-600" },
      [OrderStatus.PAID]: { label: "Pagado", className: "bg-green-500/10 text-green-600" },
      [OrderStatus.COMPLETED]: { label: "Completado", className: "bg-blue-500/10 text-blue-600" },
      [OrderStatus.REJECTED]: { label: "Rechazado", className: "bg-red-500/10 text-red-600" },
    } as const

    if (!status || !(status in statusConfig)) {
      return { label: "Desconocido", className: "bg-gray-500/10 text-gray-600" }
    }
    return statusConfig[status as keyof typeof statusConfig]
  }

  const statusInfo = getStatusBadge(order?.order_status)

  const isPaidOrCompleted =
    order?.order_status === OrderStatus.PAID || order?.order_status === OrderStatus.COMPLETED

  const handleDownloadAll = async () => {
    if (!digitalOrderPhotos.length || isDownloading) return
    setIsDownloading(true)
    setDownloadProgress({ current: 0, total: digitalOrderPhotos.length })
    try {
      const baseUrl = process.env.NEXT_PUBLIC_API_URL || ""
      const url = `${baseUrl}/orders/public/${publicId}/download-zip`
      window.open(url, "_blank")
    } catch (error) {
      console.error("Error iniciando descarga ZIP:", error)
    } finally {
      setIsDownloading(false)
      setDownloadProgress(null)
    }
  }

  const formatOrderDate = (dateValue: string | undefined | null) => {
    if (!dateValue) return "Sin fecha"
    return formatDateTime(dateValue) || "Fecha inválida"
  }

  // ---------------------------------------------------------------------------
  // Loading & error states
  // ---------------------------------------------------------------------------
  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <p className="text-muted-foreground">Cargando datos del pedido...</p>
      </div>
    )
  }

  if (error || !order) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background p-4">
        <div className="mx-auto max-w-md text-center">
          <div className="mx-auto mb-4 flex h-20 w-20 items-center justify-center rounded-full bg-red-500/10">
            <AlertCircle className="h-10 w-10 text-red-600 dark:text-red-400" />
          </div>
          <h1 className="mb-4 text-3xl font-bold">Pedido no encontrado</h1>
          <p className="mb-8 text-muted-foreground">{error}</p>
          <Link href="/galeria">
            <Button className="rounded-xl bg-primary font-semibold text-foreground hover:bg-primary-hover">
              Volver a la galería
            </Button>
          </Link>
        </div>
      </div>
    )
  }

  // ---------------------------------------------------------------------------
  // Main render
  // ---------------------------------------------------------------------------
  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <div className="container mx-auto flex items-center justify-between border-b border-gray-200 px-4 py-4">
        <Logo />
        <Link href="/" className="text-lg font-semibold text-primary">
          Somos Fotos Patagonia
        </Link>
      </div>

      <div className="container mx-auto px-4 py-8">
        <div className="mx-auto max-w-4xl">
          <Link
            href="/"
            className="mb-6 inline-flex items-center text-sm text-muted-foreground hover:text-foreground"
          >
            <ArrowLeft className="mr-2 h-4 w-4" />
            Volver a la galería
          </Link>

          {/* Hero */}
          <div className="mb-8 text-center">
            <div className="mx-auto mb-4 flex h-20 w-20 items-center justify-center rounded-full bg-primary/10">
              <Download className="h-10 w-10 text-primary" />
            </div>
            <h1 className="mb-2 text-balance text-4xl font-bold">Tu Pedido #{order.id}</h1>
            <p className="text-lg text-muted-foreground">Detalles y Fotos</p>
          </div>

          {/* Order Status */}
          <Card className="mb-6 rounded-2xl border-gray-200 shadow-lg">
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle>Estado del Pedido</CardTitle>
                  <CardDescription className="mt-1">{formatOrderDate(order.created_at)}</CardDescription>
                </div>
                {statusInfo && <Badge className={statusInfo.className}>{statusInfo.label}</Badge>}
              </div>
            </CardHeader>
            {!isPaidOrCompleted && (
              <CardContent>
                <div className="rounded-xl bg-yellow-500/10 p-4">
                  <p className="text-sm text-yellow-600 dark:text-yellow-400">
                    Tu pedido está pendiente de confirmación de pago. Una vez confirmado, podrás descargar tus fotos.
                  </p>
                </div>
              </CardContent>
            )}
          </Card>

          {/* iOS notice — solo se muestra en dispositivos iOS */}
          {isIOS && isPaidOrCompleted && digitalOrderPhotos.length > 0 && (
            <div className="mb-6 rounded-xl bg-blue-500/10 p-4">
              <p className="text-sm text-blue-700 dark:text-blue-300">
                <strong>Tip para iPhone/iPad:</strong> Al tocar &quot;Descargar&quot; en cada foto, se abrirá en una
                nueva pestaña. Mantenés el dedo sobre la imagen y elegí{" "}
                <em>&quot;Añadir a Fotos&quot;</em> o <em>&quot;Guardar imagen&quot;</em> para guardarla en tu
                dispositivo.
              </p>
            </div>
          )}

          {/* Download All — solo si está pagado/completado */}
          {isPaidOrCompleted && digitalOrderPhotos.length > 0 && (
            <div className="mb-6">
              <Button
                onClick={handleDownloadAll}
                disabled={isDownloading}
                className="w-full rounded-xl bg-primary py-6 text-lg font-semibold text-foreground hover:bg-primary-hover disabled:opacity-70"
              >
                <Download className="mr-2 h-5 w-5" />
                {isDownloading && downloadProgress
                  ? `Descargando ${downloadProgress.current} de ${downloadProgress.total}...`
                  : "Descargar todas en un solo archivo (.ZIP)"}
              </Button>

              {/* Barra de progreso accesible */}
              {isDownloading && downloadProgress && (
                <div
                  role="progressbar"
                  aria-valuenow={downloadProgress.current}
                  aria-valuemin={0}
                  aria-valuemax={downloadProgress.total}
                  className="mt-2 h-2 w-full overflow-hidden rounded-full bg-muted"
                >
                  <div
                    className="h-full rounded-full bg-primary transition-all duration-300"
                    style={{
                      width: `${(downloadProgress.current / downloadProgress.total) * 100}%`,
                    }}
                  />
                </div>
              )}
            </div>
          )}

          {/* Photos Grid */}
          {digitalOrderPhotos.length > 0 && isPaidOrCompleted && (
            <Card className="rounded-2xl border-gray-200 shadow-lg">
              <CardHeader>
                <CardTitle>Tus Fotos ({digitalOrderPhotos.length})</CardTitle>
                <CardDescription>
                  {isIOS
                    ? "Tocá cada foto para abrirla y guardarla en tu dispositivo"
                    : "Hacé clic en cada foto para descargarla individualmente"}
                </CardDescription>
              </CardHeader>
              <CardContent>
                {/*
                  Grid: en iOS evitamos gap muy pequeño para que el botón de
                  descarga mobile sea fácil de tocar (mínimo 44 px touch target).
                */}
                <div className="grid grid-cols-2 gap-3 sm:gap-4 md:grid-cols-3 lg:grid-cols-4">
                  {digitalOrderPhotos.map((photo) => (
                    <PhotoGridItem key={photo.id} photo={photo} />
                  ))}
                </div>
              </CardContent>
            </Card>
          )}

          {/* Help */}
          <Card className="mt-6 rounded-2xl border-gray-200 shadow-lg">
            <CardHeader>
              <CardTitle>¿Necesitas ayuda?</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 text-sm text-muted-foreground">
              <p>• Las fotos están disponibles en alta resolución</p>
              <p>• Podés descargarlas cuantas veces necesites</p>
              {isIOS && <p>• En iPhone/iPad, abrí cada foto y usá el menú de compartir para guardarla</p>}
              <p>• Si tenés problemas, contactá a somosfotospatagonia@gmail.com</p>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  )
}