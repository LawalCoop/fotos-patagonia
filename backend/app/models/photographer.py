from pydantic import BaseModel, EmailStr
from sqlalchemy import Column, Integer, String, Float, ForeignKey
from sqlalchemy.orm import relationship
from db.base import Base
from typing import Optional

# Pydantic models (Schemas)
class PhotographerBaseSchema(BaseModel):
    name: str
    commission_percentage: float
    contact_info: str

class PhotographerCreateSchema(PhotographerBaseSchema):
    email: EmailStr
    password: str

class PhotographerUpdateSchema(PhotographerBaseSchema):
    contact_info: Optional[str] = None

class PhotographerInDBBaseSchema(PhotographerBaseSchema):
    id: int
    user_id: Optional[int] = None

    class Config:
        from_attributes = True

class PhotographerSchema(PhotographerInDBBaseSchema):
    pass

# SQLAlchemy model
class Photographer(Base):
    __tablename__ = "photographers"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=True, unique=True)
    name = Column(String(100), index=True, nullable=False)
    commission_percentage = Column(Float, nullable=False)
    contact_info = Column(String(255), nullable=True)

    user = relationship("User", back_populates="photographer")
    photos = relationship("Photo", back_populates="photographer")
    earnings = relationship("Earning", back_populates="photographer", passive_deletes=True)
    photo_sessions = relationship("PhotoSession", back_populates="photographer")
