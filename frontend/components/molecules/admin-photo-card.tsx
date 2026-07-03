"use client";

import { memo, useState } from "react";
import Image from "next/image";
import { Check, Pencil, Trash, Image as ImageIcon } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { usePresignedUrl } from "@/hooks/photos/usePresignedUrl";
import { buildThumbObjectName } from "@/lib/photo-thumbnails";
import type { BackendPhoto } from "@/hooks/photos/usePhotos"; // Ajusta la ruta si es necesario

interface AdminPhotoCardProps {
  photo: BackendPhoto;
  isSelected: boolean;
  onCheckboxClick: (e: React.MouseEvent, id: number) => void;
  onEdit: (photo: BackendPhoto) => void;
  onDelete: (photo: BackendPhoto) => void;
}

function AdminPhotoCardComponent({
  photo,
  isSelected,
  onCheckboxClick,
  onEdit,
  onDelete,
}: AdminPhotoCardProps) {
  const previewObjectName =
    photo.thumbnail_object_name ?? buildThumbObjectName(photo.object_name);

  const { url: imageUrl, loading: imageLoading } =
    usePresignedUrl(previewObjectName);

  return (
    <Card
      className={cn(
        // p-0 y gap-0 anulan el padding por defecto del Card base (py-6), que
        // dejaba asomar el fondo crema (bg-muted) arriba y abajo de la foto.
        "group relative overflow-hidden rounded-2xl bg-muted p-0 gap-0 transition-all hover:shadow-xl",
        isSelected && "ring-2 ring-destructive/70"
      )}
    >
      <div className="relative aspect-square overflow-hidden">
        {imageLoading ? (
          <div className="flex h-full w-full animate-pulse items-center justify-center bg-gray-200">
            <ImageIcon className="h-12 w-12 text-gray-400" />
          </div>
        ) : (
          <Image
            src={imageUrl}
            alt={photo.filename}
            fill
            className="object-cover transition-transform duration-300 group-hover:scale-105"
          />
        )}

        {/* SELECCIÓN */}
        <div className="absolute right-3 top-3 z-20">
          <button
            onClick={(e) => onCheckboxClick(e, photo.id)}
            className={cn(
              "flex h-8 w-8 items-center justify-center rounded-full border-2 transition-all",
              isSelected
                ? "border-destructive bg-destructive text-white shadow-lg"
                : "border-white bg-white/20 backdrop-blur hover:bg-white/40"
            )}
          >
            {isSelected && <Check className="h-4 w-4" strokeWidth={3} />}
          </button>
        </div>

        {/* ACCIONES (hover) */}
        <div className="absolute left-3 top-3 z-20 flex gap-2 opacity-0 transition-opacity group-hover:opacity-100">
          <Button
            size="icon" 
            variant="outline"
            onClick={() => onEdit(photo)}
            className="h-8 w-8 rounded-full bg-white/20 backdrop-blur border-white hover:bg-white/40"
          >
            <Pencil className="h-4 w-4 text-white" />
          </Button>
          <Button
            size="icon"
            variant="outline"
            onClick={() => onDelete(photo)}
            className="h-8 w-8 rounded-full bg-white/20 backdrop-blur border-white hover:bg-white/40"
          >
            <Trash className="h-4 w-4 text-white" />
          </Button>
        </div>

        {/* OVERLAY */}
        <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent opacity-0 transition-opacity group-hover:opacity-100" />

        {/* INFO */}
        <div className="absolute bottom-0 left-0 right-0 z-10 p-3 text-white transition-transform group-hover:translate-y-0 translate-y-full">
          <p className="text-sm font-semibold truncate">{photo.filename}</p>
          <div className="mt-1 flex items-center justify-between text-xs opacity-90">
            <span>{photo.photographer?.name || "Sin fotógrafo"}</span>
            <span className="font-semibold">${photo.price}</span>
          </div>
        </div>
      </div>
    </Card>
  );
}

export const AdminPhotoCard = memo(AdminPhotoCardComponent);