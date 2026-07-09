"use client"

import { useMemo, useState, useEffect, useRef } from "react"
import { useParams } from "next/navigation"
import { Header } from "@/components/organisms/header"
import { useAlbums } from "@/hooks/albums/useAlbums"
import { PhotoThumbnail } from "@/components/molecules/photo-thumbnail"
import { PhotoViewerModal } from "@/components/organisms/photo-viewer-modal"
import { useCartStore, useLightboxStore, useGalleryStore, useAuthStore } from "@/lib/store"
import { Button } from "@/components/ui/button"
import { ArrowLeft, Calendar, MapPin, Plus, Loader2 } from "lucide-react"
import Link from "next/link"
import { FilterBar } from "@/components/molecules/filter-bar"
import { mapBackendPhotoToPhoto } from "@/lib/mappers/photos"
import type { BackendPhoto } from "@/hooks/photos/usePhotos"
import type { Photo } from "@/lib/types"
import { PhotoModal } from "@/components/organisms/photo-modal"
import { formatDateOnly, parseUtcNaiveDate } from "@/lib/datetime"
import { photoHourKey } from "@/lib/datetime"
import { findClosestHourWithPhotos } from "@/lib/time-slots"
import { isAdmin } from "@/lib/types"
import { isStaff } from "@/lib/permissions"
import { FilterBarAlbum } from "@/components/molecules/filter-bar-albums"
import { FilterBarPhotos } from "@/components/molecules/filterBarPhotos"


export default function AlbumDetailPage() {
  const params = useParams()
  const id = params.id as string
  const { data: albumData, loading, error, refetch } = useAlbums(id)
  const [filters, setFilters] = useState<{ date?: string; place?: string; time?: string }>({})
  const [isUploadModalOpen, setIsUploadModalOpen] = useState(false)
  const { user,isAuthenticated } = useAuthStore()
  const isStaffUser = isAuthenticated && isStaff(user)
  const eventDateMs = (value?: string | null) => parseUtcNaiveDate(value)?.getTime() ?? 0
  const [selectedPhotographer, setSelectedPhotographer] = useState("all")
  const [selectedTag, setSelectedTag] = useState("all")
  const [sortBy, setSortBy] = useState<"recent" | "oldest">("recent")
  
  // Polling cada ~7s (solo con pestaña visible): refresca el álbum en segundo
  // plano (silent) para reflejar fotos agregadas sin recargar la página.
  const refetchRef = useRef(refetch)
  useEffect(() => {
    refetchRef.current = refetch
  }, [refetch])
  useEffect(() => {
    const POLL_MS = 7000
    const timer = setInterval(() => {
      if (typeof document !== "undefined" && document.visibilityState !== "visible") return
      refetchRef.current?.({ silent: true })
    }, POLL_MS)
    return () => clearInterval(timer)
  }, [])

  // Cache de fotos por id: conserva la MISMA referencia de objeto entre refrescos
  // mientras la foto no cambie. Así la foto abierta no parpadea y el navegador
  // mantiene la posición del scroll cuando llegan fotos nuevas (no re-crea el DOM).
  const photoIdentityCache = useRef<Map<string | number, { sig: string; photo: Photo }>>(new Map())

  // Transform backend data
  const album = albumData && !Array.isArray(albumData) ? albumData : null
  // Debug: registrar el orden crudo de sesiones recibido
  useEffect(() => {
    if (process.env.NODE_ENV === "production") return
    if (!album?.sessions) return

    /* console.log("[AlbumDetail][sessions order]", album.sessions.map((session: any) => ({
      id: session.id,
      event_date: session.event_date,
    }))) */
  }, [album])
  
  // Get all photos from all sessions in the album
  const albumPhotos = useMemo(() => {
    if (!album || !album.sessions) return []
  
    const debugEntries: Array<{
      photoId: string | number
      filename?: string
      sessionId?: number
      sessionEventDate?: string
    }> = []

    const photos: Photo[] = []
  
    album.sessions.forEach((session: any) => {
      if (session.photos && Array.isArray(session.photos)) {
        session.photos.forEach((photo: any) => {
          const backendPhoto: BackendPhoto = {
            id: photo.id,
            filename: photo.filename || `photo-${photo.id}`,
            description: photo.description,
            price: photo.price,
            object_name: photo.object_name,
            photographer_id: photo.photographer_id ?? session.photographer_id ?? 0,
            session_id: session.id,
            photographer: photo.photographer ?? session.photographer,
            session: {
              id: session.id,
              album_id: session.album_id ?? (album.id ? Number(album.id) : undefined),
              event_date: session.event_date,
              event_name: session.event_name,
              location: session.location,
              photographer_id: session.photographer_id,
              photographer: session.photographer,
            },
            tags: photo.tags,
          }
  
          if (process.env.NODE_ENV !== "production") {
            debugEntries.push({
              photoId: backendPhoto.id ?? photo.id,
              filename: backendPhoto.filename,
              sessionId: backendPhoto.session?.id,
              sessionEventDate: backendPhoto.session?.event_date ?? undefined,
            })
          }

          const mappedPhoto = mapBackendPhotoToPhoto(backendPhoto, {
            session: backendPhoto.session,
            albumName: album.name,
          })
          // Reusar el objeto anterior si la foto no cambió (misma identidad):
          // evita parpadeo de la foto abierta y salto de scroll al refrescar.
          const sig = `${mappedPhoto.objectName}|${mappedPhoto.price}|${mappedPhoto.tags?.length ?? 0}`
          const cached = photoIdentityCache.current.get(mappedPhoto.id)
          if (cached && cached.sig === sig) {
            photos.push(cached.photo)
          } else {
            photoIdentityCache.current.set(mappedPhoto.id, { sig, photo: mappedPhoto })
            photos.push(mappedPhoto)
          }
        })
      }
    })
  
    if (process.env.NODE_ENV !== "production") {
      //console.log("[AlbumDetail][flattened photos - first 15]", debugEntries.slice(0, 15))
      //console.log("[AlbumDetail][flattened photos - last 15]", debugEntries.slice(-15))
    }

    const sortedPhotos = [...photos].sort((a, b) => {
      const dateA = eventDateMs(a.takenAt ?? null)
      const dateB = eventDateMs(b.takenAt ?? null)
    
      // 1️⃣ Sesión más nueva primero
      if (dateA !== dateB) {
        return dateB - dateA
      }
    
      // 2️⃣ Dentro de la misma sesión → ID de foto descendente
      return Number(b.id) - Number(a.id)
    })

    if (process.env.NODE_ENV !== "production") {
      const toDebugFields = (p: any) => ({
        photoId: p.id,
        sessionId: p.session?.id,
        sessionEventDate: p.session?.event_date,
        filename: p.filename,
      })

      const sortedDebug = sortedPhotos.map(toDebugFields)

      for (let i = 1; i < sortedPhotos.length; i++) {
        const prev = sortedPhotos[i - 1] as any
        const curr = sortedPhotos[i] as any

        const prevDate = eventDateMs(prev.session?.event_date ?? null)
        const currDate = eventDateMs(curr.session?.event_date ?? null)
        const prevIdNum = Number(prev.id)
        const currIdNum = Number(curr.id)

        const hasInversion =
          prevDate < currDate ||
          (prevDate === currDate &&
            !Number.isNaN(prevIdNum) &&
            !Number.isNaN(currIdNum) &&
            prevIdNum < currIdNum)

        if (hasInversion) {
          console.warn("[AlbumDetail][sort inversion]", {
            indexPrev: i - 1,
            indexCurr: i,
            prev: {
              id: prev.id,
              sessionDate: prev.session?.event_date,
              filename: prev.filename,
            },
            curr: {
              id: curr.id,
              sessionDate: curr.session?.event_date,
              filename: curr.filename,
            },
          })
        }
      }
    }

    return sortedPhotos
  }, [album])
  
  const photoTags = useMemo(() => {
    const set = new Set<string>()
    albumPhotos.forEach((photo: any) => {
      photo.tags?.forEach((t: any) => set.add(String(t.name ?? t)))
    })
    return Array.from(set).sort()
  }, [albumPhotos])
  
  const baseFilteredPhotos = useMemo(() => {
    return albumPhotos.filter((photo) => {
      const photoDate = photo.takenAt?.split("T")[0]
      return filters.date ? photoDate === filters.date : true
    })
  }, [albumPhotos, filters.date])
  
  const effectiveHourKey = useMemo(() => {
    if (!filters.time) return null
    return findClosestHourWithPhotos(baseFilteredPhotos, filters.time)
  }, [filters.time, baseFilteredPhotos])
 
  
  const hasActiveFilters = Boolean(filters.date || filters.place || filters.time)
  const handleFilterChange = (newFilters: { date?: string; place?: string; time?: string }) => {
    setFilters(newFilters)
  }

  const photosToDisplay = useMemo(() => {
    let result = [...baseFilteredPhotos]
  
    // Fotógrafo
    if (selectedPhotographer !== "all") {
      result = result.filter(
        (p: any) =>
          String(p.photographer?.id ?? p.session?.photographer_id) ===
          selectedPhotographer,
      )
    }
  
    // Tag
    if (selectedTag !== "all") {
      result = result.filter((p: any) =>
        p.tags?.some((t: any) =>
          String(t.name ?? t) === selectedTag
        ),
      )
    }
  
    // Hora (ya existente)
    if (filters.time && effectiveHourKey) {
      result = result.filter(
        (photo) => photoHourKey(photo) === effectiveHourKey
      )
    }
  
    // Orden
    result.sort((a, b) => {
      const da = eventDateMs(a.takenAt ?? null)
      const db = eventDateMs(b.takenAt ?? null)
      return sortBy === "recent" ? db - da : da - db
    })
  
    return result
  }, [
    baseFilteredPhotos,
    selectedPhotographer,
    selectedTag,
    sortBy,
    filters.time,
    effectiveHourKey,
  ])
  
  useEffect(() => {
    if (process.env.NODE_ENV === "production") return
    if (!albumPhotos.length) return
  
    console.log("[AlbumDetail] photographer debug")
    console.table(
      albumPhotos.slice(0, 10).map((p: any) => ({
        photoId: p.id,
        photographerId: p.photographerId,
        photographer_nested_id: p.photographer?.id,
        session_photographer_id: p.session?.photographer_id,
        session_photographer_nested_id: p.session?.photographer?.id,
      })),
    )
  }, [albumPhotos])
  
  useEffect(() => {
    if (process.env.NODE_ENV === "production") return

    const debugDisplay = photosToDisplay.slice(0, 15).map((p) => {
      const photoAny = p as any
      return {
        photoId: photoAny.id,
        sessionId: photoAny.session?.id,
        sessionEventDate: photoAny.session?.event_date,
        filename: photoAny.filename,
      }
    })

  
  }, [photosToDisplay, albumPhotos, hasActiveFilters])
  
  // Get unique photographers from sessions
  const albumPhotographers = useMemo(() => {
    if (!album || !album.sessions) return []
    const photographers = new Map()
    album.sessions.forEach((session: any) => {
      if (session.photographer) {
        photographers.set(session.photographer.id, session.photographer)
      }
    })
    return Array.from(photographers.values())
  }, [album])

  const { addItem, items, toggleFavorite, togglePrinter, toggleSelected, removeFromCartIfUnselected } = useCartStore()
  const { setPhotos } = useGalleryStore()
  const { isOpen, currentPhotoId, open, close, next, prev } = useLightboxStore()

  // Derivar selectedPhotos del cart store
  const selectedPhotos = useMemo(() => 
    items.filter((item) => item.selected).map((item) => item.photoId),
    [items]
  )

  useEffect(() => {
    setPhotos(albumPhotos)
  }, [albumPhotos, setPhotos])

  // Loading state
  if (loading) {
    return (
      <div className="min-h-screen bg-background">
        <Header />
        <main className="container mx-auto px-4 py-8">
          <div className="flex min-h-[400px] items-center justify-center">
            <div className="text-center">
              <Loader2 className="mx-auto h-12 w-12 animate-spin text-primary mb-4" />
              <p className="text-lg text-muted-foreground">Cargando álbum...</p>
            </div>
          </div>
        </main>
      </div>
    )
  }

  // Error state
  if (error || !album) {
    return (
      <div className="min-h-screen bg-background">
        <Header />
        <main className="container mx-auto px-4 py-8">
          <div className="flex min-h-[400px] items-center justify-center">
            <div className="text-center">
              <p className="text-lg text-destructive mb-4">
                {error || "Álbum no encontrado"}
              </p>
              <div className="flex gap-4 justify-center">
                <Button onClick={() => refetch()}>Reintentar</Button>
                <Button variant="outline" asChild>
                  <Link href="/albumes">Volver a Álbumes</Link>
                </Button>
              </div>
            </div>
          </div>
        </main>
      </div>
    )
  }

  // Get event name and location from first session
  const firstSession = album.sessions?.[0]
  const eventName = firstSession?.event_name
  const location = firstSession?.location
  const eventDate = firstSession?.event_date

  const handlePhotoClick = (photoId: string) => {
    open(photoId, photosToDisplay)
  }

  const handleShiftClick = (photoId: string) => {
    addItem(photoId)
  }

  const currentPhoto = currentPhotoId
  ? photosToDisplay.find((p) => p.id === currentPhotoId)
  : null

  

  return (
    <div className="min-h-screen bg-background">
      <Header />

      <main className="container mx-auto px-4 py-8">
        <Button asChild variant="ghost" className="mb-6 rounded-xl hover:bg-[#ffecce]">
          <Link href="/albumes">
            <ArrowLeft className="mr-2 h-4 w-4" />
            Volver a Álbumes
          </Link>
        </Button>

        <div className="mb-8 rounded-2xl bg-card p-6 shadow-md md:p-8">
          <div className="flex flex-col md:flex-row md:items-start md:justify-between">
            <div className="mb-4 md:mb-0">
              <h1 className="mb-4 text-3xl font-heading md:text-4xl">{album.name}</h1>
              {album.description && <p className="mb-4 text-muted-foreground">{album.description}</p>}
              {/* {eventName && <p className="mb-4 text-lg text-muted-foreground">{eventName}</p>} */}
              <div className="flex flex-wrap gap-4 text-sm text-muted-foreground">
                {location && (
                  <div className="flex items-center gap-2">
                    <MapPin className="h-4 w-4" />
                    <span>{location}</span>
                  </div>
                )}
                {eventDate && (
                  <div className="flex items-center gap-2">
                    <Calendar className="h-4 w-4" />
                    <span>
                      {formatDateOnly(eventDate)}
                    </span>
                  </div>
                )}
              </div>
            </div>
            {isAuthenticated && (
              <Button onClick={() => setIsUploadModalOpen(true)} className="rounded-xl">
                <Plus className="mr-2 h-4 w-4" />
                Añadir Fotos
              </Button>
            )}
          </div>
        </div>

        <div className="mb-8">
        <FilterBar onFilterChange={handleFilterChange} />
      </div>

      <div className="mb-8">
        <FilterBarPhotos
          photographers={albumPhotographers}
          tags={photoTags}
          selectedPhotographer={selectedPhotographer}
          onSelectedPhotographerChange={setSelectedPhotographer}
          selectedTag={selectedTag}
          onSelectedTagChange={setSelectedTag}
          sortBy={sortBy}
          onSortByChange={setSortBy}
        />
      </div>

   

        {albumPhotos.length === 0 ? (
          <div className="py-20 text-center">
            <p className="text-lg text-muted-foreground">Este álbum aún no tiene fotos</p>
          </div>
        ) : photosToDisplay.length === 0 && !filters.time ? (
          <div className="py-20 text-center">
            <p className="text-lg text-muted-foreground">
              {hasActiveFilters
                ? "No encontramos fotos que coincidan con los filtros seleccionados."
                : "Este álbum aún no tiene fotos disponibles."}
            </p>
          </div>
        ) : (
          <>
            <div className="mb-4 text-sm text-muted-foreground">
              <p>
                Haz clic en una foto para verla en detalle. Usa Shift+Clic para agregar al carrito o checkboxes para
                selección múltiple. Marca con ❤️ tus favoritas o con 🖨️ las que quieres imprimir.
              </p>
            </div>
            <div className="grid-photo-select">
            {photosToDisplay.map((photo) => {
                const cartItem = items.find((item) => item.photoId === photo.id)
                const isSelected = !!cartItem?.selected
                return (
                  <PhotoThumbnail
                    isStaffUser={!!isStaffUser}
                    key={photo.id}
                    photo={photo}
                    onClick={() => handlePhotoClick(photo.id)}
                    onShiftClick={() => handleShiftClick(photo.id)}
                    isSelected={cartItem?.selected || false}
                    onToggleSelect={() => {
                      if (isSelected) {
                        // deselección → posible limpieza
                        toggleSelected(photo.id)
                        removeFromCartIfUnselected(photo.id)
                      } else {
                        // selección → siempre permitir agregar
                        toggleSelected(photo.id)
                      }
                    }}
                    
                    isFavorite={cartItem?.favorite || false}
                    isPrinter={cartItem?.printer || false}
                    onToggleFavorite={() => toggleFavorite(photo.id)}
                    onTogglePrinter={() => togglePrinter(photo.id)}
                  />
                )
              })}
            </div>
          </>
        )}
      </main>

      {isOpen && currentPhoto && (
        <PhotoViewerModal photo={currentPhoto} onClose={close} onNext={next} onPrev={prev} />
      )}

      <PhotoModal
        open={isUploadModalOpen}
        onOpenChange={setIsUploadModalOpen}
        mode="add"
        albumId={album.id ? Number(album.id) : undefined}
        onSave={() => {
          setIsUploadModalOpen(false);
          refetch();
        }}
      />
    </div>
  )
}

