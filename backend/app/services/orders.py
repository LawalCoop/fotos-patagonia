import zipfile
import io
import logging
from fastapi.responses import StreamingResponse
from services.storage import storage_service
from sqlalchemy.orm import Session, joinedload
from fastapi import HTTPException, status
from models.order import Order, OrderItem, OrderStatus, OrderUpdateSchema, PaymentMethod, PaymentStatus
from models.earning import Earning
from models.photo import Photo
from services.base import BaseService
from models.photo_session import PhotoSession # Importar PhotoSession
from services.email_service import send_email
from services.cart import CartService # Importar CartService
from core.config import settings
from datetime import date

def process_earnings_for_order_item(db: Session, order_item: OrderItem, adjustment_factor: float = 1.0):
    """
    Calculates and records the earning for a photographer based on a sold OrderItem.
    This is now safe against missing photos or photographers.
    Includes an adjustment_factor to handle manual subtotal overrides.
    """
    # Ensure photo is loaded
    if not order_item.photo:
        db.refresh(order_item, attribute_names=['photo'])

    if not order_item.photo:
        print(f"WARNING: Skipping earning for OrderItem ID {order_item.id} because its associated Photo ID {order_item.photo_id} could not be found.")
        return

    # Ensure photographer is loaded
    if not order_item.photo.photographer:
        db.refresh(order_item.photo, attribute_names=['photographer'])
        
    if not order_item.photo.photographer:
        print(f"WARNING: Skipping earning for OrderItem ID {order_item.id} because the associated Photo ID {order_item.photo.id} has no photographer.")
        return

    photographer = order_item.photo.photographer
    commission_percentage = photographer.commission_percentage

    # Calculate real photos sold based on the quantity and the adjustment factor.
    # This represents the gross proportion of photos paid by the customer (Venta Real).
    real_photos_sold = float(order_item.quantity) * adjustment_factor

    # The actual monetary value for this item is exactly item_price
    item_price = (order_item.price * order_item.quantity) * adjustment_factor
    real_value_of_item = item_price

    # Monetary earning calculation
    earned_amount = real_value_of_item * (commission_percentage / 100.0)

    # Photo fraction earning calculation (this is what the photographer actually 'earns' - Ganancia Neta)
    earned_photo_fraction = real_photos_sold * (commission_percentage / 100.0)

    new_earning = Earning(
        photographer_id=photographer.id,
        order_id=order_item.order_id, # Link to the order
        order_item_id=order_item.id,
        amount=earned_amount,
        commission_applied=commission_percentage,
        earned_photo_fraction=earned_photo_fraction,
        real_photos_sold=real_photos_sold
    )
    db.add(new_earning)
    return new_earning

class OrderService(BaseService):
    def _build_order_confirmation_email_content(self, order: Order) -> tuple[str, str]:
        if not order.public_id:
            raise ValueError("Order is missing a public_id for email content generation.")

        order_page_link = f"{settings.FRONTEND_URL}/pedidos/{order.public_id}"
        
        # Determinar el nombre del cliente
        customer_name = "Cliente"
        if order.customer_email:
            customer_name = order.customer_email.split('@')[0]
        elif order.user and order.user.email:
            customer_name = order.user.email.split('@')[0]

        # Obtener el nombre del álbum (PhotoSession event_name) del primer item, si existe
        album_name = "tu compra"
        if order.items and order.items[0].photo and order.items[0].photo.session and order.items[0].photo.session.event_name:
            album_name = order.items[0].photo.session.event_name

        # Construir tabla con los items del pedido
        items_html = ""
        for item in order.items:
            photo_description = f"Foto ID: {item.photo_id}" # Fallback
            if item.photo and item.photo.filename:
                photo_description = item.photo.filename
            elif item.photo and item.photo.session and item.photo.session.event_name:
                photo_description = f"{item.photo.session.event_name} - {item.photo.filename}" # Mejor descripción si hay sesión
            
            items_html += f"<tr><td>{photo_description}</td><td style='text-align: center;'>{item.quantity}</td><td style='text-align: right;'>${item.price:.2f}</td></tr>"

        subject = f"Tus fotos de {album_name} ya están listas para descargar 📸"
        email_body = f"""
        <html>
        <head>
            <style>
                body {{ font-family: Arial, sans-serif; color: #333; line-height: 1.6; }}
                .container {{ max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #eee; border-radius: 5px; background-color: #fff; }}
                h1, h2, h3 {{ color: #000; }}
                p {{ margin-bottom: 10px; }}
                .button {{ display: inline-block; padding: 10px 20px; margin: 20px 0; background-color: #007bff; color: #ffffff !important; text-decoration: none; border-radius: 5px; font-weight: bold; }}
                .highlight {{ background-color: #f2f2f2; padding: 15px; border-radius: 5px; margin-bottom: 20px; }}
                .footer {{ font-size: 0.9em; color: #777; border-top: 1px solid #eee; padding-top: 20px; margin-top: 20px; }}
                .contact-info {{ margin-top: 15px; }}
                .contact-info a {{ color: #007bff; text-decoration: none; }}
            </style>
        </head>
        <body>
            <div class="container">
                <p>Hola {customer_name},</p>

                <p>¡Gracias por tu compra!</p>
                <p>Ya podés descargar tus fotos en máxima calidad, listas para guardar, compartir o imprimir.</p>

                <p style="text-align: center;">
                    <a href="{order_page_link}" style="display: inline-block; padding: 10px 20px; margin: 20px 0; background-color: #f9a01b; color: #ffffff; text-decoration: none; border-radius: 6px; font-weight: 500; font-size: 14px;">👉 Descargar mis fotos</a>
                </p>

                <h3>¿Qué estás recibiendo?</h3>
                <ul>
                    <li>✔ Fotos sin marcas de agua</li>
                    <li>✔ Máxima calidad</li>
                    <li>✔ Descarga inmediata</li>
                    <li>✔ Uso personal ilimitado</li>
                </ul>

                <div class="highlight">
                    <h4>📅 Importante:</h4>
                    <p>Tenés 20 días para descargar tus fotos desde este enlace.</p>
                    <p>Te recomendamos guardarlas en tu dispositivo una vez descargadas.</p>
                </div>

                <p>Estas imágenes fueron tomadas durante tu experiencia en la Patagonia.</p>
                <p>Nos encanta haber estado ahí para capturar ese momento.</p>

                <div class="contact-info">
                    <h4>¿Tuviste algún problema con la descarga?</h4>
                    <p>Escribinos y te ayudamos:</p>
                    <p>📩 <a href="mailto:somos.fotos.patagonia@gmail.com">somos.fotos.patagonia@gmail.com</a></p>
                </div>

                <p>Somos Fotos Patagonia.</p>
                <p>Si necesitás cubrir eventos deportivos, sociales o de aventura en Villa La Angostura y alrededores, no dudes en contactarnos.</p>
                <p>Tenemos la solución fotográfica y audiovisual para tu evento o experiencia.</p>

                <div class="footer">
                    <p>Un saludo,</p>
                    <p><strong>Fotos Patagonia</strong></p>
                    <p>Fotografía de eventos y experiencias turísticas<br/>Villa La Angostura</p>
                    <p>PD: Guardá este mail para acceder a tus fotos durante los próximos 20 días.</p>
                </div>
            </div>
        </body>
        </html>
        """
        return subject, email_body


    def list_all_orders(
        self,
        limit: int = 100,
        offset: int = 0,
        start_date: date | None = None,
        end_date: date | None = None,
        photographer_id: int | None = None,
    ) -> list[Order]:
        query = self.db.query(Order).options(
            joinedload(Order.user),
            joinedload(Order.items).joinedload(OrderItem.photo).joinedload(Photo.photographer),
            joinedload(Order.items).joinedload(OrderItem.photo).joinedload(Photo.session),
            joinedload(Order.discount)
        )

        if start_date:
            query = query.filter(Order.created_at >= start_date)
        if end_date:
            from datetime import timedelta
            query = query.filter(Order.created_at < end_date + timedelta(days=1))
        if photographer_id:
            query = query.join(OrderItem).join(Photo).filter(Photo.photographer_id == photographer_id)

        query = query.order_by(Order.created_at.desc())

        return query.offset(offset).limit(limit).all()

    def list_my_orders(self, user_id: int) -> list[Order]:
        return self.db.query(Order).options(
            joinedload(Order.user),
            joinedload(Order.items).joinedload(OrderItem.photo),
            joinedload(Order.discount)
        ).filter(Order.user_id == user_id).all()

    def get_order_details(self, order_id: int) -> Order:
        order = self.db.query(Order).options(
            joinedload(Order.user),
            joinedload(Order.items).joinedload(OrderItem.photo).joinedload(Photo.session),
            joinedload(Order.discount),
            joinedload(Order.earnings)
        ).filter(Order.id == order_id).first()
        if not order:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Order not found")
        return order

    def get_order_by_public_id(self, public_id: str) -> Order:
        order = self.db.query(Order).options(
            joinedload(Order.user),
            joinedload(Order.items).options(joinedload(OrderItem.photo)),
            joinedload(Order.discount)
        ).filter(Order.public_id == public_id).first()
        if not order:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Order not found")
        return order
        
    def process_earnings_for_order(self, order: Order):
        """
        Calculates and records earnings for all items in an order.
        If the order has a manual subtotal override, it calculates an adjustment factor
        to distribute the actual paid amount proportionally among all items.
        """
        # Ensure items and their photos/photographers are loaded
        order = self.db.query(Order).options(
            joinedload(Order.items).joinedload(OrderItem.photo).joinedload(Photo.photographer)
        ).filter(Order.id == order.id).first()

        if not order or not order.items:
            return

        # Calculate adjustment factor based on what the customer ACTUALLY paid (order.total)
        # versus the true original price of the photos (photo.price)
        # This prevents double-discounting issues or upside-down overrides.
        
        true_nominal_subtotal = 0.0
        for item in order.items:
            if item.format is None and item.photo and item.photo.price:
                true_nominal_subtotal += (item.photo.price * item.quantity)
            elif item.format is None:
                # Fallback if photo has no price
                true_nominal_subtotal += (item.price * item.quantity)
        
        adjustment_factor = 1.0
        
        # We use order.total (the final amount to be paid after everything)
        if true_nominal_subtotal > 0 and order.total is not None:
            adjustment_factor = order.total / true_nominal_subtotal
            
            if abs(adjustment_factor - 1.0) > 0.001:
                print(f"INFO: Applying adjustment factor of {adjustment_factor:.4f} to earnings for order {order.id} (Paid: {order.total} vs True Nominal: {true_nominal_subtotal})")

        for item in order.items:
            # Skip physical prints for digital earnings calculation if necessary, 
            # or include them if they also generate commissions. 
            # Usually only digital photos are considered 'real photos sold'.
            process_earnings_for_order_item(self.db, item, adjustment_factor=adjustment_factor)
        
        return

    def mark_order_as_paid(self, order_id: int, payment_method: PaymentMethod, external_payment_id: str | None = None) -> Order:
        """
        Marks an order as paid, processes earnings, and sends a confirmation email.
        This is the central function for confirming a payment.
        """
        order = self.get_order_details(order_id)
        if order.payment_status == PaymentStatus.PAID:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Order has already been paid."
            )

        order.payment_method = payment_method
        order.payment_status = PaymentStatus.PAID
        order.order_status = OrderStatus.PAID
        if external_payment_id:
            order.external_payment_id = external_payment_id
        
        self.process_earnings_for_order(order)

        self._save_and_refresh(order)

        # --- Vaciar el carrito asociado a la orden ---
        cart_service = CartService(self.db)
        if order.user_id:
            cart_service.empty_cart(user_id=order.user_id, guest_id=None)
            print(f"INFO: Cart for user {order.user_id} emptied after order {order.id} was paid.")
        elif order.guest_id:
            cart_service.empty_cart(guest_id=order.guest_id)
            print(f"INFO: Cart for guest {order.guest_id} emptied after order {order.id} was paid.")
        else:
            print(f"WARNING: Order {order.id} paid but no user_id or guest_id found to empty a cart.")
        
        # --- Send confirmation email ---
        email_to = None
        if order.customer_email:
            email_to = order.customer_email
            print(f"INFO: Found customer_email '{email_to}' for Order ID {order.id}. Using it as the recipient.")
        elif order.user and order.user.email:
            email_to = order.user.email
            print(f"INFO: No customer_email found for Order ID {order.id}. Falling back to user.email '{email_to}'.")

        if email_to:
            subject, email_body = self._build_order_confirmation_email_content(order)
            send_email(
                to_email=email_to,
                subject=subject,
                body=email_body,
                html=True
            )
        else:
            print(f"WARNING: Order ID {order.id} marked as paid but has no email associated (customer_email or user.email). Could not send confirmation email.")
        
        return order

    def update_order_status(self, order_id: int, new_status: OrderStatus, payment_method: PaymentMethod | None = None) -> Order:
        order = self.get_order_details(order_id)

        is_payment_confirmation = (
            new_status in [OrderStatus.PAID, OrderStatus.COMPLETED] and
            order.payment_status == PaymentStatus.PENDING
        )

        if is_payment_confirmation:
            # Siempre usa el método de pago que la orden ya tiene.
            # No se necesita ninguna validación aquí porque la orden debe tener uno.
            return self.mark_order_as_paid(order_id=order.id, payment_method=order.payment_method)
        
        # Para cualquier otro cambio de estado, simplemente actualiza el campo.
        order.order_status = new_status
        self._save_and_refresh(order)
        return order

    def edit_order(self, order_id: int, order_in: OrderUpdateSchema) -> Order:
        order = self.get_order_details(order_id)
        update_data = order_in.model_dump(exclude_unset=True)
        for field, value in update_data.items():
            setattr(order, field, value)
        self._save_and_refresh(order)
        return order

    def send_order_email(self, order_id: int, email_to: str | None = None):
        order = self.get_order_details(order_id)
        
        recipient = email_to or order.customer_email or (order.user and order.user.email)
        
        if not recipient:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="No email recipient found for this order."
            )
            
        subject, email_body = self._build_order_confirmation_email_content(order)
        
        send_email(
            to_email=recipient,
            subject=subject,
            body=email_body,
            html=True
        )
        
        return {"message": f"Email successfully sent to {recipient}"}

    def delete_order(self, order_id: int):
        # Primero, eliminar las ganancias asociadas para evitar problemas de clave externa
        self.db.query(Earning).filter(Earning.order_id == order_id).delete(synchronize_session=False)

        # Ahora, eliminar la orden
        order = self.db.query(Order).filter(Order.id == order_id).first()
        if not order:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Order not found")
        
        self.db.delete(order)
        self.db.commit()
        return {"message": "Order and associated earnings deleted successfully"}

    def generate_qr_code(self, order_id: int):
        # Business logic for generating QR code for an order
        return {"message": f"OrderService: Generate QR code for order {order_id} logic"}
    def generate_order_zip(self, public_id: str) -> StreamingResponse:
        logging.info(f"Starting ZIP generation for order: {public_id}")
        order = self.get_order_by_public_id(public_id)
        if not order.items:
            logging.error(f"Order {public_id} has no items")
            raise HTTPException(status_code=400, detail="Order has no photos to download")

        photos_dict = {}
        for item in order.items:
            if item.photo and item.photo.object_name:
                photos_dict[item.photo.id] = item.photo

        if not photos_dict:
            logging.error(f"Order {public_id} has no valid photos in DB")
            raise HTTPException(status_code=400, detail="No valid photos available in this order")

        photos = list(photos_dict.values())
        logging.info(f"Found {len(photos)} unique photos for order {public_id}")

        def iter_zip():
            zip_buffer = io.BytesIO()
            try:
                with zipfile.ZipFile(zip_buffer, 'w', zipfile.ZIP_DEFLATED) as zf:
                    for i, photo in enumerate(photos):
                        try:
                            logging.info(f"[{i+1}/{len(photos)}] Fetching {photo.object_name} from S3")
                            obj = storage_service.s3_client.get_object(
                                Bucket=storage_service.bucket_name,
                                Key=photo.object_name
                            )
                            image_bytes = obj['Body'].read()
                            
                            base_name = (photo.place or photo.description or f"foto-{photo.id}").strip()
                            safe_name = "".join(c if c.isalnum() or c in (' ', '-', '_') else '_' for c in base_name)[:100]
                            filename = f"{safe_name}_{photo.id}.jpg"
                            
                            zf.writestr(filename, image_bytes)
                            logging.info(f"Successfully added {filename} to ZIP")
                        except Exception as e:
                            logging.error(f"Error adding photo {photo.id} to ZIP: {str(e)}")
                            continue

                logging.info(f"Finished ZIP creation for {public_id}, streaming to client...")
                zip_buffer.seek(0)
                yield zip_buffer.getvalue()
            except Exception as e:
                logging.error(f"Critical error during ZIP iteration for {public_id}: {str(e)}")
            finally:
                zip_buffer.close()

        album_name = "fotos"
        if order.items and order.items[0].photo and order.items[0].photo.session:
            album_name = order.items[0].photo.session.event_name or "fotos"
            
        safe_album = "".join(c if c.isalnum() else '_' for c in album_name)
        zip_filename = f"{safe_album}_pedido_{order.id}.zip"

        return StreamingResponse(
            iter_zip(),
            media_type="application/zip",
            headers={
                "Content-Disposition": f"attachment; filename={zip_filename}",
                "Access-Control-Expose-Headers": "Content-Disposition"
            }
        )
