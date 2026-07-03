"use client";

import { useState, useEffect, useCallback } from "react";
import { apiFetch } from "@/lib/api";
import { Album, PhotoCombo } from "@/lib/types";

interface BackendAlbum {

  id: number;

  name: string;

  description?: string | null;

  default_photo_price?: number;

  sessions?: any[];

  tags?: any[];

  combos?: PhotoCombo[];

}

export function useAlbums(albumId?: string) {
  const [data, setData] = useState<BackendAlbum | BackendAlbum[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // opts.silent: no modifica `loading` (para refrescos periódicos en segundo plano).
  const fetchAlbums = useCallback(async (opts?: { silent?: boolean }) => {
    try {
      if (!opts?.silent) setLoading(true);

      const url = albumId ? `/albums/${albumId}` : `/albums/`;
      const result = await apiFetch<BackendAlbum | BackendAlbum[]>(url);

      setData(result);
      setError(null);
    } catch (err: any) {
      setError(err.message);
      console.error("Error fetching albums:", err);
    } finally {
      if (!opts?.silent) setLoading(false);
    }
  }, [albumId]);

  const createAlbum = async (
    albumData: Partial<Album> & { default_photo_price?: number | null }
  ): Promise<BackendAlbum> => {
    try {
      // Enviar solo los campos que el backend acepta
      const backendData = {
        name: albumData.name!,
        description: albumData.description || null,
        session_ids: albumData.sessionIds ?? [],
        tag_ids: albumData.tagIds ?? [],
        combo_ids: albumData.comboIds ?? [],
        default_photo_price: albumData.default_photo_price,
      };

      //console.log("Creating album with data:", backendData);

      const result = await apiFetch<BackendAlbum>("/albums/", {
        method: "POST",
        body: JSON.stringify(backendData),
      });

      //console.log("Album created:", result);
      return result;
    } catch (err: any) {
      setError(err.message);
      //console.error("Error creating album:", err);
      throw err;
    }
  };

  const updateAlbum = async (
    id: number | string,
    albumData: Partial<Album> & { default_photo_price?: number | null }
  ): Promise<BackendAlbum> => {
    try {
      // Enviar solo los campos que el backend acepta
      const backendData = {
        name: albumData.name!,
        description: albumData.description || null,
        session_ids: albumData.sessionIds,
        tag_ids: albumData.tagIds,
        combo_ids: albumData.comboIds ?? [],
        default_photo_price: albumData.default_photo_price,
      };

      //console.log(`Updating album ${id} with data:`, backendData);

      const result = await apiFetch<BackendAlbum>(`/albums/${id}`, {
        method: "PUT",
        body: JSON.stringify(backendData),
      });

      //console.log("Album updated:", result);
      return result;
    } catch (err: any) {
      setError(err.message);
      //console.error("Error updating album:", err);
      throw err;
    }
  };

  const deleteAlbum = async (id: number | string): Promise<void> => {
    try {
      //console.log(`Deleting album ${id}`);

      await apiFetch(`/albums/${id}`, {
        method: "DELETE",
      });

      //console.log("Album deleted successfully");
    } catch (err: any) {
      setError(err.message);
      //console.error("Error deleting album:", err);
      throw err;
    }
  };

  // NOTA: El endpoint GET /albums/{id}/photos NO existe en el OpenAPI actual.
  // Las fotos de un álbum se obtienen a través de las sesiones:
  // - GET /albums/{album_id} devuelve el álbum con sus sesiones
  // - Cada sesión tiene sus fotos en el campo "photos"

  useEffect(() => {
    fetchAlbums();
  }, [fetchAlbums]);

  return {
    data,
    loading,
    error,
    refetch: fetchAlbums,
    createAlbum,
    updateAlbum,
    deleteAlbum,
  };
}
