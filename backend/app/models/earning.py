import uuid
from sqlalchemy import Column, Integer, Float, ForeignKey, DateTime
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import relationship
from db.base import Base
from datetime import datetime
from pydantic import BaseModel

class EarningSchema(BaseModel):
    id: int
    photographer_id: int
    order_id: int
    order_item_id: int
    amount: float
    commission_applied: float
    earned_photo_fraction: float # Nuevo campo
    real_photos_sold: float = 0.0 # Fotos reales vendidas calculadas
    created_at: datetime
    photo_filename: str | None = None

    class Config:
        from_attributes = True


class Earning(Base):
    __tablename__ = "earnings"

    id = Column(Integer, primary_key=True, index=True)
    photographer_id = Column(Integer, ForeignKey("photographers.id"), nullable=False)
    order_item_id = Column(Integer, ForeignKey("order_items.id"), nullable=False)
    order_id = Column(Integer, ForeignKey("orders.id"), nullable=False) # Add this foreign key
    amount = Column(Float, nullable=False)
    commission_applied = Column(Float, nullable=False) # Porcentaje de comisión usado
    earned_photo_fraction = Column(Float, nullable=False) # Nuevo campo
    real_photos_sold = Column(Float, nullable=False, default=0.0) # Fotos reales vendidas
    created_at = Column(DateTime, default=datetime.utcnow)

    photographer = relationship("Photographer", back_populates="earnings")
    order_item = relationship("OrderItem")
    order = relationship("Order", back_populates="earnings") # Add this relationship