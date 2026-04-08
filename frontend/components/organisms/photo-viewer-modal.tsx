"use client"

import { useEffect } from "react"
import { X, Heart, ShoppingCart, ChevronLeft, ChevronRight, MapPin, Calendar, Clock, Printer, Image as ImageIcon, Link as LinkIcon } from "lucide-react"
import type { Photo } from "@/lib/types"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { useAuthStore, useCartStore } from "@/lib/store"
import WatermarkedImage from "@/components/organisms/WatermarkedImage"
import { formatPhotoDate } from "@/lib/datetime"
import { usePhotoViewerImage } from "@/hooks/photos/usePhotoViewerImage"
import { useState } from "react"
import { isAdmin } from "@/lib/types"
import { useRouter } from "next/navigation"
import Link from "next/link"
import { usePresignedUrl } from "@/hooks/photos/usePresignedUrl"
import { buildThumbObjectName } from "@/lib/photo-thumbnails"
import { PhotoViewerItemActions } from "@/components/atoms/PhotoViewerItemActions"
import { isStaff } from "@/lib/permissions";


interface PhotoViewerModalProps {
  photo: Photo
  nextPhoto?: Photo | null
  onClose: () => void
  onNext: () => void
  onPrev: () => void
}


export function PhotoViewerModal({ photo,  nextPhoto, onClose, onNext, onPrev }: PhotoViewerModalProps) {
  const { items, toggleSelected, toggleFavorite, togglePrinter, removeFromCartIfUnselected, addItem, removeFromCartExplicit } = useCartStore()

  const {
    displayUrl,
    previewUrl,
    originalUrl,
    previewLoading,
    originalLoading,
    error: imageError,
  } = usePhotoViewerImage(photo)

  const isInitialLoading = (previewLoading || originalLoading) && !displayUrl
  const showError = !!imageError || (!displayUrl && !previewLoading && !originalLoading)

  const cartItem = items.find((item) => item.photoId === photo.id)
  const isInCart = !!cartItem
  const isFavorite = cartItem?.favorite || false
  const isPrinter = cartItem?.printer || false
  
  const [isFullscreen, setIsFullscreen] = useState(false)
  const router = useRouter()
  useEffect(() => {
    if (isFullscreen) return
  
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose()
      if (e.key === "ArrowLeft") onPrev()
      if (e.key === "ArrowRight") onNext()
    }
  
    window.addEventListener("keydown", handleKeyDown)
    return () => window.removeEventListener("keydown", handleKeyDown)
  }, [onClose, onNext, onPrev, isFullscreen])
  useEffect(() => {
    if (!isFullscreen) return
  
    const handleFullscreenKeys = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setIsFullscreen(false)
        return
      }
  
      if (e.key === "ArrowLeft") {
        onPrev()
      }
  
      if (e.key === "ArrowRight") {
        onNext()
      }
    }
  
    window.addEventListener("keydown", handleFullscreenKeys)
    return () => window.removeEventListener("keydown", handleFullscreenKeys)
  }, [isFullscreen, onNext, onPrev])
  

  const handleToggleCart = () => {
    if (isInCart) {
      removeFromCartExplicit(photo.id)
    } else {
      addItem(photo.id)
    }
  }

  const handleToggleFavorite = () => {
    toggleFavorite(photo.id)
  }

  const handleTogglePrinter = () => {
    togglePrinter(photo.id)
  }
  const { user, isAuthenticated } = useAuthStore()

  const isStaffUser = isAuthenticated && isStaff(user);

  function NextPhotoPreview({ photo }: { photo: Photo }) {
    const previewObjectName =
      photo.previewObjectName ?? buildThumbObjectName(photo.objectName)
  
    const { url } = usePresignedUrl(previewObjectName)
  
    const cartItem = items.find((i) => i.photoId === photo.id)
    const isInCart = !!cartItem
    const isFavorite = cartItem?.favorite ?? false
  
    if (!url) return null
  
    return (
      <div className="photo-viewer-mobile-item opacity-80">
        <WatermarkedImage
          src={url}
          alt="Siguiente foto"
          fill
          objectFit="contain"
          sizes="100vw"
        />
  
        {/* 🔥 BOTONERA COMPLETA */}
        <PhotoViewerItemActions photo={photo} />
      </div>
    )
  }
  

  

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/90 p-4">
      <button
        onClick={onClose}
        className="absolute right-4 top-4 z-10 rounded-full bg-white/10 p-2 text-white transition-colors hover:bg-white/20"
        aria-label="Cerrar"
      >
        <X className="h-6 w-6" />
      </button>

      <button
        onClick={onPrev}
        className="absolute left-4 top-1/2 z-10 -translate-y-1/2 rounded-full bg-white/10 p-3 text-white transition-colors hover:bg-white/20"
        aria-label="Foto anterior"
      >
        <ChevronLeft className="h-6 w-6" />
      </button>

      <button
        onClick={onNext}
        className="absolute right-4 top-1/2 z-10 -translate-y-1/2 rounded-full bg-white/10 p-3 text-white transition-colors hover:bg-white/20"
        aria-label="Siguiente foto"
      >
        <ChevronRight className="h-6 w-6" />
      </button>

      <div className="flex h-full w-full max-w-7xl flex-col gap-4 lg:flex-row">
              {/* VISOR */}
          <div className="flex-1 m-4 lg:m-10 max-h-[90vh]">
         
          <div className="photo-viewer-mobile lg:hidden flex flex-col h-full">
          <div className="photo-viewer-mobile-item flex-1 relative">

                {displayUrl && (
                  <WatermarkedImage
                    src={displayUrl}
                    alt={`Foto de ${photo.place || "Patagonia"}`}
                    fill
                    objectFit="contain"
                    sizes="100vw"
                    priority
                  />
                )}

                  <PhotoViewerItemActions photo={photo} />

                  </div>


                    {/* foto siguiente REAL — SOLO MOBILE */}
                  <div className="lg:hidden">
                    {nextPhoto && <NextPhotoPreview photo={nextPhoto} />}
                  </div>
              </div>
          </div>


        <div className="hidden lg:flex w-full flex-col gap-4 rounded-2xl bg-card p-6 lg:w-96">
        <div className="flex items-start justify-between">
            <div>
              <h2 className="text-2xl font-heading">
                  <span className="text-white">{photo.place || "Patagonia"}</span>
              </h2>
              {photo.price && (
                <Badge className="mt-2 bg-primary text-foreground">
                  ${photo.price}
                </Badge>
              )}
            </div>

           <div className="flex gap-2">
           {isStaffUser &&  <button
                onClick={() => setIsFullscreen(true)}
                className="rounded-full bg-muted p-2 text-muted-foreground transition-colors hover:bg-muted/80"
                aria-label="Ver en pantalla completa"
              >
                <ImageIcon className="h-5 w-5" />
              </button>}

              <button
                onClick={handleToggleFavorite}
                className={cn(
                  "rounded-full p-2 transition-colors",
                  isFavorite
                    ? "bg-primary text-foreground"
                    : "bg-muted text-muted-foreground hover:bg-muted/80"
                )}
                aria-label={isFavorite ? "Quitar de favoritos" : "Agregar a favoritos"}
              >
                <Heart className={cn("h-5 w-5", isFavorite && "fill-current")} />
              </button>

              {isStaffUser && <button
                onClick={handleTogglePrinter}
                className={cn(
                  "rounded-full p-2 transition-colors",
                  isPrinter
                    ? "bg-secondary text-foreground"
                    : "bg-muted text-muted-foreground hover:bg-muted/80"
                )}
                aria-label={isPrinter ? "Quitar de impresión" : "Marcar para imprimir"}
              >
                <Printer className="h-5 w-5" />
              </button>}
            </div>
          </div>

          <div className="space-y-3 border-t border-gray-200 pt-4">
            {photo.takenAt && (
              <div className="flex items-center gap-3 text-sm">
                <Calendar className="h-4 w-4 text-white" />
                <span className="text-white">Fecha:</span>
                <span className="font-medium text-white">
                  {formatPhotoDate(photo.takenAt)}
                </span>
              </div>
            )}

            {photo.timeSlot && (
              <div className="flex items-center gap-3 text-sm">
                <Clock className="h-4 w-4 text-white" />
                <span className="text-white">Hora:</span>
                <span className="font-medium text-white">{photo.timeSlot}</span>
              </div>
            )}

            {photo.place && (
              <div className="flex items-center gap-3 text-sm">
                <MapPin className="h-4 w-4 text-white" />
                <span className="text-white">Album:</span>
                <span className="font-medium text-white">{photo.albumName}</span>
              </div>
            )}
          </div>

          <div className="mt-auto space-y-3 border-t border-gray-200 pt-4">
           {/*  <Button
              onClick={handleToggleCart}
              className={cn(
                "w-full rounded-xl font-semibold",
                isInCart
                  ? "bg-muted text-muted-foreground hover:bg-muted/80"
                  : "bg-primary text-foreground hover:bg-primary-hover"
              )}
            >
              <ShoppingCart className="mr-2 h-4 w-4" />
              {isInCart ? "Quitar del carrito" : "Agregar al carrito"}
            </Button> */}




<div className="w-full flex gap-2">
  {isInCart ? (
    <>
    <div className="w-full flex gap-2">

 
      <Button
        onClick={handleToggleCart}
        className="w-full rounded-xl font-semibold bg-muted text-muted-foreground hover:bg-muted/80"
      >
        <ShoppingCart className="mr-2 h-2 w-2" />
        Quitar del carrito
      </Button>
      </div>
      <div className="w-full flex gap-2">
      <Link href="/carrito" className="w-full">
        <Button
          type="button"
          className="w-full rounded-xl font-semibold bg-primary text-foreground hover:bg-primary-hover"
        >
          Ver carrito
        </Button>
      </Link>
      </div>
    </>
  ) : (
    <Button
      onClick={handleToggleCart}
      className="w-full rounded-xl font-semibold bg-primary text-foreground hover:bg-primary-hover"
    >
      <ShoppingCart className="mr-2 h-4 w-4" />
      Agregar al carrito
    </Button>
  )}
</div>


            <p className="text-center text-xs text-white">
              Disponible en resolución web y alta resolución para descarga
            </p>
          </div>
        </div>
      </div>
      {isFullscreen && (
  <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black">
    {/* Cerrar */}
    <button
      onClick={() => setIsFullscreen(false)}
      className="absolute right-6 top-6 rounded-full bg-white/10 p-2 text-white hover:bg-white/20"
      aria-label="Cerrar pantalla completa"
    >
      <X className="h-6 w-6" />
    </button>

    {/* Heart */}
    <button
      onClick={handleToggleFavorite}
      className={cn(
        "absolute left-6 top-6 rounded-full p-2 transition-colors",
        isFavorite
          ? "bg-primary text-foreground"
          : "bg-white/10 text-white hover:bg-white/20"
      )}
      aria-label="Agregar a favoritos"
    >
      <Heart className={cn("h-6 w-6", isFavorite && "fill-current")} />
    </button>

    {/* Imagen alta calidad */}
    {originalUrl && (
      <img
        src={originalUrl}
        alt={`Foto en alta resolución de ${photo.place || "Patagonia"}`}
        className="max-h-screen max-w-screen object-contain"
        draggable={false}
        onContextMenu={(e) => e.preventDefault()}
      />
    )}

    {!originalUrl && (
      <div className="text-white">Cargando alta resolución…</div>
    )}
  </div>
)}

    </div>
  )
}
