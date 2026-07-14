"use client";

import Image from "next/image";
import { cn } from "@/lib/utils";
import { useAuthStore } from "@/lib/store";
import { isAdmin, getUserRoleName } from "@/lib/types";
import { isStaff } from "@/lib/permissions";

type Props = {
  src: string;
  alt?: string;
  className?: string;
  fill?: boolean;
  sizes?: string;
  priority?: boolean;
  objectFit?: "contain" | "cover";
  showWatermark?: boolean; // Opcional: forzar mostrar/ocultar marca de agua
  watermarkSrc?: string;   // por defecto, /watermark.svg
  opacity?: number;        // 0..1 (opacidad del patrón de marca de agua)
  rotateDeg?: number;      // ej. -20
  watermarkText?: string;  // Texto legal extra en el centro
  textFontSize?: string;   // tamaño del texto, ej. "18px", "22px"
};

export default function WatermarkedImage({
  src,
  alt = "",
  className,
  fill = true,
  sizes = "(max-width: 1024px) 100vw, 70vw",
  priority = false,
  objectFit = "contain",
  showWatermark,
  watermarkSrc = "/watermark.svg",
  opacity = 0.3, // 👉 más visible por defecto
  rotateDeg = -20,
  watermarkText = "",
  textFontSize = "18px",
}: Props) {
  // Detectar el rol del usuario
  const user = useAuthStore((state) => state.user);

  // Determinar si debe mostrar marca de agua:
  // - Si showWatermark está definido, usar ese valor (override manual)
  // - Si no hay usuario -> mostrar marca de agua
  // - Si el usuario es admin o tiene permisos especiales -> NO mostrar marca de agua
  
  const shouldShowWatermark =
  showWatermark !== undefined
    ? showWatermark
    : !user || !isStaff(user);
  


  return (
    <div 
      className={cn("relative w-full h-full select-none", className)}
      onContextMenu={(e) => e.preventDefault()}
    >
      {/* Capa de protección sin captura de eventos. Menú contextual bloqueado en
          el contenedor; arrastre, con draggable={false} en la imagen. */}
      <div
        className="pointer-events-none absolute inset-0 z-20 select-none"
        aria-hidden
      />

      {/* Imagen original (sin marca guardada físicamente) */}
      <Image
        src={src}
        alt={alt}
        fill={fill}
        className={`object-${objectFit} pointer-events-none`}
        sizes={sizes}
        priority={priority}
        draggable={false}
      />

      {/* Overlay de marca de agua (solo para usuarios públicos/visitantes) */}
      {shouldShowWatermark && (
        <div className="absolute inset-0 z-10 pointer-events-none select-none overflow-hidden">
          {/* Patrón de marca de agua repetido */}
          <div
            className="absolute inset-0"
            style={{
              backgroundImage: `url(${watermarkSrc})`,
              backgroundRepeat: "repeat",
              backgroundPosition: "center",
              backgroundSize: "180px auto", // un poco más denso
              opacity, // 👉 ahora usa el prop
              transform: `rotate(${rotateDeg}deg)`,
            }}
          />

          {/* Texto legal grande en el centro */}
          <div className="absolute inset-0 flex items-center justify-center">
            <span
              className="font-bold uppercase tracking-[0.35em] text-center px-6 py-3 rounded-md bg-black/0 text-white"
              style={{
                transform: `rotate(${rotateDeg}deg)`,
                fontSize: textFontSize,
              }}
            >
              {watermarkText}
            </span>
          </div>
        </div>
      )}
    </div>
  );
}
