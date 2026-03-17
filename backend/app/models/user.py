from pydantic import BaseModel, EmailStr
from sqlalchemy import Column, Integer, String, Boolean, ForeignKey
from sqlalchemy.orm import relationship
from db.base import Base
from models.role import RoleSchema
from models.photographer import PhotographerSchema # Added import
from typing import Optional

# Pydantic models (Schemas)
class UserBaseSchema(BaseModel):
    email: EmailStr
    is_active: bool = True

class UserCreateSchema(UserBaseSchema):
    password: str
    role_id: int

class UserUpdateSchema(UserBaseSchema):
    password: Optional[str] = None
    role_id: Optional[int] = None

class ChangePasswordSchema(BaseModel):
    current_password: str
    new_password: str

class AdminChangePasswordSchema(BaseModel):
    new_password: str

class UserInDBBaseSchema(UserBaseSchema):
    id: int
    role: RoleSchema

    class Config:
        from_attributes = True

class UserSchema(UserInDBBaseSchema):
    photographer: Optional[PhotographerSchema] = None # Added photographer field

class UserInDBSchema(UserInDBBaseSchema):
    hashed_password: str

# SQLAlchemy model
class User(Base):
    __tablename__ = "users"

    id = Column(Integer, primary_key=True, index=True)
    email = Column(String(100), unique=True, index=True, nullable=False)
    hashed_password = Column(String(255), nullable=False)
    is_active = Column(Boolean, default=True)
    role_id = Column(Integer, ForeignKey("roles.id"))

    role = relationship("Role", lazy="joined")
    photographer = relationship("Photographer", back_populates="user", uselist=False)
    carts = relationship("Cart", back_populates="user")
    orders = relationship("Order", back_populates="user")