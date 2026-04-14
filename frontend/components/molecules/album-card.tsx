"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { Camera, Calendar } from "lucide-react";
import { usePresignedUrl } from "@/hooks/photos/usePresignedUrl";
import { buildThumbObjectName } from "@/lib/photo-thumbnails";
import { formatDateOnly } from "@/lib/datetime";
import type { AlbumListItem } from "@/lib/types";

export function AlbumCard({ album }: { album: AlbumListItem }) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (isVisible) return;
    const el = containerRef.current;
    if (!el) return;

    const observer = new IntersectionObserver(
      (entries) => {
        const entry = entries[0];
        if (!entry) return;
        if (entry.isIntersecting) {
          setIsVisible(true);
          observer.disconnect(); // evitar re-disparos
        }
      },
      { rootMargin: "100px" },
    );

    observer.observe(el);
    return () => observer.disconnect();
  }, [isVisible]);

  const thumbObjectName = buildThumbObjectName(album.coverPhotoObjectName);
  
  // Conditionally skip the hook's API call if we already have the URL from the backend
  const { url: fetchedUrl, loading: isFetching } = usePresignedUrl(thumbObjectName, {
    enabled: isVisible && !album.coverPhotoUrl, // Skip fetch if we already have it!
  });

  // Decide which URL and loading state to use
  const coverPhotoUrl = album.coverPhotoUrl || fetchedUrl;
  const isLoading = !album.coverPhotoUrl && isFetching;

  const hasPhotos = album.photoCount > 0;
  const photoLabel = hasPhotos ? album.photoCount : "Sin fotos";
  const badgeAriaLabel = hasPhotos
    ? `${album.photoCount} fotos`
    : "Álbum sin fotos";

  return (
    <Link href={`/albumes/${album.id}`} className="group">
      <div
        ref={containerRef}
        className="overflow-hidden rounded-2xl bg-card shadow-md transition-all duration-300 hover:shadow-xl hover:-translate-y-1"
      >
        {/* Cover Image */}
        <div className="relative aspect-square overflow-hidden bg-secondary">
          {!isVisible || isLoading ? (
            <div className="flex h-full w-full animate-pulse items-center justify-center bg-gray-200">
              <Camera className="h-16 w-16 text-gray-400" />
            </div>
          ) : album.coverPhotoObjectName &&
            coverPhotoUrl &&
            coverPhotoUrl !== "/placeholder.svg" ? (
            <Image
              src={coverPhotoUrl}
              alt={album.name}
              fill
              className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-110"
              sizes="(max-width: 768px) 100vw, (max-width: 1200px) 50vw, 33vw"
            />
          ) : (
            <div className="flex h-full w-full items-center justify-center bg-muted">
              <Camera className="h-16 w-16 text-muted-foreground" />
            </div>
          )}

          <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-black/20 to-transparent opacity-0 transition-opacity duration-300 group-hover:opacity-100" />

          {/* Photo Count Badge */}
          <div
            className="absolute top-3 right-3 flex items-center gap-1 rounded-full bg-black/70 px-3 py-1 text-sm text-white backdrop-blur-sm"
            aria-label={badgeAriaLabel}
            title={badgeAriaLabel}
          >
            <Camera className="h-3 w-3" />
            <span>{photoLabel}</span>
          </div>
        </div>

        {/* Album Info */}
        <div className="p-4">
          <h3 className="mb-2 text-lg font-heading line-clamp-1 group-hover:text-primary transition-colors">
            {album.name}
          </h3>

          <div className="flex flex-col gap-1 text-xs text-muted-foreground">
            {album.createdAt && (
              <div className="flex items-center gap-1">
                <Calendar className="h-3 w-3" />
                <span>{formatDateOnly(album.createdAt)}</span>
              </div>
            )}
          </div>
        </div>
      </div>
    </Link>
  );
}
