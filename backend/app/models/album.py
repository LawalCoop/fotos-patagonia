from pydantic import BaseModel, field_validator
from sqlalchemy import Column, Integer, String
from sqlalchemy.orm import relationship
from typing import List, Optional
from db.base import Base
from .tag import TagSchema
from .combo import ComboSchema, album_combos

# Pydantic models (Schemas)
class AlbumBaseSchema(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None
    session_ids: Optional[List[int]] = None
    tag_ids: Optional[List[int]] = None
    combo_ids: Optional[List[int]] = None
    default_photo_price: Optional[int] = None

class AlbumCreateSchema(AlbumBaseSchema):
    pass
class AlbumUpdateSchema(AlbumBaseSchema):
    pass

class AlbumInDBBaseSchema(AlbumBaseSchema):
    id: int

    class Config:
        from_attributes = True

class AlbumInSessionSchema(AlbumInDBBaseSchema):
    pass

class AlbumSchema(AlbumInDBBaseSchema):
    cover_photo_url: Optional[str] = None
    sessions: list['PhotoSessionSchema'] = []
    tags: List[TagSchema] = []
    combos: List[ComboSchema] = []

    @field_validator('sessions', mode='before')
    @classmethod
    def filter_sessions_with_photos(cls, v):
        if not v:
            return []
        # Filtra la lista de sesiones, manteniendo solo aquellas que tienen fotos.
        return [session for session in v if session.photos]

# SQLAlchemy model
class Album(Base):
    __tablename__ = "albums"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String(100), index=True, nullable=False)
    description = Column(String(255))
    default_photo_price = Column(Integer, nullable=True)

    sessions = relationship("PhotoSession", back_populates="album")
    tags = relationship("Tag", secondary="album_tags", back_populates="albums")
    combos = relationship("Combo", secondary=album_combos, back_populates="albums")

# Import schemas for forward references and rebuild
from .photo_session import PhotoSessionSchema
AlbumSchema.model_rebuild()