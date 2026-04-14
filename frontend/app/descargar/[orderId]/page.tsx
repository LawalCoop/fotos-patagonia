"use client"

import { useEffect, useMemo, useState } from "react"
import { useParams } from "next/navigation"
import Link from "next/link"
import { Download, AlertCircle, Calendar, Loader2 } from "lucide-react"
import { Header } from "@/components/organisms/header"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import type { Order, OrderItem } from "@/lib/types"
import { apiFetch } from "@/lib/api"
import WatermarkedImage from "@/components/organisms/WatermarkedImage"
import { formatDateOnly } from "@/lib/datetime"
import { useToast } from "@/hooks/use-toast"

// Define a type for the fetched order that includes photo details in items
type OrderWithPhotoItems = Omit<Order, "items"> & {
  items: OrderItem[]
}

// Heurística compartida con la vista pública para separar digital vs impresión
const splitOrderItems = (items: OrderItem[]) => {
  const grouped = new Map<number, OrderItem[]>()
  items.forEach((item) => {
    const pid = item.photo_id || item.photo?.id
    if (!pid) return
    grouped.set(pid, [...(grouped.get(pid) ?? []), item])
  })

  const digital: OrderItem[] = []
  const print: OrderItem[] = []
  const isApproxEqual = (a = 0, b = 0, tol = 0.01) => Math.abs(a - b) <= tol

  grouped.forEach((list) => {
    if (list.length === 1) {
      const item = list[0]
      const base = item.photo?.price ?? item.price
      if (base !== undefined && !isApproxEqual(item.price ?? 0, base)) {
        print.push(item)
      } else {
        digital.push(item)
      }
      return
    }
    const sorted = [...list].sort((a, b) => (a.price ?? 0) - (b.price ?? 0))
    digital.push(sorted[0])
    print.push(...sorted.slice(1))
  })

  return { digital, print }
}

export default function DescargarPage() {
  const params = useParams()
  const { toast } = useToast()
  const publicId = params.orderId as string // The param is the public_id (UUID)
  const [order, setOrder] = useState<OrderWithPhotoItems | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [isDownloadingAll, setIsDownloadingAll] = useState(false)
  const [downloadingPhotoId, setDownloadingPhotoId] = useState<string | null>(null)

  useEffect(() => {
    if (publicId) {
      const fetchOrder = async () => {
        try {
          setLoading(true)
          const fetchedOrder = await apiFetch<OrderWithPhotoItems>(`/orders/public/${publicId}`)
          setOrder(fetchedOrder)
        } catch (err) {
          setError("No pudimos encontrar un pedido con este código. Verifica el link o contacta con soporte.")
          console.error("Failed to fetch order:", err)
        } finally {
          setLoading(false)
        }
      }
      fetchOrder()
    }
  }, [publicId])

  if (loading) {
    return (
      <div className="min-h-screen bg-background">
        <Header />
        <div className="container mx-auto px-4 py-16">
          <div className="mx-auto max-w-md text-center">
            <p className="text-muted-foreground">Cargando...</p>
          </div>
        </div>
      </div>
    )
  }

  if (error || !order) {
    return (
      <div className="min-h-screen bg-background">
        <Header />
        <div className="container mx-auto px-4 py-16">
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
      </div>
    )
  }

  const orderPhotos = (order.items ?? [])
    .map((item) => item.photo)
    .filter((photo): photo is NonNullable<OrderItem["photo"]> => Boolean(photo))

  const { digital: digitalItems, print: printItems } = useMemo(
    () => splitOrderItems(order.items ?? []),
    [order],
  )

  const normalizedStatus = order.order_status?.toLowerCase() as Order["order_status"] | undefined
  const canDownload = normalizedStatus === "paid" || normalizedStatus === "completed"

  const formatOrderDate = () => {
    const dateValue = order.created_at ?? order.createdAt;
    if (!dateValue) return "Sin fecha";

    const formatted = formatDateOnly(dateValue);
    return formatted || "Fecha inválida";
  };

  const handleDownload = async (photoId: string) => {
    if (downloadingPhotoId) return
    setDownloadingPhotoId(photoId)
    try {
      const response = await apiFetch<{ download_url: string }>(
        `/orders/public/${publicId}/download-photo/${photoId}`,
      )
      if (response.download_url) {
        toast({
          title: "Iniciando descarga",
          description: "Tu foto se está descargando.",
        })
        window.open(response.download_url, "_blank")
      } else {
        throw new Error("No se recibió un link de descarga.")
      }
    } catch (err) {
      console.error("Failed to download photo:", err)
      toast({
        title: "Error de descarga",
        description: "No se pudo descargar la foto. Intenta de nuevo.",
        variant: "destructive",
      })
    } finally {
      setDownloadingPhotoId(null)
    }
  }

  const handleDownloadAll = async () => {
    if (isDownloadingAll) return
    setIsDownloadingAll(true)
    try {
      const response = await apiFetch<{ download_url: string }>(`/orders/public/${publicId}/download-all`)
      if (response.download_url) {
        toast({
          title: "Iniciando descarga",
          description: "Tus fotos se están preparando. La descarga comenzará en breve.",
        })
        window.open(response.download_url, "_blank")
      } else {
        throw new Error("No se recibió un link de descarga.")
      }
    } catch (err) {
      console.error("Failed to download all photos:", err)
      toast({
        title: "Error de descarga",
        description: "No se pudieron descargar las fotos. Intenta de nuevo.",
        variant: "destructive",
      })
    } finally {
      setIsDownloadingAll(false)
    }
  }

  return (
    <div className="min-h-screen bg-background">
      <Header />
      <div className="container mx-auto px-4 py-8">
        <div className="mx-auto max-w-4xl">
          {/* Header */}
          <div className="mb-8 text-center">
            <div className="mx-auto mb-4 flex h-20 w-20 items-center justify-center rounded-full bg-primary/10">
              <Download className="h-10 w-10 text-primary" />
            </div>
            <h1 className="mb-2 text-4xl font-bold text-balance">Descarga tus Fotos</h1>
            <p className="text-lg text-muted-foreground">Pedido #{order.id}</p>
          </div>

          {/* Order Status */}
          <Card className="mb-6 rounded-2xl border-gray-200 shadow-lg">
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle>Estado del Pedido</CardTitle>
                  <CardDescription className="mt-1">{formatOrderDate()}</CardDescription>
                </div>
                <Badge
                  className={
                    canDownload
                      ? "bg-green-500/10 text-green-600 dark:bg-green-500/20 dark:text-green-400"
                      : "bg-yellow-500/10 text-yellow-600 dark:bg-yellow-500/20 dark:text-yellow-400"
                  }
                >
                  {canDownload ? "Listo para descargar" : "Pendiente de pago"}
                </Badge>
              </div>
            </CardHeader>
            {!canDownload && (
              <CardContent>
                <div className="rounded-xl bg-yellow-500/10 p-4">
                  <p className="text-sm text-yellow-600 dark:text-yellow-400">
                    Tu pedido está pendiente de confirmación de pago. Una vez confirmado, podrás descargar tus fotos.
                  </p>
                </div>
              </CardContent>
            )}
          </Card>

          {/* Semántica de ítems para separar visualización */}
          <Card className="mb-6 rounded-2xl border-gray-200 shadow-lg">
            <CardHeader>
              <CardTitle>Detalle de ítems</CardTitle>
              <CardDescription>
                Usa estos grupos para renderizar bloques separados de digital / impresión sin tocar el backend actual.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4 text-sm">
              <div>
                <p className="font-semibold text-muted-foreground">Fotos digitales</p>
                {digitalItems.length === 0 ? (
                  <p className="text-xs text-muted-foreground">Sin ítems digitales.</p>
                ) : (
                  <ul className="mt-2 space-y-1">
                    {digitalItems.map((item) => (
                      <li key={item.id} className="flex justify-between">
                        <span>{item.photo?.description || `Foto ${item.photo_id}`}</span>
                        <span className="font-semibold">${item.price}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
              <div>
                <p className="font-semibold text-muted-foreground">Fotos para impresión</p>
                {printItems.length === 0 ? (
                  <p className="text-xs text-muted-foreground">Sin impresiones asociadas.</p>
                ) : (
                  <ul className="mt-2 space-y-1">
                    {printItems.map((item) => (
                      <li key={item.id} className="flex justify-between">
                        <span>
                          {item.photo?.description || `Foto ${item.photo_id}`} • Formato no especificado
                          <span className="text-muted-foreground"> (TODO backend: persistir formato)</span>
                        </span>
                        <span className="font-semibold">${item.price}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </CardContent>
          </Card>

          {/* Download All Button */}
          {canDownload && (
            <div className="mb-6">
              <Button
                onClick={handleDownloadAll}
                disabled={isDownloadingAll}
                className="w-full rounded-xl bg-primary py-6 text-lg font-semibold text-foreground hover:bg-primary-hover"
              >
                {isDownloadingAll ? (
                  <>
                    <Loader2 className="mr-2 h-5 w-5 animate-spin" />
                    Preparando Descarga...
                  </>
                ) : (
                  <>
                    <Download className="mr-2 h-5 w-5" />
                    Descargar Todas las Fotos ({orderPhotos.length})
                  </>
                )}
              </Button>
            </div>
          )}

          {/* Photos Grid */}
          <Card className="rounded-2xl border-gray-200 shadow-lg">
            <CardHeader>
              <CardTitle>Tus Fotos ({orderPhotos.length})</CardTitle>
              <CardDescription>
                {canDownload
                  ? "Haz clic en cada foto para descargarla individualmente"
                  : "Las fotos estarán disponibles una vez confirmado el pago"}
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {orderPhotos.map((photo) => (
                  <div
                    key={photo.id}
                    className="group relative overflow-hidden rounded-xl border border-gray-200 bg-muted"
                  >
                    <div className="aspect-square relative">
                      <WatermarkedImage
                        src={photo.watermark_url || "/placeholder.svg"}
                        alt={photo.description || "Foto"}
                        fill
                        objectFit="cover"
                      />
                    </div>
                    <div className="p-3">
                      <p className="font-semibold">{photo.description || "Foto"}</p>
                      <div className="mt-1 flex items-center gap-2 text-xs text-muted-foreground">
                        <span className="flex items-center gap-1">
                          <Calendar className="h-3 w-3" />
                          {formatOrderDate()}
                        </span>
                      </div>
                      {canDownload && (
                        <Button
                          onClick={() => handleDownload(photo.id.toString())}
                          size="sm"
                          disabled={!!downloadingPhotoId}
                          className="mt-3 w-full rounded-lg bg-primary text-foreground hover:bg-primary-hover"
                        >
                          {downloadingPhotoId === photo.id.toString() ? (
                            <>
                              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                              Descargando...
                            </>
                          ) : (
                            <>
                              <Download className="mr-2 h-3 w-3" />
                              Descargar
                            </>
                          )}
                        </Button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          {/* Help Section */}
          <Card className="mt-6 rounded-2xl border-gray-200 shadow-lg">
            <CardHeader>
              <CardTitle>¿Necesitas ayuda?</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 text-sm text-muted-foreground">
              <p>• Las fotos están disponibles en alta resolución</p>
              <p>• Puedes descargarlas cuantas veces necesites</p>
              <p>• Si tienes problemas, contacta a somosfotospatagonia@gmail.com</p>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  )
}
