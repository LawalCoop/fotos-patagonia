from pydantic import BaseModel, root_validator
from sqlalchemy import Column, Integer, String, Float, ForeignKey, Text
from sqlalchemy.orm import relationship
from typing import List, Optional
from db.base import Base
from .photographer import PhotographerSchema
from .tag import TagSchema
from services.storage import storage_service

# Pydantic models (Schemas)
class PhotoBaseSchema(BaseModel):
    filename: str
    description: Optional[str] = None
    price: float
    object_name: str
    session_id: int | None

class PhotoCreateSchema(PhotoBaseSchema):
    photographer_id: int
    session_id: int

class PhotoUpdateSchema(BaseModel):
    filename: Optional[str] = None
    description: Optional[str] = None
    price: Optional[float] = None

class PhotoInDBBaseSchema(PhotoBaseSchema):
    id: int
    photographer: PhotographerSchema
    session_id: int
    album_id: Optional[int] = None   # 👈 NUEVO
    tags: List[TagSchema] = []

    class Config:
        from_attributes = True

class PhotoSchema(PhotoInDBBaseSchema):
    @root_validator(pre=True)
    def inject_album_id(cls, values):
        # Caso 1: values es un dict (ya serializado)
        if isinstance(values, dict):
            return values

        # Caso 2: values es el modelo SQLAlchemy Photo
        session = getattr(values, "session", None)
        if session is not None:
            album_id = getattr(session, "album_id", None)
            if album_id is not None:
                setattr(values, "album_id", album_id)

        return values


class PublicPhotoSchema(PhotoSchema):
    url: Optional[str] = None
    watermark_url: Optional[str] = None

    @root_validator(pre=True)
    def generate_urls(cls, values):
        # El objeto 'values' es una instancia del modelo Photo de SQLAlchemy.
        # Accedemos a sus atributos directamente.
        object_name = getattr(values, 'object_name', None)
        if object_name:
            # TODO: Cuando haya marcas de agua, generar una URL diferente para watermark_url
            # Por ahora, ambos apuntan al original para que la app no se rompa.
            url = storage_service.generate_presigned_get_url(object_name)
            setattr(values, 'url', url)
            setattr(values, 'watermark_url', url) # Apunta al mismo por ahora
        return values

# SQLAlchemy model
class Photo(Base):
    __tablename__ = "photos"

    id = Column(Integer, primary_key=True, index=True)
    filename = Column(String(255), nullable=False)
    description = Column(String(255))
    price = Column(Float, nullable=False)
    object_name = Column(Text, nullable=False)
    content_hash = Column(String(256), unique=True, index=True, nullable=True)
    photographer_id = Column(Integer, ForeignKey("photographers.id"))
    session_id = Column(Integer, ForeignKey("photo_sessions.id"))

    photographer = relationship("Photographer", back_populates="photos")
    session = relationship("PhotoSession", back_populates="photos")
    cart_items = relationship("CartItem", back_populates="photo")
    order_items = relationship("OrderItem", back_populates="photo")
    tags = relationship("Tag", secondary="photo_tags", back_populates="photos")

# Import schemas for forward references and rebuild
from .photo_session import PhotoSessionSchema
PhotoSchema.model_rebuild()
PublicPhotoSchema.model_rebuild()
