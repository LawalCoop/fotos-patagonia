import mercadopago
from fastapi import HTTPException, status
from sqlalchemy.orm import Session, joinedload

from models.order import Order, OrderItem, OrderCreateSchema, PaymentMethod
from services.base import BaseService
from core.config import settings


class CheckoutService(BaseService):
    def create_mercadopago_preference(self, order_id: int):
        if not settings.MERCADOPAGO_ACCESS_TOKEN:
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail="Mercado Pago access token is not configured."
            )

        # 1. Fetch the order with its items and photos
        order = self.db.query(Order).options(
            joinedload(Order.items).joinedload(OrderItem.photo)
        ).filter(Order.id == order_id).first()

        if not order:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=f"Order with id {order_id} not found.")

        # 2. Dynamically build the items list for Mercado Pago
        preference_items = []
        for item in order.items:
            
            # VALIDATION: Ensure price is valid before sending to Mercado Pago
            if not item.price or item.price <= 0:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail=f"Cannot create payment for photo ID {item.photo.id} with a zero or invalid price."
                )

            preference_items.append({
                "title": item.photo.description or f"Foto ID: {item.photo.id}",
                "description": "Foto digital descargable de alta resolución",
                "quantity": item.quantity,
                "unit_price": item.price,
                "currency_id": "ARS" # Assuming ARS, could be dynamic in the future
            })
        
        # Ensure there's at least one item
        if not preference_items:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Cannot create payment for an empty order.")

        try:
            sdk = mercadopago.SDK(settings.MERCADOPAGO_ACCESS_TOKEN)

            # URLs are now sourced from config
            back_urls = {
                "success": settings.MERCADOPAGO_SUCCESS_URL,
                "failure": settings.MERCADOPAGO_FAILURE_URL,
                "pending": settings.MERCADOPAGO_PENDING_URL
            }
            
            # The notification URL must be a public URL (use ngrok for local dev)
            notification_url = settings.MERCADOPAGO_NOTIFICATION_URL
            if not notification_url:
                raise HTTPException(
                    status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                    detail="Mercado Pago notification URL is not configured."
                )

            preference_data = {
                "items": preference_items,
                "back_urls": back_urls,
                "auto_return": "approved",
                "external_reference": str(order.id), # Use the actual order ID as a string
                "notification_url": notification_url,
            }
            
            print("Sending data to Mercado Pago:", preference_data) # DEBUGGING

            preference_response = sdk.preference().create(preference_data)
            
            if preference_response["status"] != 201:
                raise HTTPException(
                    status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                    detail=f"Error creating Mercado Pago preference: {preference_response.get('response', {}).get('message', 'Unknown error')}"
                )

            preference = preference_response["response"]
            return {
                "preference_id": preference["id"],
                "init_point": preference["init_point"]
            }

        except Exception as e:
            print(f"Error with Mercado Pago SDK: {e}")  # Log for debugging
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail="Could not create payment preference due to an internal error."
            )

    def mercadopago_webhook(self, webhook_data: dict):
        """
        Handles incoming webhooks from Mercado Pago.
        For production, it's crucial to verify the X-Signature header to ensure the request is from Mercado Pago.
        """
        print("Received Mercado Pago webhook:", webhook_data)

        if webhook_data.get("type") != "payment":
            return {"status": "webhook ignored, not a payment type"}
        
        payment_id = webhook_data.get("data", {}).get("id")
        if not payment_id:
            return {"status": "webhook ignored, no payment id"}

        if not settings.MERCADOPAGO_ACCESS_TOKEN:
            print(f"ERROR: Received webhook for payment {payment_id}, but Mercado Pago is not configured.")
            raise HTTPException(status_code=500, detail="Mercado Pago is not configured")

        try:
            sdk = mercadopago.SDK(settings.MERCADOPAGO_ACCESS_TOKEN)
            payment_info = sdk.payment().get(payment_id)

            if payment_info["status"] != 200:
                print(f"❌ Could not fetch payment info for ID {payment_id}.")
                # Devolvemos 200 para que MP no reintente una llamada fallida a su propia API.
                return {"status": "error fetching payment info from Mercado Pago"}

            payment = payment_info["response"]
            
            if payment["status"] == "approved":
                external_reference = payment.get("external_reference")
                if not external_reference:
                    print(f"ERROR: Payment {payment_id} approved but has no external_reference (order_id).")
                    return {"status": "error, missing external_reference"}

                try:
                    order_id = int(external_reference)
                except (ValueError, TypeError):
                    print(f"ERROR: external_reference '{external_reference}' is not a valid order ID.")
                    return {"status": "error, invalid external_reference"}

                print(f"✅ Payment with ID {payment_id} was approved for Order ID: {order_id}")
                
                # --- Usar el servicio de órdenes para marcar como pagada ---
                from services.orders import OrderService

                try:
                    order_service = OrderService(self.db)
                    order_service.mark_order_as_paid(
                        order_id=order_id,
                        payment_method=PaymentMethod.MP,
                        external_payment_id=str(payment_id)
                    )
                    print(f"   Order {order_id} successfully updated to 'paid'.")
                except HTTPException as e:
                    # Si la orden no se encuentra o ya fue pagada, no es un error crítico para MP.
                    print(f"NOTE: Could not mark order {order_id} as paid. Reason: {e.detail}")
                except Exception as e:
                    print(f"CRITICAL: An unexpected error occurred while updating order {order_id}: {e}")
                    # Levantar excepción para que MP sepa que algo falló y debe reintentar.
                    raise HTTPException(status_code=500, detail="Failed to update order in database.")

            else:
                print(f"ℹ️ Payment with ID {payment_id} has status: {payment['status']}.")

        except Exception as e:
            print(f"Error processing webhook for payment {payment_id}: {e}")
            raise HTTPException(status_code=500, detail="Internal server error processing webhook.")
        
        return {"status": "webhook processed"}

    def get_checkout_status(self):
        # Business logic for querying payment status
        return {"message": "CheckoutService: Get checkout status logic"}

    def register_local_sale(self):
        # Business logic for registering a local sale
        return {"message": "CheckoutService: Register local sale logic"}

    def create_order(self, order_in: OrderCreateSchema) -> Order:
        db_order = Order(
            user_id=order_in.user_id,
            guest_id=order_in.guest_id,
            customer_email=order_in.customer_email,
            subtotal=order_in.subtotal,
            total=order_in.total,
            payment_method=order_in.payment_method,
            payment_status=order_in.payment_status,
            order_status=order_in.order_status,
            external_payment_id=order_in.external_payment_id,
            discount_id=order_in.discount_id
        )
        self.db.add(db_order)
        self.db.flush()  # Flush to get the order ID

        for item_in in order_in.items:
            db_order_item = OrderItem(
                order_id=db_order.id,
                photo_id=item_in.photo_id,
                price=item_in.price,
                quantity=item_in.quantity,
                format=item_in.format
            )
            self.db.add(db_order_item)
        
        self.db.commit()
        self.db.refresh(db_order)

        # Re-fetch the order with all relationships loaded for proper serialization
        order = self.db.query(Order).options(
            joinedload(Order.user),
            joinedload(Order.items).joinedload(OrderItem.photo),
            joinedload(Order.discount)
        ).filter(Order.id == db_order.id).first()
        
        return order
