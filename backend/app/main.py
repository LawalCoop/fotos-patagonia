from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from db.base import Base
from db.session import engine

from models.user import User
from models.role import Role
from models.photographer import Photographer
from models.photo_session import PhotoSession
from models.discount import Discount
from models.album import Album, AlbumSchema, AlbumInSessionSchema
from models.photo import Photo, PhotoSchema
from models.photo_session import PhotoSession, PhotoSessionSchema
from models.cart import Cart, CartItem
from models.saved_cart import SavedCart
from models.order import Order, OrderItem

from routers import auth, users, roles, photographers, sessions, albums, photos, cart, discounts, checkout, orders, saved_carts, storage, testing, tags, combos, earnings, admin, contact

from core.config import settings

# Rebuild Pydantic models to resolve forward references
AlbumSchema.model_rebuild()
PhotoSessionSchema.model_rebuild()
PhotoSchema.model_rebuild()

# Create database tables
# This will create tables for all models that inherit from Base and are imported.
Base.metadata.create_all(bind=engine)

app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.storage_allowed_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth.router)
app.include_router(users.router)
app.include_router(roles.router)
app.include_router(photographers.router)
app.include_router(sessions.router)
app.include_router(albums.router)
app.include_router(photos.router)
app.include_router(cart.router)
app.include_router(discounts.router)
app.include_router(checkout.router)
app.include_router(orders.router)
app.include_router(saved_carts.router)
app.include_router(storage.router)
app.include_router(testing.router)
app.include_router(tags.router)
app.include_router(combos.router)
app.include_router(earnings.router)
app.include_router(admin.router)
app.include_router(contact.router)

@app.get("/")
def read_root():
    return {"healthcheck": "sonreeí:)"}