"use client";

import type React from "react";

import { useState, useMemo, useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  ArrowLeft,
  CreditCard,
  Store,
  CheckCircle2,
  Printer,
  ImageIcon,
} from "lucide-react";
import { Header } from "@/components/organisms/header";
import { Button } from "@/components/ui/button";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Label } from "@/components/ui/label";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { useCartStore, useAuthStore } from "@/lib/store";
import { usePhotos } from "@/hooks/photos/usePhotos";
import { isAdmin } from "@/lib/types";
import { isStaff } from "@/lib/permissions";
import type { Order, OrderDraftItem, OrderItem, Photo, PrintFormat } from "@/lib/types";
import { Badge } from "@/components/ui/badge";
import { mapBackendPhotoToPhoto } from "@/lib/mappers/photos";
import { useCheckout } from "@/hooks/checkout/useCheckout";
import { usePresignedUrl } from "@/hooks/photos/usePresignedUrl";
import { buildThumbObjectName } from "@/lib/photo-thumbnails";
import { getPackSize } from "@/lib/print-formats";
import { formatPhotoDate } from "@/lib/datetime";

type MercadoPagoPreferenceResponse = {
  init_point?: string;
  preference_id?: string;
};

// Sub-componente para cargar la imagen de la foto del checkout
function CheckoutPhotoThumbnail({ photo }: { photo: Photo }) {
  const previewObjectName =
    photo.previewObjectName ?? buildThumbObjectName(photo.objectName);
  const { url, loading, error } = usePresignedUrl(previewObjectName);

  if (loading) {
    return (
      <div className="relative h-12 w-12 flex-shrink-0 overflow-hidden rounded-lg bg-muted flex items-center justify-center">
        <ImageIcon className="h-6 w-6 text-gray-400 animate-pulse" />
      </div>
    );
  }

  if (error || !url) {
    return (
      <div className="relative h-12 w-12 flex-shrink-0 overflow-hidden rounded-lg bg-red-100 flex items-center justify-center text-red-500 text-xs text-center">
        Error
      </div>
    );
  }

  return (
    <div className="relative h-12 w-12 flex-shrink-0 overflow-hidden rounded-lg bg-muted">
      <img
        src={url}
        alt={photo.place || "Foto"}
        className="h-full w-full object-cover"
      />
    </div>
  );
}


export default function CheckoutPage() {
  const router = useRouter();
  const {
    items,
    printSelections,
    email,
  
    // 💰 valores reales
    printsSubtotalEffective,
    digitalSubtotalEffective,
    totalEffective,
    subtotal,
  
    // 🧠 flags de edición
    printsManualEnabled,
    digitalManualEnabled,
  
    clearCart,
  } = useCartStore()

  const effectiveTotal = totalEffective;
  

  const { user, isAuthenticated } = useAuthStore();
  const { photos } = usePhotos();
  const { createOrder, createMercadoPagoPreference } = useCheckout();

  // Create photos map for quick lookup
  const mappedPhotos = useMemo(
    () => photos.map((photo) => mapBackendPhotoToPhoto(photo)),
    [photos]
  );

  const photosMap = useMemo(() => {
    const map = new Map<string, Photo>();
    mappedPhotos.forEach((photo) => {
      map.set(photo.id, photo);
    });
    return map;
  }, [mappedPhotos]);

  const printSelectionMap = useMemo(() => {
    const map = new Map<
      string,
      { selectionId: string; format: PrintFormat; photoIds: string[] }
    >();
    printSelections.forEach((selection) => {
      selection.photoIds.forEach((photoId) => {
        map.set(photoId, {
          selectionId: selection.id,
          format: selection.format,
          photoIds: selection.photoIds,
        });
      });
    });
    return map;
  }, [printSelections]);

  // Determinar el canal según el tipo de usuario
  // Staff users (admin o usuarios con photographer_id) pueden usar el canal "local"
  const isStaffUser = isAuthenticated && isStaff(user);
  const defaultChannel = isStaffUser ? "local" : "web";
  const orderChannel = isStaffUser ? "local" : "web"
  const canShowPrints = orderChannel === "local"
  
  const [selectedChannel, setSelectedChannel] = useState<"web" | "local">(
    defaultChannel
  );
  const [paymentMethod, setPaymentMethod] = useState<
    "efectivo" | "transferencia" | "posnet" | "mp"
  >();
  const [isProcessing, setIsProcessing] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  useEffect(() => {
    if (items.length === 0) {
      router.push("/carrito");
    }
    if (!email) {
      router.push("/carrito");
    }
  }, [items, email, router]);

  // Actualizar el canal según el tipo de usuario
  useEffect(() => {
    setSelectedChannel(defaultChannel);
  }, [defaultChannel]);

  const cartPhotos = useMemo(() => {
    return items
      .map((item) => {
        const photo = photosMap.get(item.photoId);
        const selection = printSelectionMap.get(item.photoId);
        return photo ? { photo, item, selection } : null;
      })
      .filter((item) => item !== null);
  }, [items, photosMap, printSelectionMap]);

  const digitalPhotos = useMemo(() => {
    return cartPhotos.filter((item) => !item.item.printer);
  }, [cartPhotos]);

  const printPhotos = useMemo(() => {
    return cartPhotos.filter((item) => item.item.printer);
  }, [cartPhotos]);

  const unassignedPrintPhotos = useMemo(
    () => printPhotos.filter((item) => !item.selection),
    [printPhotos],
  );

  const hasUnassignedPrints = unassignedPrintPhotos.length > 0;
  const printValidationError = hasUnassignedPrints
    ? "Asigná un formato a todas las fotos a imprimir antes de continuar."
    : null;

  const printSummary = useMemo(
    () =>
      printSelections.map((selection) => {
        const packSize = getPackSize(selection.format);
        const packs = Math.ceil(selection.photoIds.length / packSize);
        return {
          id: selection.id,
          packs,
          totalPrice: packs * selection.format.price,
          format: selection.format,
        };
      }),
    [printSelections],
  );

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!paymentMethod || !email) return;
    if (hasUnassignedPrints) {
      setSubmitError(
        "Hay fotos marcadas para imprimir sin formato. Volvé al carrito y asigná un formato.",
      );
      return;
    }

    setIsProcessing(true);
    setSubmitError(null);

    // Determinar el canal según el tipo de usuario
    const orderChannel = isStaffUser ? "local" : "web";

    // ----- Orden explícita: siempre comprar digital + agregar impresión si aplica -----
    const digitalLines: OrderDraftItem[] = items.map((item) => {
      const photo = photosMap.get(item.photoId);
      const basePrice = photo?.price || 0;
      return {
        kind: "digital",
        photoId: item.photoId,
        price: basePrice,
        quantity: 1,
      };
    });

    const printLines: OrderDraftItem[] = [];
    printSelections.forEach((selection) => {
      const packSize = getPackSize(selection.format);
      const packs = Math.ceil(selection.photoIds.length / packSize);
      const selectionTotal = packs * selection.format.price;
      const perPhotoPrintPrice =
        selection.photoIds.length > 0
          ? selectionTotal / selection.photoIds.length
          : selectionTotal;

      selection.photoIds.forEach((photoId) => {
        printLines.push({
          kind: "print",
          photoId,
          price: perPhotoPrintPrice,
          quantity: 1,
          printFormatId: selection.format.id,
          printFormatLabel: selection.format.name,
          packSize,
        });
      });
    });

    const orderDraftItems: OrderDraftItem[] = [...digitalLines, ...printLines];

    // FIX: Usar el precio efectivo para que coincida con el total de `useCartStore`
    // que ya tiene combos/descuentos aplicados.
    const hasItems = items.length > 0;
    const effectivePricePerItem = hasItems ? effectiveTotal / items.length : 0;

    const orderItemsForBackend: OrderItem[] = orderDraftItems.map((it) => ({
      price: effectivePricePerItem,
      quantity: it.quantity,
      photo_id: Number(it.photoId),
      format: it.printFormatLabel,
    }));


    
    // Payload para backend (ajustar si el backend espera campos distintos)
  // Payload para backend (ajustado al esquema real)
  const orderPayload = {
    customer_email: email,
    subtotal: subtotal,
    total: effectiveTotal,
    payment_method: paymentMethod,
    payment_status: "pending",    order_status: "pending",
    external_payment_id: null,
    user_id: isAuthenticated ? user?.id ?? null : null,
    discount_id: null,
  
    items: orderItemsForBackend,
  
    metadata: {
      channel: orderChannel,
      items: orderDraftItems,
      overrideTotal: effectiveTotal, 
    },
  };
  



    try {
      // 1) Crear orden en el backend obligatorio antes de generar preferencia
      const createdOrder = (await createOrder(orderPayload)) as Order;
      // Guardar orden en localStorage para poder mostrarla en la página de éxito
      try {
        const existingOrders = localStorage.getItem("orders");
        const orders = existingOrders ? JSON.parse(existingOrders) : [];
        orders.push(createdOrder);
        localStorage.setItem("orders", JSON.stringify(orders));
      } catch (err) {
        // no bloquear si falla el guardado local
        console.warn("No se pudo guardar la orden en localStorage", err);
      }

      if (orderChannel === "web") {
        // 2) Crear preferencia MERCADO PAGO enviando SOLO { order_id }
        const preference = (await createMercadoPagoPreference({
          order_id: createdOrder.id,
        })) as MercadoPagoPreferenceResponse;

        if (!preference?.init_point) {
          throw new Error("No se recibió el enlace de pago de Mercado Pago.");
        }

        // Redirigir al init_point de Mercado Pago
        window.location.href = preference.init_point;
        return;
      }

      // Canal local: limpiar carrito y redirigir a página de éxito/confirmación
      clearCart();
      router.push(
        `/checkout/success?orderId=${encodeURIComponent(
          String(createdOrder.id)
        )}`
      );
    } catch (error: any) {
      console.error("Error procesando el checkout:", error);
      setSubmitError(
        error?.message || "No pudimos iniciar el pago, intenta nuevamente."
      );
    } finally {
      setIsProcessing(false);
    }
  };

  if (items.length === 0 || !email) {
    return null;
  }

  return (
    <div className="min-h-screen bg-background">
      <Header />
      <div className="container mx-auto px-4 py-8">
        <Link
          href="/carrito"
          className="mb-6 inline-flex items-center text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="mr-2 h-4 w-4" />
          Volver al carrito
        </Link>

        <div className="mb-8">
          <h1 className="mb-2 text-4xl font-heading text-balance">
            Finalizar Compra
          </h1>
          <p className="text-muted-foreground">
            Completa tu información para procesar el pedido
          </p>
        </div>

        <div className="grid gap-8 lg:grid-cols-3">
          {/* Checkout Form */}
          <div className="lg:col-span-2">
            <form onSubmit={handleSubmit} className="space-y-6">
              <Card className="rounded-2xl border-gray-200 shadow-md">
                <CardHeader>
                  <CardTitle>Canal de Pago</CardTitle>
                  <CardDescription>
                    {isStaffUser
                      ? "Como usuario del personal, puedes generar órdenes para pago en local"
                      : "Selecciona tu método de pago online"}
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  {isStaffUser ? (
                    // Solo mostrar opción local para admin, vendedor y fotógrafo
                    <div className="flex items-start space-x-3 rounded-xl border border-primary bg-primary/5 p-4">
                      <Store className="h-5 w-5 text-primary mt-1" />
                      <div className="flex-1">
                        <div className="font-semibold">Pago en Local</div>
                        <p className="mt-1 text-sm text-muted-foreground">
                          Genera un número de orden (ORD-[ID]) que se comunicará
                          con el backend
                        </p>
                      </div>
                    </div>
                  ) : (
                    // Solo mostrar opción web para visitantes
                    <div className="flex items-start space-x-3 rounded-xl border border-primary bg-primary/5 p-4">
                      <CreditCard className="h-5 w-5 text-primary mt-1" />
                      <div className="flex-1">
                        <div className="font-semibold">Pago por Internet</div>
                        <p className="mt-1 text-sm text-muted-foreground">
                          Paga online de forma segura con Mercado Pago
                        </p>
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>

              <Card className="rounded-2xl border-gray-200 shadow-md">
                <CardHeader>
                  <CardTitle>Método de Pago</CardTitle>
                  <CardDescription>
                    {isStaffUser
                      ? "Selecciona cómo se realizará el pago en el local"
                      : "Procederás al pago con Mercado Pago"}
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <RadioGroup
                    value={paymentMethod}
                    onValueChange={(value) =>
                      setPaymentMethod(value as typeof paymentMethod)
                    }
                  >
                    {isStaffUser ? (
                      // Opciones para pago en local
                      <>
                        <div className="flex items-center space-x-3 rounded-xl border border-gray-200 p-4">
                          <RadioGroupItem value="efectivo" id="efectivo" />
                          <Label
                            htmlFor="efectivo"
                            className="flex-1 cursor-pointer font-medium"
                          >
                            Efectivo
                          </Label>
                        </div>
                        <div className="flex items-center space-x-3 rounded-xl border border-gray-200 p-4">
                          <RadioGroupItem value="posnet" id="posnet_local" />
                          <Label
                            htmlFor="posnet_local"
                            className="flex-1 cursor-pointer font-medium"
                          >
                            Tarjeta (POS en local)
                          </Label>
                        </div>
                        <div className="flex items-center space-x-3 rounded-xl border border-gray-200 p-4">
                          <RadioGroupItem value="transferencia" id="transferencia" />
                          <Label
                            htmlFor="transferencia"
                            className="flex-1 cursor-pointer font-medium"
                          >
                            Transferencia
                          </Label>
                        </div>
                      </>
                    ) : (
                      // Solo Mercado Pago para visitantes
                      <div className="flex items-center space-x-3 rounded-xl border border-gray-200 p-4">
                        <RadioGroupItem value="mp" id="mp" />
                        <Label
                          htmlFor="mp"
                          className="flex-1 cursor-pointer font-medium"
                        >
                          Mercado Pago
                        </Label>
                      </div>
                    )}
                  </RadioGroup>
                </CardContent>
              </Card>

              {isStaffUser && (
                <div className="rounded-xl bg-secondary/50 p-4 text-sm">
                  <p className="font-medium">
                    Instrucciones para pago en local:
                  </p>
                  <ol className="mt-2 list-inside list-decimal space-y-1 text-muted-foreground">
                    <li>
                      Confirma tu pedido para generar el número de orden
                      (ORD-[ID])
                    </li>
                    <li>
                      La orden se comunicará automáticamente con el backend
                    </li>
                    <li>
                      El cliente puede pagar en el local con el método
                      seleccionado
                    </li>
                  </ol>
                </div>
              )}

              <Button
                type="submit"
                disabled={isProcessing || !paymentMethod || hasUnassignedPrints}
                className="w-full rounded-xl bg-primary py-6 text-lg font-semibold text-foreground hover:bg-primary-hover disabled:opacity-50"
              >
                {isProcessing ? (
                  "Procesando..."
                ) : (
                  <>
                    <CheckCircle2 className="mr-2 h-5 w-5" />
                    {isStaffUser
                      ? "Generar Orden Local (ORD-[ID])"
                      : "Proceder a Mercado Pago"}
                  </>
                )}
              </Button>
              {printValidationError && (
                <p className="text-sm text-destructive text-center">{printValidationError}</p>
              )}
              {submitError && (
                <p className="text-sm text-destructive text-center">
                  {submitError}
                </p>
              )}
            </form>
          </div>

          {/* Order Summary */}
          <div className="lg:col-span-1">
            <div className="sticky top-24 rounded-2xl bg-card p-6 shadow-lg">
              <h2 className="mb-4 text-xl font-heading">Resumen del Pedido</h2>

              {/* Fotos Impresas */}
              {canShowPrints && printPhotos.length > 0 && (
                <div className="mb-4 space-y-3 border-b border-gray-200 pb-4">
                  <div className="flex items-center justify-between">
                    <h3 className="text-sm font-semibold text-muted-foreground flex items-center gap-2">
                      <Printer className="h-4 w-4" />
                      FOTOS IMPRESAS
                    </h3>
                    <span className="text-xs text-muted-foreground">
                      {printPhotos.length}{" "}
                      {printPhotos.length === 1 ? "foto" : "fotos"}
                    </span>
                  </div>
                  {printPhotos.slice(0, 3).map(({ photo, item, selection }) => {
                    const packSize = selection ? getPackSize(selection.format) : 1;
                    const packs = selection ? Math.ceil(selection.photoIds.length / packSize) : 0;
                    const selectionTotal = selection ? packs * selection.format.price : 0;
                    const perPhotoPrice =
                      selection && selection.photoIds.length > 0
                        ? selectionTotal / selection.photoIds.length
                        : photo.price ?? 0;

                    return (
                    <div
                      key={photo.id}
                      className="flex items-center gap-3"
                    >
                      <CheckoutPhotoThumbnail photo={photo} />
                      <div className="flex-1">
                        <p className="text-sm font-medium">
                          {photo.place}
                        </p>
                        {selection ? (
                          <Badge variant="secondary" className="text-xs mt-1">
                            {selection.format.name} ({selection.format.size})
                          </Badge>
                        ) : (
                          <p className="text-xs text-destructive">
                            Sin formato
                          </p>
                        )}
                      </div>
                      <p className="text-sm font-semibold">
                        ${selectionTotal}

                      </p>
                    </div>
                  )})}
                  {printPhotos.length > 3 && (
                    <p className="text-sm text-muted-foreground">
                      + {printPhotos.length - 3} fotos más
                    </p>
                  )}
                </div>
              )}

              {/* Fotos Digitales */}
              {digitalPhotos.length+printPhotos.length > 0 && (
                <div className="mb-4 space-y-3 border-b border-gray-200 pb-4">
                  <div className="flex items-center justify-between">
                    <h3 className="text-sm font-semibold text-muted-foreground">
                      FOTOS DIGITALES
                    </h3>
                    <span className="text-xs text-muted-foreground">
                      {digitalPhotos.length+printPhotos.length}{" "}
                      {digitalPhotos.length+printPhotos.length === 1 ? "foto" : "fotos"}
                    </span>
                  </div>
                  {(digitalPhotos.concat(printPhotos)).slice(0, 3).map(({ photo }) => (
                    <div
                      key={photo.id}
                      className="flex items-center gap-3"
                    >
                      <CheckoutPhotoThumbnail photo={photo} />
                      <div className="flex-1">
                        <p className="text-sm font-medium">
                          {photo.place}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {photo.takenAt && formatPhotoDate(photo.takenAt)}
                        </p>
                      </div>
                      <p className="text-sm font-semibold">
                        ${photo.price}
                      </p>
                    </div>
                  ))}
                  {digitalPhotos.length > 3 && (
                    <p className="text-sm text-muted-foreground">
                      + {digitalPhotos.length - 3} fotos más
                    </p>
                  )}
                </div>
              )}

              <div className="space-y-2">
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Email</span>
                  <span className="font-medium">{email}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">
                    Total ({items.length} fotos)
                  </span>
                  <span className="font-medium">${effectiveTotal}</span>
                </div>
                {printPhotos.length > 0 && (
                  <div className="text-xs text-muted-foreground pt-2 space-y-1">
                    {printSummary.map((summary) => (
                      <div key={summary.id} className="flex justify-between">
                        <span>
                          • {summary.format.name} ({summary.format.size}) × {summary.packs} pack
                          {summary.packs > 1 ? "s" : ""}
                        </span>
                        <span>${summary.totalPrice}</span>
                      </div>
                    ))}
                  </div>
                )}
                <div className="flex justify-between border-t border-gray-200 pt-2 text-lg font-bold">
                  <span>Total</span>
                    <span className="text-primary">${effectiveTotal}</span>
                </div>
              </div>

              <div className="mt-6 space-y-2 border-t border-gray-200 pt-6 text-xs text-muted-foreground">
                <p>✓ Descarga inmediata después del pago</p>
                <p>✓ Resolución web y alta calidad</p>
                {canShowPrints && printPhotos.length > 0 && (
                    <p>✓ Impresiones en formato seleccionado</p>
                  )}
                <p>✓ Soporte técnico incluido</p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
