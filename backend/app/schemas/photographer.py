from pydantic import BaseModel
from typing import List

from datetime import datetime

class PhotoEarningSummary(BaseModel):
    photo_id: int
    photo_filename: str
    times_sold: int
    real_photos_sold: float = 0.0
    earned_photo_fraction: float = 0.0
    total_earnings: float

    class Config:
        from_attributes = True

class OrderEarningSummary(BaseModel):
    order_id: int
    created_at: datetime
    total_photos: int
    order_total_photos: int = 0
    percentage_in_order: float = 0.0
    real_photos_sold: float = 0.0
    earned_photo_fraction: float = 0.0
    total_earnings: float

    class Config:
        from_attributes = True
