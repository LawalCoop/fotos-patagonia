import { AlbumListItem, AlbumDetail } from "@/lib/types"

export function mapBackendAlbumToListItem(album: any): AlbumListItem {
  const firstSession = album.sessions?.[0]

  const photoCount =
    album.sessions?.reduce(
      (total: number, session: any) =>
        total + (session.photos?.length || 0),
      0
    ) || 0

  const tags: string[] = Array.from(
    new Set<string>(
      (
        album.tags?.map((t: any) => String(t.name ?? t)) ??
        album.sessions?.flatMap(
          (s: any) => s.tags?.map((t: any) => String(t.name ?? t)) ?? []
        ) ??
        []
      ).filter(Boolean)
    )
  )

  return {
    id: album.id,
    name: album.name,
    description: album.description,
    coverPhotoObjectName: firstSession?.photos?.[0]?.object_name,
    coverPhotoUrl: album.cover_photo_url,
    createdAt: firstSession?.event_date,
    location: firstSession?.location,
    event: firstSession?.event_name,
    photographerName: firstSession?.photographer?.name,
    photographerId: firstSession?.photographer_id,
    photoCount,
    tags,
  }
}

export function mapBackendAlbumToDetail(album: any): AlbumDetail {
  return {
    id: album.id,
    name: album.name,
    description: album.description,
    default_photo_price: album.default_photo_price,
    sessions: album.sessions,
    tags: album.tags,
    combos: album.combos,
  }
}
