"use client"

import { useEffect, useState, useMemo } from "react"
import Link from "next/link"
import { useParams } from "next/navigation"
import { ArrowLeft, Download, AlertCircle, Calendar } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import type { Order, OrderItem, OrderItemPhoto } from "@/lib/types" // Mantengo Order y OrderItem
import { OrderStatus } from "@/lib/types"
import { apiFetch } from "@/lib/api"
// Importo Image de Next.js para optimización de imágenes
import Image from "next/image"
import { Logo } from "@/components/atoms/logo"
import { formatDateTime } from "@/lib/datetime"

// Define un tipo para el pedido que incluye los detalles de las fotos en los items
// Usamos OrderItemPhoto directamente, ya que ahora el backend las devuelve con url y watermark_url
type OrderWithPublicPhotoItems = Omit<Order, "items"> & {
  items: Array<Omit<OrderItem, "photo"> & { photo: OrderItemPhoto }>
}

const buildPhotoFilename = (photo: OrderItemPhoto) => {
  const sanitizedDescription = photo.description?.trim().toLowerCase().replace(/\s+/g, "-").replace(/[^a-z0-9-]/g, "") || `foto-${photo.id}`
  return `${sanitizedDescription}.jpg`
}

// Heurística para separar ítems digitales vs impresión sin romper pedidos existentes.
const splitOrderItems = (items: OrderItem[]) => {
  const digital: OrderItem[] = [];
  const print: OrderItem[] = [];

  items.forEach(item => {

    if (item.format) {
      print.push(item);
    } else {
      digital.push(item);
    }
  });

  return { digital, print };
};

/* const triggerFileDownload = (url: string, filename: string) => {
  if (!url || typeof document === "undefined") return
  const anchor = document.createElement("a")
  anchor.href = url
  anchor.download = filename
  anchor.target = "_blank"
  anchor.rel = "noopener noreferrer" // Seguridad
  document.body.appendChild(anchor)
  anchor.click()
  document.body.removeChild(anchor)
}
 */
const triggerFileDownload = async (url: string, filename: string) => {
  try {
    const response = await fetch(url, { credentials: "omit" });
    if (!response.ok) throw new Error("Error al descargar archivo");

    const blob = await response.blob();
    const objectUrl = window.URL.createObjectURL(blob);

    const anchor = document.createElement("a");
    anchor.href = objectUrl;
    anchor.download = filename;
    document.body.appendChild(anchor);
    anchor.click();

    document.body.removeChild(anchor);
    window.URL.revokeObjectURL(objectUrl);
  } catch (error) {
    console.error("Download failed", error);
  }
};

function PhotoGridItem({ photo }: { photo: OrderItemPhoto }) {
  // El backend ya debería proveer photo.url y photo.watermark_url
  // Usamos photo.url directamente, ya que es la versión sin marca de agua
  const imageUrl = photo.url || photo.watermark_url || "/placeholder.svg"

  return (
    <div key={photo.id} className="group relative aspect-square overflow-hidden rounded-xl bg-muted">
      {/* Usar Image de Next.js para optimización */}
      <Image
        src={imageUrl}
        alt={photo.description || "Foto"}
        fill
        objectFit="cover"
        className="transition-transform group-hover:scale-105"
      />
      <div className="absolute inset-0 flex items-center justify-center bg-black/50 opacity-0 transition-opacity group-hover:opacity-100">
        <Button
          size="sm"
          onClick={() => triggerFileDownload(imageUrl, buildPhotoFilename(photo))}
          className="gap-2 rounded-lg bg-primary text-foreground"
        >
          <Download className="h-4 w-4" />
          Descargar
        </Button>
      </div>
    </div>
  )
}

export default function PublicOrderDetailPage() {
  const params = useParams()
  const publicId = params.publicId as string // El publicId (UUID)
  const [order, setOrder] = useState<OrderWithPublicPhotoItems | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [isDownloading, setIsDownloading] = useState(false)

  useEffect(() => {
    if (publicId) {
      const fetchOrder = async () => {
        try {
          setLoading(true)
          // Usar el endpoint público que devuelve el PublicOrderSchema
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
    }
  }, [publicId])

  const orderPageUrl = useMemo(() => {
    if (!order) return ""
    const origin = typeof window !== "undefined" ? window.location.origin : ""
    return `${origin}/pedidos/${order.public_id}`
  }, [order])

  const { digital: digitalItems, print: printItems } = useMemo(
    () => splitOrderItems(order?.items ?? []),
    [order],
  )

  const getStatusBadge = (status: Order["order_status"] | undefined) => {
    const statusConfig = {
      [OrderStatus.PENDING]: { label: "Pendiente", className: "bg-yellow-500/10 text-yellow-600" },
      [OrderStatus.PAID]: { label: "Pagado", className: "bg-green-500/10 text-green-600" },
      [OrderStatus.COMPLETED]: { label: "Completado", className: "bg-blue-500/10 text-blue-600" },
      [OrderStatus.REJECTED]: { label: "Rechazado", className: "bg-red-500/10 text-red-600" },
    } as const

    if (!status || !(status in statusConfig)) {
      return {
        label: "Desconocido",
        className: "bg-gray-500/10 text-gray-600",
      }
    }
    return statusConfig[status as keyof typeof statusConfig]
  }

 /*  const allOrderPhotos = (order?.items ?? [])
    .map((item) => item.photo)
    .filter((photo): photo is NonNullable<OrderItemPhoto> => Boolean(photo)) */

    const digitalOrderPhotos = useMemo(() => {
      if (!order?.items) return [];
    
      const seen = new Set<number>();
    
      return order.items
        .filter((item) => !item.format) // 👉 SOLO DIGITALES
        .map((item) => item.photo)
        .filter((photo): photo is OrderItemPhoto => {
          if (!photo) return false;
          if (seen.has(photo.id)) return false;
          seen.add(photo.id);
          return true;
        });
    }, [order?.items]);
    

  const statusInfo = getStatusBadge(order?.order_status)

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <p className="text-muted-foreground">Cargando datos del pedido...</p>
      </div>
    )
  }

  if (error || !order) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-4">
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


  const handleDownloadAll = async () => {
    if (!digitalOrderPhotos.length || isDownloading) return;
  
    setIsDownloading(true);
    try {
      const downloadPromises = digitalOrderPhotos.map(async (photo) => {
        const url = photo.url || photo.watermark_url;
        if (!url) return;
  
        await triggerFileDownload(url, buildPhotoFilename(photo));
        // Pausa mínima para evitar bloqueo del navegador en descargas sucesivas
        await new Promise((r) => setTimeout(r, 300));
      });
      await Promise.all(downloadPromises);
    } catch (error) {
      console.error("Error descargando fotos", error);
    } finally {
      setIsDownloading(false);
    }
  };
  

  const formatOrderDate = (dateValue: string | undefined | null) => {
    if (!dateValue) return "Sin fecha"
    const formatted = formatDateTime(dateValue)
    return formatted || "Fecha inválida"
  }

  const isPaidOrCompleted = order.order_status === OrderStatus.PAID || order.order_status === OrderStatus.COMPLETED

  return (
    <div className="min-h-screen bg-background">
      {/* Header simple para la página pública */}
      <div className="container mx-auto px-4 py-4 flex justify-between items-center border-b border-gray-200">
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

          <div className="mb-8 text-center">
            <div className="mx-auto mb-4 flex h-20 w-20 items-center justify-center rounded-full bg-primary/10">
              <Download className="h-10 w-10 text-primary" />
            </div>
            <h1 className="mb-2 text-4xl font-bold text-balance">Tu Pedido #{order.id}</h1>
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
                {statusInfo && (
                  <Badge className={statusInfo.className}>{statusInfo.label}</Badge>
                )}
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

          {/* Semántica de ítems para futuras vistas de UI */}
        {/*   <Card className="mb-6 rounded-2xl border-gray-200 shadow-lg">
            <CardHeader>
              <CardTitle>Detalle de ítems</CardTitle>
              <CardDescription>
                Separá en UI: fotos digitales vs ítems de impresión 
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4 text-sm">
              <div>
                <p className="font-semibold text-muted-foreground">Fotos digitales</p>
                {digitalItems.length === 0 ? (
                  <p className="text-xs text-muted-foreground">No hay ítems digitales registrados.</p>
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
                          {item.photo?.description || `Foto ${item.photo_id}`}{item.format && ` • Formato: ${item.format}`}
                        </span>
                        <span className="font-semibold">${item.price}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </CardContent>
          </Card> */}

          {/* Download All Button - Mostrar solo si está pagado/completado */}
          {isPaidOrCompleted && (
            <div className="mb-6">
              <Button
                onClick={handleDownloadAll}
                disabled={isDownloading}
                className="w-full rounded-xl bg-primary py-6 text-lg font-semibold text-foreground hover:bg-primary-hover"
              >
                <Download className="mr-2 h-5 w-5" />
                {isDownloading ? "Descargando..." : `Descargar Todas las Fotos (${digitalOrderPhotos.length})`}
              </Button>
            </div>
          )}

          {/* Photos Grid - Mostrar solo si hay fotos y si está pagado/completado */}
          {digitalOrderPhotos.length > 0 && isPaidOrCompleted && (
            <Card className="rounded-2xl border-gray-200 shadow-lg">
              <CardHeader>
                <CardTitle>Tus Fotos ({digitalOrderPhotos.length})</CardTitle>
                <CardDescription>Haz clic en cada foto para descargarla individualmente</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-4">
                  {digitalOrderPhotos.map((photo) => (
                    <PhotoGridItem key={photo.id} photo={photo} />
                  ))}
                </div>
              </CardContent>
            </Card>
          )}

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
