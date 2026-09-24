"use client";

import { useCallback } from "react";
import { useEffect, useMemo, useRef, useState } from "react";
import { Search, Plus, Loader2, ArrowUp } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { PhotoModal } from "@/components/organisms/photo-modal";
import { usePhotos, type BackendPhoto } from "@/hooks/photos/usePhotos";
import { useSessions } from "@/hooks/sessions/useSessions";
import Image from "next/image";
import {
  Dialog,
  DialogTrigger,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { DeleteConfirmationModal } from "@/components/molecules/delete-confirmation-modal";
import { AdminPhotoCard } from "@/components/molecules/admin-photo-card"; // <- Importación correcta
import type { UploadingPhoto } from "@/lib/types";
import { UploadProgressPanel } from "@/components/molecules/upload-progress-panel";
import {
  applyUploadProgress,
  isAtTop,
  prependUnique,
  resolveUploads,
} from "@/lib/upload-queue";
import { useVirtualizer } from "@tanstack/react-virtual";

export default function FotosPage() {
  const [searchTerm, setSearchTerm] = useState("");
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [modalMode, setModalMode] = useState<"add" | "edit">("add");
  const [selectedPhoto, setSelectedPhoto] = useState<BackendPhoto | undefined>(
    undefined
  );

  // Nueva selección múltiple
  const [selectedPhotoIds, setSelectedPhotoIds] = useState<number[]>([]);
  const [isConfirmOpen, setIsConfirmOpen] = useState(false);
  const [deleteTargetIds, setDeleteTargetIds] = useState<number[]>([]);
  const [deleting, setDeleting] = useState(false);
  const [uploadingPhotos, setUploadingPhotos] = useState<UploadingPhoto[]>([]);
  // Total de fotos de la subida en curso (para "Subiendo X de Y").
  const [uploadTotal, setUploadTotal] = useState(0);
  // Fotos nuevas que llegaron mientras el usuario miraba más abajo: esperan acá
  // en vez de insertarse arriba y correr la grilla.
  const [pendingPhotos, setPendingPhotos] = useState<BackendPhoto[]>([]);
  const [newPhotos, setNewPhotos] = useState<BackendPhoto[]>([]);
  const [oldPhotos, setOldPhotos] = useState<BackendPhoto[]>([]);
  const [offset, setOffset] = useState(0);
  const LIMIT = 10;
  const [hasMore, setHasMore] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);

  // Obtener fotos y sesiones del backend
  const { loading, deletePhoto, fetchPhotosPage, getPhoto } = usePhotos();
  const { sessions } = useSessions();

  const combinedPhotos = [...newPhotos, ...oldPhotos];

  const filteredPhotos = combinedPhotos.filter((photo) => {
    const searchLower = searchTerm.toLowerCase();
    return (
      photo.filename?.toLowerCase().includes(searchLower) ||
      photo.description?.toLowerCase().includes(searchLower) ||
      photo.photographer?.name?.toLowerCase().includes(searchLower)
    );
  });

  const getSessionName = (sessionId?: number) => {
    if (!sessionId) return "Sin sesión";
    const session = sessions.find((s) => s.id === sessionId);
    return session?.event_name || "Sin sesión";
  };

  const handleAddPhoto = () => {
    setModalMode("add");
    setSelectedPhoto(undefined);
    setIsModalOpen(true);
  };

  const handleEditPhoto = useCallback((photo: BackendPhoto) => {
    setModalMode("edit");
    setSelectedPhoto(photo);
    setIsModalOpen(true);
  }, []);

  // Preparar eliminación individual: reutiliza el modal de confirmación
  const handleDeletePhoto = useCallback((photo: BackendPhoto) => {
    setDeleteTargetIds([photo.id]);
    setIsConfirmOpen(true);
  }, []);

  // Preparar eliminación múltiple
  const handleDeleteSelected = useCallback(() => {
    if (selectedPhotoIds.length === 0) return;
    setDeleteTargetIds(selectedPhotoIds);
    setIsConfirmOpen(true);
  }, []);

  const performDelete = useCallback(async () => {
    if (deleteTargetIds.length === 0) return;
    setDeleting(true);
    try {
      // Eliminar en paralelo
      await Promise.all(deleteTargetIds.map((id) => deletePhoto(id)));
      // Limpiar selección y actualizar listas locales
      setSelectedPhotoIds((prev) =>
        prev.filter((id) => !deleteTargetIds.includes(id))
      );
      setNewPhotos((prev) =>
        prev.filter((photo) => !deleteTargetIds.includes(photo.id))
      );
      setOldPhotos((prev) =>
        prev.filter((photo) => !deleteTargetIds.includes(photo.id))
      );
      setDeleteTargetIds([]);
      setIsConfirmOpen(false);
    } finally {
      setDeleting(false);
    }
  }, [deleteTargetIds, deletePhoto]);

  const handlePhotoSaved = async () => {
    if (!selectedPhoto) return;
    try {
      const updated = await getPhoto(selectedPhoto.id);
      setNewPhotos((prev) =>
        prev.map((photo) => (photo.id === updated.id ? updated : photo))
      );
      setOldPhotos((prev) =>
        prev.map((photo) => (photo.id === updated.id ? updated : photo))
      );
    } catch (error) {
      console.error("Error actualizando foto editada", error);
    }
  };

  const toggleSelect = (id: number) => {
    setSelectedPhotoIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    );
  };

  const handleCheckboxClick = useCallback(
    (e: React.MouseEvent, id: number) => {
      e.stopPropagation();
      setSelectedPhotoIds((prev) =>
        prev.includes(id)
          ? prev.filter((x) => x !== id)
          : [...prev, id]
      );
    },
    []
  );

  const selectedSet = useMemo(
    () => new Set(selectedPhotoIds),
    [selectedPhotoIds]
  );
  
  const isSelected = (id: number) =>
    selectedSet.has(id);


  //sellecccionar todas las fotos
  const allFilteredIds = filteredPhotos.map((p) => p.id);

  const areAllFilteredSelected =
    allFilteredIds.length > 0 &&
    allFilteredIds.every((id) => selectedPhotoIds.includes(id));
  
  const handleSelectAll = () => {
    if (areAllFilteredSelected) {
      // Deseleccionar todas las visibles
      setSelectedPhotoIds((prev) =>
        prev.filter((id) => !allFilteredIds.includes(id))
      );
    } else {
      // Seleccionar todas las visibles (sin duplicados)
      setSelectedPhotoIds((prev) =>
        Array.from(new Set([...prev, ...allFilteredIds]))
      );
    }
  };

  // Virtualización (grilla)
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const measureRef = useRef<HTMLDivElement | null>(null);
  const [gridWidth, setGridWidth] = useState<number>(0);

  const GRID_GAP_PX = 24; // gap-6
  const ESTIMATED_ROW_HEIGHT = 320; // requerido: estimateSize fijo
  const MIN_CARD_WIDTH_PX = 260; // aproximación para grilla responsive

  useEffect(() => {
    if (!scrollRef.current) return;
    const el = scrollRef.current;
  
    const update = () => setGridWidth(el.getBoundingClientRect().width);
    update();
  
    const ro = new ResizeObserver(() => update());
    ro.observe(el);
    return () => ro.disconnect();
    // Depende de que existan fotos: el contenedor solo se monta con la lista no
    // vacía; sin esta dep, gridWidth quedaría en 0 y columns en 1.
  }, [filteredPhotos.length > 0]);

  const columns = useMemo(() => {
    const w = gridWidth || 0;
    if (w <= 0) return 1;
    const cols = Math.floor((w + GRID_GAP_PX) / (MIN_CARD_WIDTH_PX + GRID_GAP_PX));
    return Math.max(1, cols);
  }, [gridWidth]);

  const rowCount = useMemo(() => {
    return Math.ceil(filteredPhotos.length / columns);
  }, [filteredPhotos.length, columns]);

  // Estimación inicial de alto de fila. Tarjeta cuadrada (aspect-square):
  // alto = ancho de tarjeta + gap vertical. La altura real la mide measureElement.
  const estimatedRowHeight = useMemo(() => {
    if (gridWidth > 0 && columns > 0) {
      const cardWidth = (gridWidth - (columns - 1) * GRID_GAP_PX) / columns;
      return Math.round(cardWidth + GRID_GAP_PX);
    }
    return ESTIMATED_ROW_HEIGHT;
  }, [gridWidth, columns]);

  const rowVirtualizer = useVirtualizer({
    count: rowCount,
    getScrollElement: () => scrollRef.current,
    // Solo estimación inicial: la altura real la mide measureElement (ref por fila),
    // evitando acumular error de posicionamiento al hacer scroll.
    estimateSize: () => estimatedRowHeight,
    overscan: 6,
  });

  const handleLoadMore = useCallback(async () => {
    if (!hasMore || loading || loadingMore) return;
  
    setLoadingMore(true);
  
    try {
      const data =
        (await fetchPhotosPage({ offset, limit: LIMIT })) ?? [];
  
      const filtered = data.filter(
        (photo) =>
          !newPhotos.some((p) => p.id === photo.id) &&
          !oldPhotos.some((p) => p.id === photo.id)
      );
  
      setOldPhotos((prev) => [...prev, ...filtered]);
      setOffset((prev) => prev + LIMIT);
  
      if (data.length < LIMIT) {
        setHasMore(false);
      }
    } catch (error) {
      console.error("Error cargando más fotos", error);
    } finally {
      setLoadingMore(false);
    }
  }, [
    hasMore,
    loading,
    loadingMore,
    offset,
    fetchPhotosPage,
    newPhotos,
    oldPhotos,
  ]);

  // Carga inicial: traer la primera página al montar. Sin esto la galería queda
  // vacía tras un F5, porque el scroll infinito solo dispara cuando ya hay fotos
  // renderizadas (y con la lista vacía nunca arranca).
  useEffect(() => {
    if (newPhotos.length === 0 && oldPhotos.length === 0 && hasMore) {
      handleLoadMore();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Polling cada ~7s (solo con pestaña visible): trae la primera página y agrega
  // las fotos con id no visto, para reflejar cargas hechas desde otra sesión.
  const photosSnapshotRef = useRef({ newPhotos, oldPhotos });
  const addIncomingRef = useRef<(photos: BackendPhoto[]) => void>(() => {});
  const fetchPageRef = useRef(fetchPhotosPage);
  useEffect(() => {
    photosSnapshotRef.current = { newPhotos, oldPhotos };
    fetchPageRef.current = fetchPhotosPage;
    addIncomingRef.current = addIncomingPhotos;
  });
  useEffect(() => {
    const POLL_MS = 7000;
    const timer = setInterval(async () => {
      if (typeof document !== "undefined" && document.visibilityState !== "visible") return;
      try {
        const data = (await fetchPageRef.current({ offset: 0, limit: LIMIT })) ?? [];
        if (!data.length) return;
        const { newPhotos: np, oldPhotos: op } = photosSnapshotRef.current;
        const known = new Set([...np.map((p) => p.id), ...op.map((p) => p.id)]);
        const fresh = data.filter((p) => !known.has(p.id));
        if (!fresh.length) return;
        addIncomingRef.current(fresh);
      } catch {
        /* refresco de fondo: ignorar errores transitorios */
      }
    }, POLL_MS);
    return () => clearInterval(timer);
  }, []);

  // Infinite scroll: cuando el último row visible está cerca del final, cargar más
  useEffect(() => {
    const virtualItems = rowVirtualizer.getVirtualItems();
    const lastItem = virtualItems[virtualItems.length - 1];

    if (
      lastItem &&
      lastItem.index >= rowCount - 2 &&
      hasMore &&
      !loading &&
      !loadingMore
    ) {
      handleLoadMore();
    }
}, [
  rowVirtualizer,
  rowCount,
  hasMore,
  loading,
  loadingMore,
  handleLoadMore,
]);
  // Fotos nuevas (de una subida o del polling): si la grilla está arriba de
  // todo se insertan; si el usuario scrolleó, quedan en espera con un aviso.
  const addIncomingPhotos = (photos: BackendPhoto[]) => {
    if (!photos.length) return;
    const ids = new Set(photos.map((p) => p.id));
    setOldPhotos((prev) => prev.filter((photo) => !ids.has(photo.id)));
    if (isAtTop(scrollRef.current?.scrollTop)) {
      setNewPhotos((prev) => prependUnique(prev, photos));
    } else {
      setPendingPhotos((prev) => prependUnique(prev, photos));
    }
  };

  const flushPendingPhotos = useCallback(() => {
    setPendingPhotos((pending) => {
      if (pending.length) setNewPhotos((prev) => prependUnique(prev, pending));
      return [];
    });
  }, []);

  const showPendingPhotos = () => {
    flushPendingPhotos();
    scrollRef.current?.scrollTo({ top: 0 });
  };

  // Al volver arriba de todo, se incorporan las fotos que estaban en espera.
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const onScroll = () => {
      if (isAtTop(el.scrollTop)) flushPendingPhotos();
    };
    el.addEventListener("scroll", onScroll, { passive: true });
    return () => el.removeEventListener("scroll", onScroll);
  }, [filteredPhotos.length > 0, flushPendingPhotos]);

  // Terminada la subida (sin placeholders), se reinicia el contador.
  useEffect(() => {
    if (uploadingPhotos.length === 0) setUploadTotal(0);
  }, [uploadingPhotos.length]);

  const handleUploadStart = (items: UploadingPhoto[]) => {
    if (!items.length) return;
    setUploadTotal((prev) => prev + items.length);
    setUploadingPhotos((prev) => [...items, ...prev]);
  };

  const handleUploadProgress = (tempIds: string[], progress: number) => {
    setUploadingPhotos((prev) => applyUploadProgress(prev, tempIds, progress));
  };

  const handleUploadComplete = (result: {
    success: string[];
    failed: string[];
    createdPhotos?: BackendPhoto[];
  }) => {
    setUploadingPhotos((prev) =>
      resolveUploads(prev, result.success, result.failed)
    );
    addIncomingPhotos(result.createdPhotos ?? []);
  };

  const handleUploadError = (tempIds: string[]) => {
    if (!tempIds.length) return;
    setUploadingPhotos((prev) => resolveUploads(prev, [], tempIds));
  };

  return (
    <div className="container mx-auto px-4 py-8">
      <div className="mb-8 flex items-center justify-between">
        <div>
          <h1 className="mb-2 text-4xl font-bold">Gestión de Fotos</h1>
          <p className="text-muted-foreground">
            Administra el catálogo de fotos
          </p>
        </div>
        <div className="flex items-center gap-3">
            {filteredPhotos.length > 0 && (
              <Button
                variant="outline"
                onClick={handleSelectAll}
                className="rounded-xl"
              >
                {areAllFilteredSelected ? "Deseleccionar todas" : "Seleccionar todas"}
              </Button>
            )}
          {selectedPhotoIds.length > 0 && (
            <Button
              onClick={handleDeleteSelected}
              variant="outline"
              className="rounded-xl border-destructive text-destructive font-semibold hover:bg-destructive/10"
              disabled={deleting}
            >
              Eliminar seleccionadas ({selectedPhotoIds.length})
            </Button>
          )}
          <Button
            onClick={handleAddPhoto}
            className="rounded-xl bg-primary font-semibold text-foreground hover:bg-primary-hover"
          >
            <Plus className="mr-2 h-4 w-4" />
            Agregar Foto
          </Button>
        </div>
      </div>

      {/* Search */}
      <Card className="mb-6 rounded-2xl border-gray-200">
        <CardContent className="pt-6">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Buscar por lugar o fecha..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="rounded-xl pl-10"
            />
          </div>
        </CardContent>
      </Card>

      {/* Loading State */}
      {loading && (
        <Card className="rounded-2xl border-gray-200">
          <CardContent className="py-12 text-center">
            <Loader2 className="h-8 w-8 animate-spin mx-auto text-primary" />
            <p className="mt-4 text-muted-foreground">Cargando fotos...</p>
          </CardContent>
        </Card>
      )}

      {/* Photos Grid */}
      {!loading && (
        <>
          <UploadProgressPanel items={uploadingPhotos} total={uploadTotal} />

          {pendingPhotos.length > 0 && (
            <div className="sticky top-4 z-20 mb-4 flex justify-center">
              <Button
                onClick={showPendingPhotos}
                className="rounded-full bg-primary font-semibold text-foreground shadow-lg hover:bg-primary-hover"
              >
                <ArrowUp className="mr-2 h-4 w-4" />
                {pendingPhotos.length === 1
                  ? "1 foto nueva"
                  : `${pendingPhotos.length} fotos nuevas`}
              </Button>
            </div>
          )}

          {filteredPhotos.length > 0 ? (
            <div
              ref={scrollRef}
              className="relative"
              style={{
                height: "75vh",
                overflow: "auto",
              }}
            >
              <div
                ref={measureRef}
                style={{
                  height: rowVirtualizer.getTotalSize(),
                  width: "100%",
                  position: "relative",
                }}
              >
                {rowVirtualizer.getVirtualItems().map((virtualRow) => {
                  const startIndex = virtualRow.index * columns;
                  const rowItems = filteredPhotos.slice(
                    startIndex,
                    startIndex + columns
                  );

                  return (
                    <div
                      key={virtualRow.key}
                      data-index={virtualRow.index}
                      ref={rowVirtualizer.measureElement}
                      className="grid gap-6"
                      style={{
                        gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))`,
                        position: "absolute",
                        top: 0,
                        left: 0,
                        width: "100%",
                        transform: `translateY(${virtualRow.start}px)`,
                        // Incluye el gap vertical dentro de la altura que mide measureElement.
                        paddingBottom: GRID_GAP_PX,
                      }}
                    >
                      {rowItems.map((photo) => {
                        const selected = isSelected(photo.id);
                        return (
                          <AdminPhotoCard
                          key={photo.id}
                          photo={photo}
                          isSelected={selected}
                          onCheckboxClick={handleCheckboxClick}
                          onEdit={handleEditPhoto}
                          onDelete={handleDeletePhoto}
                        />
                        );
                      })}
                    </div>
                  );
                })}
              </div>
            </div>
          ) : (
            <Card className="rounded-2xl border-gray-200">
              <CardContent className="py-12 text-center text-muted-foreground">
                No se encontraron fotos
              </CardContent>
            </Card>
          )}

        </>
      )}

      <PhotoModal
        open={isModalOpen}
        onOpenChange={setIsModalOpen}
        mode={modalMode}
        photo={selectedPhoto}
        onSave={handlePhotoSaved}
        onUploadStart={handleUploadStart}
        onUploadProgress={handleUploadProgress}
        onUploadComplete={handleUploadComplete}
        onUploadError={handleUploadError}
      />

      {/* Modal de confirmación reutilizable para eliminar 1 o varias fotos */}

          <DeleteConfirmationModal
            isOpen={isConfirmOpen}
            title={`Eliminar ${deleteTargetIds.length} fotos`}
            entityName={`estas ${deleteTargetIds.length} fotos`}
            isLoading={deleting}
            onConfirm={performDelete}
            onCancel={() => setIsConfirmOpen(false)}
          />
    </div>
  );
}