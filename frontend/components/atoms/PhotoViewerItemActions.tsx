"use client"

import Link from "next/link"
import { Heart, ShoppingCart } from "lucide-react"
import { cn } from "@/lib/utils"
import { useCartStore } from "@/lib/store"
import type { Photo } from "@/lib/types"

interface PhotoViewerItemActionsProps {
  photo: Photo
}

export function PhotoViewerItemActions({ photo }: PhotoViewerItemActionsProps) {
  const { items, toggleFavorite, toggleSelected, removeFromCartIfUnselected } = useCartStore()

  const cartItem = items.find((i) => i.photoId === photo.id)
  const isInCart = !!cartItem
  const isFavorite = cartItem?.favorite ?? false

  return (
    <div
      className={cn(
        "photo-viewer-item-actions",
        isInCart && "is-in-cart"
      )}
    >
      {/* ❤️ FAVORITO */}
      <button
        onClick={() => toggleFavorite(photo.id)}
        className={cn(
          "photo-viewer-item-btn",
          isFavorite && "is-active"
        )}
        aria-label="Favorito"
      >
        <Heart className={cn("h-5 w-5", isFavorite && "fill-current")} />
      </button>

      {/* 🛒 AGREGAR AL CARRITO */}
      <button
        onClick={() => {
          // Sin item: agregar. Con item: alternar y limpiar si queda sin intención.
          // (Llamar removeFromCartIfUnselected siempre anulaba el alta.)
          toggleSelected(photo.id)
          if (isInCart) removeFromCartIfUnselected(photo.id)
        }}
        className={cn(
          "photo-viewer-item-btn",
          isInCart && "is-active"
        )}
        aria-label="Agregar al carrito"
      >
        <ShoppingCart className="h-5 w-5" />
      </button>

      {/* 👉 VER CARRITO (solo si está en carrito) */}
      {isInCart && (
        <Link
          href="/carrito"
          className="photo-viewer-item-btn is-cart-link"
        >
          Ver carrito
        </Link>
      )}
    </div>
  )
}
