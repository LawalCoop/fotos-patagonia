"use client"

import { create } from "zustand"
import { persist } from "zustand/middleware"
import { toast } from "@/hooks/use-toast"
import {
  AUTH_STORAGE_KEY,
  LEGACY_TOKEN_KEY,
  getTokenExpiration,
  isTimestampExpired,
  EXPIRATION_GRACE_MS,
  readStoredAuthSnapshot,
  type StoredAuthSnapshot,
  writeStoredAuthSnapshot,
} from "./auth"
import type {
  CartState,
  LightboxState,
  GalleryState,
  Photo,
  Filters,
  User,
  PrintFormat,
  PrintSelection,
  CartComboSelection,
} from "./types"
import { getPackSize } from "./print-formats"

import { apiFetch } from "./api"

const generateSelectionId = () => `sel-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`

const removePhotoFromSelections = (selections: PrintSelection[], photoId: string) =>
  selections
    .map((selection) => ({
      ...selection,
      photoIds: selection.photoIds.filter((id) => id !== photoId),
    }))
    .filter((selection) => selection.photoIds.length > 0)

const normalizeAmount = (value: number | undefined | null) => {
  const num = Number(value)
  if (!Number.isFinite(num) || num < 0) return 0
  return num
}

const computeDiscountedTotal = (
  baseTotal: number,
  discountInfo: CartState["discountInfo"],
) => {
  if (!discountInfo) return baseTotal
  if (discountInfo.type === "percent") {
    return baseTotal * (1 - discountInfo.value / 100)
  }
  return Math.max(0, baseTotal - discountInfo.value)
}

interface CartStore extends CartState {
  addItem: (photoId: string) => void
  removeItem: (photoId: string) => void
  removeFromCartExplicit: (photoId: string) => void
  removeFromCartIfUnselected: (photoId: string) => void
  toggleSelected: (photoId: string) => void
  toggleFavorite: (photoId: string) => void
  togglePrinter: (photoId: string) => void
  addPrintSelection: (format: PrintFormat, photoIds: string[]) => void
  removePhotosFromSelection: (selectionId: string, photoIds: string[]) => void
  clearPrintSelections: () => void
  clearNonFavorites: () => void
  setEmail: (email: string) => void
  applyDiscount: (discount: { id: number; code: string; type: "percent"; value: number }) => void
  saveSession: () => Promise<string>
  loadSession: (sessionId: string) => Promise<void>
  clearCart: () => void
  updateTotals: (photos: Photo[], options?: { isStaff?: boolean }) => void
  setSelectedCombo: (combo: CartComboSelection | null) => void
  setManualPrintsSubtotal: (value: number) => void
  setManualDigitalSubtotal: (value: number) => void
  resetManualPrintsSubtotal: () => void
  resetManualDigitalSubtotal: () => void
}

export const useCartStore = create<CartStore>()(
  persist(
    (set, get) => ({
      items: [],
      printSelections: [],
      email: undefined,
      discountCode: undefined,
      discountInfo: undefined,
      // Impresiones
      printsSubtotalCalculated: 0,
      printsSubtotalManual: undefined,
      printsManualEnabled: false,
      printsSubtotalEffective: 0,

      // Digitales
      digitalSubtotalCalculated: 0,
      digitalSubtotalManual: undefined,
      digitalManualEnabled: false,
      digitalSubtotalEffective: 0,

      // Totales
      subtotal: 0,
      total: 0,
      totalEffective: 0,

      savedSessionId: undefined,
      channel: "web",
      selectedCombo: null,

      addItem: (photoId: string) => {
        const { items } = get()
        if (items.some((item) => item.photoId === photoId)) return
        // Agregar con selected: true para que permanezca en el carrito
        set({ items: [...items, { photoId, selected: true, favorite: false, printer: false }] })
      },

      removeItem: (photoId: string) => {
        set({
          items: get().items.filter((item) => item.photoId !== photoId),
          printSelections: removePhotoFromSelections(get().printSelections, photoId),
        })
      },

      // Eliminación explícita (carrito / menú ⋮)
      removeFromCartExplicit: (photoId: string) => {
        set({
          items: get().items.filter((item) => item.photoId !== photoId),
          printSelections: removePhotoFromSelections(get().printSelections, photoId),
        })
      },

      // Eliminación condicional (galería/álbum): solo si no hay intención activa
      removeFromCartIfUnselected: (photoId: string) => {
        const { items } = get()
        const existing = items.find((i) => i.photoId === photoId)
        if (!existing) return
        if (existing.favorite || existing.printer) return
        // Sin intención activa → se puede eliminar
        set({
          items: items.filter((i) => i.photoId !== photoId),
          printSelections: removePhotoFromSelections(get().printSelections, photoId),
        })
      },

      toggleSelected: (photoId: string) => {
        const { items } = get()
        const existingItem = items.find((item) => item.photoId === photoId)
        
        if (!existingItem) {
          // Al marcar: agregar al carrito con selected: true
          set({ items: [...items, { photoId, selected: true, favorite: false, printer: false }] })
          return
        }
        
        // Toggle selected
        const newSelectedState = !existingItem.selected
        const updatedItems = items.map((item) => {
          if (item.photoId !== photoId) return item
          return { ...item, selected: newSelectedState }
        })
        set({ items: updatedItems })
      },

      toggleFavorite: (photoId: string) => {
        const { items } = get()
        const existingItem = items.find((item) => item.photoId === photoId)
        
        if (!existingItem) {
          // Al marcar: agregar al carrito con favorite: true
          set({ items: [...items, { photoId, selected: false, favorite: true, printer: false }] })
          return
        }
        
        const newFavoriteState = !existingItem.favorite
        const updatedItems = items.map((item) => {
          if (item.photoId !== photoId) return item
          return { ...item, favorite: newFavoriteState }
        })
        set({
          items: updatedItems,
          // Mantener selections; solo limpiar si se desactiva printer explicitamente
          printSelections: get().printSelections,
        })
      },

      togglePrinter: (photoId: string) => {
        const { items } = get()
        const existingItem = items.find((item) => item.photoId === photoId)
        
        if (!existingItem) {
          // Al marcar: agregar al carrito con printer: true y favorite: true
          set({ items: [...items, { photoId, selected: false, favorite: true, printer: true }] })
          return
        }
        
        const newPrinterState = !existingItem.printer
        const updatedItems = items.map((item) => {
          if (item.photoId !== photoId) return item
          if (newPrinterState) {
            // Al marcar printer: también marcar favorite
            return { ...item, printer: true, favorite: true }
          }
          // Al desmarcar printer: solo desmarcar printer, mantener item
          return { ...item, printer: false }
        })
        set({
          items: updatedItems,
          printSelections: newPrinterState
            ? get().printSelections
            : removePhotoFromSelections(get().printSelections, photoId),
        })
      },

      addPrintSelection: (format: PrintFormat, photoIds: string[]) => {
        const { items, printSelections } = get()
        const uniquePhotoIds = Array.from(new Set(photoIds))
        if (uniquePhotoIds.length === 0) return

        const alreadyAssigned = uniquePhotoIds.some((photoId) =>
          printSelections.some((selection) => selection.photoIds.includes(photoId)),
        )
        if (alreadyAssigned) {
          toast({
            title: "Fotos ya asignadas",
            description: "Quitá el formato previo antes de asignar uno nuevo.",
            variant: "destructive",
          })
          return
        }

        const itemsWithPrinter = uniquePhotoIds.reduce((acc, photoId) => {
          const existing = acc.find((item) => item.photoId === photoId)
          if (existing) {
            return acc.map((item) =>
              item.photoId === photoId ? { ...item, printer: true, favorite: true } : item,
            )
          }
          return [...acc, { photoId, selected: false, favorite: true, printer: true }]
        }, [...items])

        const newSelection: PrintSelection = {
          id: generateSelectionId(),
          format,
          photoIds: uniquePhotoIds,
        }

        set({
          items: itemsWithPrinter,
          printSelections: [...printSelections, newSelection],
        })
      },

      removePhotosFromSelection: (selectionId: string, photoIds: string[]) => {
        set((state) => {
          const updatedSelections = state.printSelections
            .map((selection) => {
              if (selection.id !== selectionId) return selection
              const remaining = selection.photoIds.filter((id) => !photoIds.includes(id))
              return { ...selection, photoIds: remaining }
            })
            .filter((selection) => selection.photoIds.length > 0)

          return { items: state.items, printSelections: updatedSelections }
        })
      },

      clearPrintSelections: () => {
        set((state) => ({
          ...state,
          printSelections: [],
        }))
      },

      clearNonFavorites: () => {
        set((state) => {
          const favoriteItems = state.items.filter((item) => item.favorite)
          const favoriteIds = favoriteItems.map((item) => item.photoId)
          return {
            items: favoriteItems,
            printSelections: state.printSelections
              .map((selection) => ({
                ...selection,
                photoIds: selection.photoIds.filter((id) => favoriteIds.includes(id)),
              }))
              .filter((selection) => selection.photoIds.length > 0),
          }
        })
      },

      setEmail: (email: string) => {
        set({ email })
      },

      applyDiscount: (discount) => {
        set((state) => {
          const totalEffective = state.printsSubtotalEffective + state.digitalSubtotalEffective
          const nextDiscountInfo = { type: discount.type, value: discount.value } as const
          const total = computeDiscountedTotal(totalEffective, nextDiscountInfo)

          return {
            discountCode: discount.code,
            discountInfo: nextDiscountInfo,
            // Mantener el contrato: subtotal/totalEffective = pre-descuento
            subtotal: state.subtotal,
            // No recalcular subtotales aquí; updateTotals es la fuente de verdad para eso.
            total,
          }
        })
      },

      saveSession: async () => {
        const { ...stateToSave } = get()
        const response = await apiFetch<{ public_id: string }>("/saved-carts/sessions/", {
          method: "POST",
          body: JSON.stringify({ cart_state: stateToSave }),
          headers: { "Content-Type": "application/json" },
        })
        set({ savedSessionId: response.public_id })
        return response.public_id
      },

      loadSession: async (sessionId: string) => {
        const response = await apiFetch<{ cart_state: CartState }>(`/saved-carts/sessions/${sessionId}`)
        if (response && response.cart_state) {
          set({
            ...response.cart_state,
            savedSessionId: sessionId,
            // Ensure state consistency after loading
            printsManualEnabled: false,
            digitalManualEnabled: false,
            printsSubtotalManual: undefined,
            digitalSubtotalManual: undefined,
          })
        }
      },

      clearCart: () => {
        set({
          items: [],
          printSelections: [],
          email: undefined,
          discountCode: undefined,
          discountInfo: undefined,
          printsSubtotalCalculated: 0,
          printsSubtotalManual: undefined,
          printsManualEnabled: false,
          printsSubtotalEffective: 0,
          digitalSubtotalCalculated: 0,
          digitalSubtotalManual: undefined,
          digitalManualEnabled: false,
          digitalSubtotalEffective: 0,
          subtotal: 0,
          total: 0,
          totalEffective: 0,
          selectedCombo: null,
        })
      },
          setSelectedCombo: (combo) => {
            set({ selectedCombo: combo })
          },

      setManualPrintsSubtotal: (value: number) =>
        set((state) => {
          const printsManual = normalizeAmount(value)
          const totalEffective = printsManual + state.digitalSubtotalEffective
          const total = computeDiscountedTotal(totalEffective, state.discountInfo)

          return {
            ...state,
            printsManualEnabled: true,
            printsSubtotalManual: printsManual,
            printsSubtotalEffective: printsManual,
            subtotal: state.subtotal,
            totalEffective,
            total,
          }
        }),

      setManualDigitalSubtotal: (value: number) =>
        set((state) => {
          const digitalManual = normalizeAmount(value)
          const totalEffective = state.printsSubtotalEffective + digitalManual
          const total = computeDiscountedTotal(totalEffective, state.discountInfo)

          return {
            ...state,
            digitalManualEnabled: true,
            digitalSubtotalManual: digitalManual,
            digitalSubtotalEffective: digitalManual,
            subtotal: state.subtotal,
            totalEffective,
            total,
          }
        }),

      resetManualPrintsSubtotal: () =>
        set((state) => {
          const printsEffective = state.printsSubtotalCalculated
          const totalEffective = printsEffective + state.digitalSubtotalEffective
          const total = computeDiscountedTotal(totalEffective, state.discountInfo)

          return {
            ...state,
            printsManualEnabled: false,
            printsSubtotalManual: undefined,
            printsSubtotalEffective: printsEffective,
            subtotal: state.subtotal,
            totalEffective,
            total,
          }
        }),

      resetManualDigitalSubtotal: () =>
        set((state) => {
          const digitalEffective = state.digitalSubtotalCalculated
          const totalEffective = state.printsSubtotalEffective + digitalEffective
          const total = computeDiscountedTotal(totalEffective, state.discountInfo)

          return {
            ...state,
            digitalManualEnabled: false,
            digitalSubtotalManual: undefined,
            digitalSubtotalEffective: digitalEffective,
            subtotal: state.subtotal,
            totalEffective,
            total,
          }
        }),

      updateTotals: (photos: Photo[], _options) => {
        const {
          items,
          printSelections,
          discountInfo,
          selectedCombo,
          printsManualEnabled,
          digitalManualEnabled,
          printsSubtotalManual,
          digitalSubtotalManual,
        } = get()
        const photoPriceMap = photos.reduce<Map<string, number>>((acc, photo) => {
          acc.set(photo.id, photo.price || 0)
          return acc
        }, new Map())

        // 🔐 Regla: toda foto en carrito (digital o imprimir) suma al subtotal digital.
        const photoPrices = items.map((item) => photoPriceMap.get(item.photoId) ?? 0)
        const digitalBase = photoPrices.reduce((sum, price) => sum + price, 0)

        const computeUnitPrice = () => {
          const firstPositive = photoPrices.find((price) => price > 0)
          if (firstPositive !== undefined) return firstPositive
          if (photoPrices.length === 0) return 0
          return digitalBase / Math.max(1, photoPrices.length)
        }

        let digitalCalculated = digitalBase
        const canApplyCombo =
          selectedCombo &&
          selectedCombo.totalPhotos > 0 &&
          photoPrices.length >= selectedCombo.totalPhotos

        if (canApplyCombo) {
          const remaining = photoPrices.length - selectedCombo.totalPhotos
          const unitPrice = computeUnitPrice()
          digitalCalculated = selectedCombo.price + Math.max(0, remaining) * unitPrice
        }

        // Impresiones: packs x precio formato
        const printsCalculated = printSelections.reduce((sum, selection) => {
          const packSize = getPackSize(selection.format)
          const packs = Math.ceil(selection.photoIds.length / packSize)
          return sum + packs * selection.format.price
        }, 0)

        const printsEffective = printsManualEnabled
          ? normalizeAmount(printsSubtotalManual)
          : printsCalculated

        const digitalEffective = digitalManualEnabled
          ? normalizeAmount(digitalSubtotalManual)
          : digitalCalculated

        const totalEffective = printsEffective + digitalEffective
        const nominalSubtotal = digitalBase + printsCalculated
        const total = computeDiscountedTotal(totalEffective, discountInfo)

        set({
          printsSubtotalCalculated: printsCalculated,
          printsSubtotalEffective: printsEffective,
          digitalSubtotalCalculated: digitalCalculated,
          digitalSubtotalEffective: digitalEffective,
          subtotal: nominalSubtotal,
          totalEffective,
          total,
        })
      },
    }),
    {
      name: "cart-storage",
    },
  ),
)

interface LightboxStore extends LightboxState {
  open: (photoId: string, photos: Photo[]) => void
  close: () => void
  next: () => void
  prev: () => void
}

export const useLightboxStore = create<LightboxStore>((set, get) => ({
  isOpen: false,
  currentPhotoId: undefined,
  photos: [],

  open: (photoId: string, photos: Photo[]) => {
    set({ isOpen: true, currentPhotoId: photoId, photos })
  },

  close: () => {
    set({ isOpen: false, currentPhotoId: undefined })
  },

  next: () => {
    const { currentPhotoId, photos } = get()
    if (!currentPhotoId) return

    const currentIndex = photos.findIndex((p) => p.id === currentPhotoId)
    const nextIndex = (currentIndex + 1) % photos.length
    set({ currentPhotoId: photos[nextIndex].id })
  },

  prev: () => {
    const { currentPhotoId, photos } = get()
    if (!currentPhotoId) return

    const currentIndex = photos.findIndex((p) => p.id === currentPhotoId)
    const prevIndex = (currentIndex - 1 + photos.length) % photos.length
    set({ currentPhotoId: photos[prevIndex].id })
  },
}))

interface GalleryStore extends GalleryState {
  setFilters: (filters: Partial<Filters>) => void
  setMode: (mode: "web" | "local") => void
  setPhotos: (photos: Photo[]) => void
  selectedPhotos: string[]
  toggleSelection: (photoId: string) => void
  clearSelection: () => void
  selectAll: (photoIds: string[]) => void
}

export const useGalleryStore = create<GalleryStore>((set) => ({
  photos: [],
  filters: {},
  page: 1,
  totalPages: 1,
  mode: "web",
  selectedPhotos: [],

  setFilters: (filters: Partial<Filters>) => {
    set((state) => ({ filters: { ...state.filters, ...filters } }))
  },

  setMode: (mode: "web" | "local") => {
    set({ mode })
  },

  setPhotos: (photos: Photo[]) => {
    set({ photos })
  },

  toggleSelection: (photoId: string) => {
    set((state) => ({
      selectedPhotos: state.selectedPhotos.includes(photoId)
        ? state.selectedPhotos.filter((id) => id !== photoId)
        : [...state.selectedPhotos, photoId],
    }))
  },

  clearSelection: () => {
    set({ selectedPhotos: [] })
  },

  selectAll: (photoIds: string[]) => {
    set({ selectedPhotos: photoIds })
  },
}))

export type LogoutReason = "manual" | "expired" | "invalid" | "storage" | "forbidden"

export interface LogoutOptions {
  reason?: LogoutReason
  redirect?: boolean
  redirectTo?: string
  silent?: boolean
}

interface AuthState {
  token: string | null
  expiresAt: number | null
  user: User | null
  isAuthenticated: boolean
  initialized: boolean
}

interface AuthStore extends AuthState {
  setToken: (token: string | null, expiresAt: number | null) => void
  setUser: (user: User | null) => void
  setSession: (session: { token: string; expiresAt: number; user: User }) => void
  isTokenExpired: (graceMs?: number) => boolean
  revalidateExpiration: (trigger?: string) => void
  logout: (options?: LogoutOptions) => void
  init: () => void
}

const initialAuthState: AuthState = {
  token: null,
  expiresAt: null,
  user: null,
  isAuthenticated: false,
  initialized: false,
}


  const computeIsAuthenticated = (snapshot: StoredAuthSnapshot) => {
    if (!snapshot.token) return false
    if (!snapshot.expiresAt) return true
    return snapshot.expiresAt > Date.now()
  }
  

const LOGOUT_MESSAGES: Record<LogoutReason, { title: string; description: string }> = {
  manual: {
    title: "Sesión cerrada",
    description: "Cerraste sesión correctamente.",
  },
  expired: {
    title: "Sesión expirada",
    description: "Tu sesión venció. Iniciá sesión nuevamente.",
  },
  invalid: {
    title: "Sesión inválida",
    description: "El token dejó de ser válido. Volvé a iniciar sesión.",
  },
  storage: {
    title: "Sesión finalizada",
    description: "La sesión se cerró en otra pestaña.",
  },
  forbidden: {
    title: "Acceso restringido",
    description: "No tenés permisos para continuar.",
  },
}

const DEFAULT_LOGIN_ROUTE = "/"
let logoutInFlight = false
let storageListenerRegistered = false
let revalidationListenersRegistered = false

// ✅ Tipo universal (Node + Browser)
let expirationTimer: ReturnType<typeof setTimeout> | null = null

const scheduleExpirationCheck = (
  expiresAt: number | null,
  revalidate: () => void,
) => {
  if (typeof window === "undefined") return

  if (expirationTimer) {
    clearTimeout(expirationTimer)
    expirationTimer = null
  }

  if (!expiresAt) return

  const remaining = expiresAt - Date.now()
  if (remaining <= 0) {
    // Forzar revalidación inmediata; no logout directo
    revalidate()
    return
  }

  // Despertar antes de la expiración para revalidar (mitiga sleep)
  const wakeIn = Math.max(1_000, remaining - EXPIRATION_GRACE_MS / 2)
  expirationTimer = setTimeout(() => {
    revalidate()
  }, wakeIn)
}

const clearExpirationTimer = () => {
  if (typeof window === "undefined") return

  if (expirationTimer) {
    clearTimeout(expirationTimer)
    expirationTimer = null
  }
}



const persistSnapshot = (snapshot: StoredAuthSnapshot | null) => {
  if (!snapshot || !snapshot.token) {
    writeStoredAuthSnapshot(null)
    return
  }
  writeStoredAuthSnapshot(snapshot)
}

export const useAuthStore = create<AuthStore>((set, get) => ({
  ...initialAuthState,

  // Revalidación centralizada para evitar timeouts falsos tras sleep
  revalidateExpiration: (trigger?: string) => {
    const { expiresAt, token } = get()

    if (token && !expiresAt) {
      if (process.env.NODE_ENV !== "production") {
        console.warn("[auth] Token presente sin expiresAt; no se desloguea automáticamente")
      }
      return
    }

    if (!expiresAt) return

    const expired = isTimestampExpired(expiresAt, EXPIRATION_GRACE_MS)
    if (!expired) {
      scheduleExpirationCheck(expiresAt, () => get().revalidateExpiration("timer"))
      return
    }

    const hasActiveUploads =
      typeof window !== "undefined" &&
      Boolean((window as any).__fpActiveUploads || (window as any).__fpActiveLoads)

    get().logout({
      reason: "expired",
      redirect: !hasActiveUploads,
      silent: false,
    })
  },

  setToken: (token: string | null, expiresAt: number | null) => {
    set((state) => {
      const normalizedExpiresAt = token && expiresAt ? expiresAt : null
      const snapshot: StoredAuthSnapshot = {
        token,
        expiresAt: normalizedExpiresAt,
        user: state.user,
      }
      persistSnapshot(snapshot)
      return {
        ...state,
        token,
        expiresAt: normalizedExpiresAt,
        isAuthenticated: computeIsAuthenticated(snapshot),
      }
    })
    scheduleExpirationCheck(get().expiresAt, () => get().revalidateExpiration("timer"))
  },

  setUser: (user: User | null) => {
    set((state) => {
      const snapshot: StoredAuthSnapshot = {
        token: state.token,
        expiresAt: state.expiresAt,
        user,
      }
      persistSnapshot(snapshot)
      return {
        ...state,
        user,
        isAuthenticated: computeIsAuthenticated(snapshot),
      }
    })
  },

  setSession: ({ token, expiresAt, user }) => {
    set((state) => {
      const snapshot: StoredAuthSnapshot = {
        token,
        expiresAt,
        user,
      }
      persistSnapshot(snapshot)
      return {
        ...state,
        token,
        expiresAt,
        user,
        isAuthenticated: computeIsAuthenticated(snapshot),
      }
    })
    scheduleExpirationCheck(expiresAt, () => get().revalidateExpiration("timer"))
  },

  isTokenExpired: (graceMs = EXPIRATION_GRACE_MS) => {
    const { expiresAt } = get()
    if (!expiresAt) return true
    return isTimestampExpired(expiresAt, graceMs)
  },

  logout: (options: LogoutOptions = {}) => {
    const { reason = "manual", redirect = true, redirectTo, silent } = options
    if (logoutInFlight) return

    logoutInFlight = true
    clearExpirationTimer()

    set((state) => ({
      ...initialAuthState,
      initialized: state.initialized,
    }))

    persistSnapshot(null)

    if (typeof window !== "undefined") {
      try {
        window.localStorage.removeItem(LEGACY_TOKEN_KEY)
      } catch {
        // noop
      }
      try {
        window.sessionStorage.removeItem(AUTH_STORAGE_KEY)
      } catch {
        // noop
      }
    }

    if (!silent && typeof window !== "undefined") {
      const message = LOGOUT_MESSAGES[reason] ?? LOGOUT_MESSAGES.manual
      toast({
        title: message.title,
        description: message.description,
      })
    }

    if (redirect && typeof window !== "undefined") {
      const target = redirectTo || DEFAULT_LOGIN_ROUTE
      window.location.replace(target)
    }

    setTimeout(() => {
      logoutInFlight = false
    }, 500)
  },

  init: () => {
    if (typeof window === "undefined") return
    if (get().initialized) return

    let snapshot = readStoredAuthSnapshot()

    if (!snapshot) {
      const legacyToken = window.localStorage.getItem(LEGACY_TOKEN_KEY)
      if (legacyToken) {
        snapshot = {
          token: legacyToken,
          expiresAt: getTokenExpiration(legacyToken),
          user: null,
        }
        persistSnapshot(snapshot)
      }
    }

    if (snapshot) {
      set((state) => ({
        ...state,
        token: snapshot?.token ?? null,
        expiresAt: snapshot?.expiresAt ?? null,
        user: snapshot?.user ?? null,
        isAuthenticated: computeIsAuthenticated(snapshot),
      }))

      if (isTimestampExpired(snapshot.expiresAt)) {
        get().logout({ reason: "expired" })
        return
      }

      scheduleExpirationCheck(snapshot.expiresAt ?? null, () => get().revalidateExpiration("timer"))
    }

    // Revalidar al volver del sleep / cambios de visibilidad
    if (!revalidationListenersRegistered) {
      const wake = () => get().revalidateExpiration("visibility")
      window.addEventListener("visibilitychange", wake)
      window.addEventListener("focus", wake)
      window.addEventListener("pageshow", wake)
      revalidationListenersRegistered = true
    }

    set({ initialized: true })
  },
}))

const registerStorageSync = () => {
  if (storageListenerRegistered || typeof window === "undefined") return

  window.addEventListener("storage", (event: StorageEvent) => {
    if (event.key === AUTH_STORAGE_KEY) {
      if (!event.newValue) {
        useAuthStore.getState().logout({ reason: "storage" })
        return
      }
      try {
        const snapshot = JSON.parse(event.newValue) as StoredAuthSnapshot
        useAuthStore.setState((state) => ({
          ...state,
          token: snapshot.token,
          expiresAt: snapshot.expiresAt ?? null,
          user: snapshot.user ?? null,
          isAuthenticated: computeIsAuthenticated(snapshot),
        }))
        scheduleExpirationCheck(snapshot.expiresAt ?? null, useAuthStore.getState().logout)
      } catch (error) {
        console.error("Error sincronizando autenticación entre pestañas", error)
      }
      return
    }

    if (event.key === LEGACY_TOKEN_KEY && !event.newValue) {
      useAuthStore.getState().logout({ reason: "storage" })
    }
  })

  storageListenerRegistered = true
}

if (typeof window !== "undefined") {
  useAuthStore.getState().init()
}
