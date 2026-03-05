from pydantic import BaseModel
from typing import List, Optional
from enum import Enum
from datetime import datetime, timezone, timedelta
import uuid
from sqlalchemy import Column, Integer, String, Float, ForeignKey, Enum as SQLAlchemyEnum, DateTime
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import relationship
from db.base import Base
from .user import UserSchema
from .photo import PhotoSchema, PublicPhotoSchema
from .discount import DiscountSchema

class PaymentMethod(str, Enum):
    MP = "mp"
    EFECTIVO = "efectivo"
    TRANSFERENCIA = "transferencia"
    POSNET = "posnet"

class PaymentStatus(str, Enum):
    PENDING = "pending"
    PAID = "paid"
    FAILED = "failed"
    REFUNDED = "refunded"

class OrderStatus(str, Enum):
    PENDING = "pending" # La orden ha sido creada pero no pagada
    PAID = "paid" # La orden ha sido pagada pero no procesada/enviada
    COMPLETED = "completed" # La orden ha sido pagada y completada (ej. fotos descargadas)
    SHIPPED = "shipped" # Para productos físicos, si aplica
    REJECTED = "rejected" # El pago fue rechazado o la orden cancelada

# Pydantic models (Schemas)
class OrderItemBaseSchema(BaseModel):
    price: float
    quantity: int = 1

class OrderItemCreateSchema(OrderItemBaseSchema):
    photo_id: int
    format: Optional[str] = None

class OrderItemSchema(OrderItemBaseSchema):
    id: int
    photo: Optional[PhotoSchema] = None
    format: Optional[str] = None

    class Config:
        from_attributes = True

class PublicOrderItemSchema(OrderItemBaseSchema):
    id: int
    photo: Optional[PublicPhotoSchema] = None
    format: Optional[str] = None

    class Config:
        from_attributes = True

class OrderBaseSchema(BaseModel):
    customer_email: Optional[str] = None
    subtotal: float = 0.0
    total: float
    payment_method: PaymentMethod
    payment_status: PaymentStatus = PaymentStatus.PENDING
    order_status: OrderStatus = OrderStatus.PENDING
    external_payment_id: Optional[str] = None

class OrderCreateSchema(OrderBaseSchema):
    user_id: Optional[int] = None
    guest_id: Optional[str] = None
    discount_id: Optional[int] = None
    items: List[OrderItemCreateSchema]

class OrderUpdateSchema(OrderBaseSchema):
    customer_email: Optional[str] = None
    subtotal: Optional[float] = None
    total: Optional[float] = None
    payment_method: Optional[PaymentMethod] = None
    payment_status: Optional[PaymentStatus] = None
    order_status: Optional[OrderStatus] = None
    external_payment_id: Optional[str] = None
    user_id: Optional[int] = None
    discount_id: Optional[int] = None
    guest_id: Optional[str] = None

class OrderSchema(OrderBaseSchema):
    id: int
    public_id: uuid.UUID
    created_at: Optional[datetime] = None
    user: Optional[UserSchema] = None # User can be optional
    items: List[OrderItemSchema] = []
    discount: Optional[DiscountSchema] = None
    guest_id: Optional[str] = None

    class Config:
        from_attributes = True

class PublicOrderSchema(OrderBaseSchema):
    id: int
    public_id: uuid.UUID
    created_at: Optional[datetime] = None
    user: Optional[UserSchema] = None
    items: List[PublicOrderItemSchema] = []
    discount: Optional[DiscountSchema] = None

    class Config:
        from_attributes = True

# SQLAlchemy models
class Order(Base):
    __tablename__ = "orders"

    id = Column(Integer, primary_key=True, index=True)
    public_id = Column(UUID(as_uuid=True), default=uuid.uuid4, index=True, unique=True, nullable=False)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=True) # Allow user_id to be null
    guest_id = Column(String, nullable=True, index=True)
    customer_email = Column(String(100), nullable=True)
    discount_id = Column(Integer, ForeignKey("discounts.id"), nullable=True)
    subtotal = Column(Float, nullable=False, default=0.0)
    total = Column(Float, nullable=False)
    payment_method = Column(SQLAlchemyEnum(PaymentMethod), nullable=False)
    payment_status = Column(SQLAlchemyEnum(PaymentStatus), default=PaymentStatus.PENDING, nullable=False)
    order_status = Column(SQLAlchemyEnum(OrderStatus), default=OrderStatus.PENDING, nullable=False)
    external_payment_id = Column(String, nullable=True)
    created_at = Column(DateTime, default=lambda: datetime.now(timezone(timedelta(hours=-3))), nullable=True)

    user = relationship("User", back_populates="orders")
    items = relationship("OrderItem", back_populates="order")
    discount = relationship("Discount", back_populates="orders")
    earnings = relationship("Earning", back_populates="order")

class OrderItem(Base):
    __tablename__ = "order_items"

    id = Column(Integer, primary_key=True, index=True)
    order_id = Column(Integer, ForeignKey("orders.id"))
    photo_id = Column(Integer, ForeignKey("photos.id"))
    price = Column(Float, nullable=False)
    quantity = Column(Integer, default=1)
    format = Column(String, nullable=True)

    order = relationship("Order", back_populates="items")
    photo = relationship("Photo", back_populates="order_items")

# TODO(print-metadata): agregar columna JSON opcional para persistir datos de impresión
# (formato, packSize, channel) sin romper órdenes existentes.