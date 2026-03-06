export interface Photo {
  id: string;
  albumId?: string;
  albumName?: string;
  sessionId?: string;
  photographerId?: string;
  photographerName?: string;
  takenAt?: string; // ISO date string
  place?: string;
  timeSlot?: string; // "18:30", range, etc.
  price?: number; // visible only where appropriate
  description?: string;
  tags?: string[]; // Added tags field for photo categorization
  objectName: string; // Nombre del objeto ORIGINAL en S3 (alta calidad)
  // Thumbnail generado en frontend y subido a storage con prefijo `thumb_`
  thumbnailObjectName?: string;
  // Objeto a usar para previsualizaciones ligeras (thumb)
  previewObjectName?: string;
  // urls: {
  //   thumb: string;
  //   web: string; // with watermark (web)
  //   local: string; // without watermark (local)
  //   original?: string; // admin/order
  // };
}

// Modelo sólo frontend para UI optimista de subidas
export interface UploadingPhoto {
  tempId: string;
  previewUrl: string;
  status: "uploading" | "success" | "error";
  progress?: number;
}

// IDs válidos para formatos de impresión
export type PrintFormatId =
  | "polaroid-large"
  | "polaroid-medium"
  | "polaroid-small"
  | "10x15"
  | "15x20";

export interface PrintFormat {
  id: PrintFormatId;
  name: string;
  size: string; // "10x15", "13x18", etc.
  price: number; // Precio POR PACK de impresión (no incluye la foto digital)
  description?: string;
  active: boolean;
  requiredPhotos?: number; // Cantidad específica de fotos requeridas para este formato (ej: Polaroid)
}

/**
 * 🔎 Modelos explícitos para separar conceptos:
 * - DigitalPhoto: lo que siempre se compra y descarga.
 * - PrintablePhoto: extiende DigitalPhoto y puede tener uno o más formatos de impresión asociados.
 * - PrintFormatPrice: precio adicional que se suma al precio digital base.
 */
export interface DigitalPhoto extends Photo {
  price: number; // Precio base de la foto digital, proviene del backend (Photo.price)
}

export interface PrintablePhoto extends DigitalPhoto {
  printFormats?: PrintFormatId[]; // Formatos permitidos (future-proof, aún no persistido en backend)
}

export type OrderItemKind = "digital" | "print";

// Línea calculada antes de enviar al backend, usada para trazabilidad en metadata.
export interface OrderDraftItem {
  kind: OrderItemKind;
  photoId: string;
  price: number; // Precio capturado al momento de compra (digital o impresión)
  quantity: number;
  printFormatId?: PrintFormatId;
  printFormatLabel?: string;
  packSize?: number;
}

export interface PrintSelection {
  id: string;
  format: PrintFormat;
  photoIds: string[];
}

export interface CartComboSelection {
  id: number;
  name: string;
  price: number;
  totalPhotos: number;
}

export interface CartItem {
  photoId: string;
  selected: boolean;  // checkbox selection
  favorite: boolean;
  printer: boolean;
}

export interface CartState {
  items: CartItem[];
  printSelections: PrintSelection[];
  email?: string;
  discountCode?: string;
  discountInfo?: { type: "percent" | "fixed"; value: number };
  // Impresiones
  printsSubtotalCalculated: number; // subtotal automático (packs x precio formato)
  printsSubtotalManual?: number; // override manual staff
  printsManualEnabled: boolean; // flag de override
  printsSubtotalEffective: number; // valor usado para total

  // Digitales
  digitalSubtotalCalculated: number; // subtotal automático (digitales + combo)
  digitalSubtotalManual?: number; // override manual staff
  digitalManualEnabled: boolean; // flag de override
  digitalSubtotalEffective: number; // valor usado para total

  // Totales
  subtotal: number; // total efectivo antes de descuentos (compat)
  total: number; // total final con descuentos aplicados
  totalEffective: number; // printsEffective + digitalEffective

  savedSessionId?: string;
  channel: "web" | "local"; // affects checkout flow
  selectedCombo?: CartComboSelection | null
}

export interface Filters {
  date?: string;
  place?: string;
  time?: string;
}

export interface SessionRow {
  id: string;
  link: string;
  email?: string;
  createdAt: string;
}

// Foto anidada en OrderItem (de la API)
export interface OrderItemPhoto {
  id: number;
  filename: string;
  price: number;
  photographer_id?: number;
  session_id?: number;
  description?: string | null;
  object_name?: string;
  // Campos adicionales devueltos por el backend para descarga/visualización
  url?: string;
  watermark_url?: string;
}

export interface OrderItem {
  // Campos de la API
  id?: number;
  order_id?: number;
  photo_id?: number;
  price?: number;
  quantity?: number;
  photo?: OrderItemPhoto;
  format?: string;
  // Campos legacy (localStorage)
  photoId?: string;
  priceAtPurchase?: number;
}

// Enums para consistencia con el backend
export enum OrderStatus {
  PENDING = "pending",
  PAID = "paid",
  COMPLETED = "completed",
  SHIPPED = "shipped",
  REJECTED = "rejected",
}

export enum PaymentMethod {
  EFECTIVO = "efectivo",
  TRANSFERENCIA = "transferencia",
  POSNET = "posnet",
  MP = "mp",
}
export interface Order {
  id: string | number;
  // Campos de la API
  uuid?: string;
  public_id?: string;
  user_id?: number;
  user?: User;
  customer_email?: string;
  subtotal?: number;
  total: number;
  discount_id?: number | null;
  discount?: DiscountCode | null;
  order_status?: OrderStatus;
  payment_status?: "pending" | "paid" | "failed" | "refunded";
  payment_method?: PaymentMethod;
  external_payment_id?: string | null;
  created_at?: string; // ISO date from API
  // Campos legacy (localStorage) - mantener para compatibilidad si aún se usan
  channel?: "web" | "local";
  status?: "enviado" | "rechazado" | "en_espera" | "pagado" | "entregado"; // Mantener por si hay código legacy
  email?: string;
  localOrderNumber?: string | number;
  downloadUrl?: string;
  paymentMethod?: "efectivo" | "transferencia" | "posnet" | "mp"; // Mantener por si hay código legacy
  createdAt?: string;
  editableUntil?: string;
  photos?: string[];
  // Común
  total: number;
  items?: OrderItem[];
}

export interface Permission {
  id: number;
  name: string;
  description?: string;
}

export interface Role {
  id: number;
  name: string;
  description?: string;
  permissions: Permission[];
}

export interface User {
  id: number;
  email: string;
  is_active: boolean;
  role: Role;
  // Campos auxiliares para compatibilidad con código existente
  photographer_id?: number;
  // Relación completa cuando el backend la envía embebida
  photographer?: Photographer | null;
}

// Helper function para obtener el nombre del rol
export function getUserRoleName(user: User | null): string | null {
  return user?.role?.name || null;
}

// Helper function para verificar si el usuario tiene un permiso
export function hasPermission(
  user: User | null,
  permissionName: string
): boolean {
  if (!user?.role?.permissions) return false;
  return user.role.permissions.some((p) => p.name === permissionName);
}

// Helper function para verificar si el usuario es admin
export function isAdmin(user: User | null): boolean {
  return (
    hasPermission(user, "full_access") ||
    getUserRoleName(user)?.toLowerCase() === "admin"
  );
}

export interface Album {
  id: string | number;
  name: string;
  description?: string | null;
  default_photo_price?: number;
  // Backend fields (from PhotoSession, populated in responses)
  sessions?: any[]; // PhotoSession[]
  tags?: Tag[];
  combos?: PhotoCombo[];
  // Legacy frontend fields (optional)
  filters?: Filters;
  photographerIds?: string[];
  coverPhoto?: string;
  createdAt?: string;
  event?: string;
  location?: string;
  photoCount?: number;
  isPublic?: boolean;
  sessionIds?: number[];
  tagIds?: number[];
  comboIds?: number[];
}

export interface Photographer {
  id: number;
  name: string;
  commission_percentage: number;
  contact_info: string;
  user_id?: number;
  email?: string;
  password?: string;
}

export interface Earning {
  id: number;
  photographer_id: number;
  order_id: number;
  photo_id: string;
  amount: number;
  earned_photo_fraction: number;
  created_at: string; // ISO date string
  photo_filename?: string;
}

export interface PhotographerEarningsSummary {
  total_earnings: number;
  total_earned_photo_fraction: number;
  total_orders_involved: number;
  photographer_id: number;
  start_date: string | null; // ISO date string or null
  end_date: string | null; // ISO date string or null
}

export interface EarningsSummaryAllItem {
  photographer_id: number;
  photographer_name: string;
  total_earnings: number;
}

export interface LightboxState {
  isOpen: boolean;
  currentPhotoId?: string;
  photos: Photo[];
}

export interface GalleryState {
  photos: Photo[];
  filters: Filters;
  page: number;
  totalPages: number;
  mode: "web" | "local"; // determines which URL to use (with/without watermark)
}

export interface Tag {
  id: string | number;
  name: string;
  color?: string;
  createdAt?: string;
}

export interface DiscountCode {
  id: string;
  code: string;
  type: "percent" | "fixed";
  value: number;
  maxUses?: number;
  usedCount: number;
  expiresAt?: string;
  active: boolean;
  createdAt: string;
}

export interface PhotoCombo {
  id: string;
  name: string;
  description?: string; // Descripción del combo
  totalPhotos: number; // Cantidad total de fotos en el combo
  price: number; // Precio total del combo
  equivalentPhotos?: number; // Fotos reales que se pagan (para calcular descuento) - solo frontend
  active: boolean;
  isFullAlbum: boolean; // Si es un combo de álbum completo
  createdAt?: string; // Solo frontend, no viene del backend
}

// Para listados (público + admin)
export interface AlbumListItem {
  id: number
  name: string
  description?: string | null
  coverPhotoObjectName?: string
  createdAt?: string
  location?: string
  event?: string
  photographerName?: string
  photographerId?: number
  photoCount: number
  tags: string[]
}

// Para detalle / ABM
export interface AlbumDetail {
  id: number
  name: string
  description?: string | null
  default_photo_price?: number
  sessions?: any[]
  tags?: any[]
  combos?: any[]
}

export interface AdminCommissionSummary {
  photographer_id: number;
  photographer_name: string;
  total_commission: number;
  total_gross_sales: number;
}

export interface AdminDashboardSchema {
  total_photos: number;
  total_photos_sold: number;
  total_real_photos_sold: number;
  total_orders: number;
  total_gross_revenue: number;
  total_commissions: number;
  orders_by_payment_method: Record<string, number>;
  commissions_by_photographer: AdminCommissionSummary[];
}