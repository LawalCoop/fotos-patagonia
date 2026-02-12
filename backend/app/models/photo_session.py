from pydantic import BaseModel
from sqlalchemy import Column, Integer, String, DateTime, ForeignKey
from sqlalchemy.orm import relationship
from typing import Optional
from db.base import Base
from datetime import datetime
from models.photographer import PhotographerSchema

# Pydantic models (Schemas)
class PhotoSessionBaseSchema(BaseModel):
    event_name: str
    description: Optional[str] = None
    event_date: datetime
    location: str

class PhotoSessionCreateSchema(PhotoSessionBaseSchema):
    photographer_id: int
    album_id: Optional[int] = None

class PhotoSessionUpdateSchema(PhotoSessionBaseSchema):
    event_date: Optional[datetime] = None
    photographer_id: Optional[int] = None
    album_id: Optional[int] = None

class PhotoSessionInDBBaseSchema(PhotoSessionBaseSchema):
    id: int
    photographer_id: int
    photographer: PhotographerSchema
    album: Optional['AlbumInSessionSchema'] = None

    class Config:
        from_attributes = True

class PhotoSessionSchema(PhotoSessionInDBBaseSchema):
    photos: list['PhotoSchema'] = []

# SQLAlchemy model
class PhotoSession(Base):
    __tablename__ = "photo_sessions"

    id = Column(Integer, primary_key=True, index=True)
    event_name = Column(String(100), index=True, nullable=False)
    description = Column(String(255))
    event_date = Column(DateTime, nullable=False)
    location = Column(String(255), nullable=False)
    photographer_id = Column(Integer, ForeignKey("photographers.id"))
    album_id = Column(Integer, ForeignKey("albums.id"), nullable=True)

    photographer = relationship("Photographer", back_populates="photo_sessions")
    album = relationship("Album", back_populates="sessions")
    photos = relationship("Photo", back_populates="session")

# Import schemas for forward references and rebuild
from .album import AlbumInSessionSchema
from .photo import PhotoSchema
PhotoSessionSchema.model_rebuild()