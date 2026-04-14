from pydantic import BaseModel, Field
from typing import List, Dict

class AdminCommissionSummary(BaseModel):
    """Summary of commissions for a single photographer."""
    photographer_id: int
    photographer_name: str
    total_commission: float
    total_gross_sales: float # Gross sales for this photographer

class AdminDashboardSchema(BaseModel):
    """Global summary for the admin dashboard."""
    total_photos: int
    total_photos_sold: int
    total_real_photos_sold: float
    total_orders: int
    total_gross_revenue: float
    total_commissions: float # Sum of all commissions paid out
    total_net_revenue: float # total_gross_revenue - total_commissions
    orders_by_payment_method: Dict[str, int] = Field(default_factory=dict)
    commissions_by_photographer: List[AdminCommissionSummary]

class RecentSessionInfo(BaseModel):
    """Detailed information about a recent photo session upload."""
    id: int
    photographer_name: str
    start_time: str
    total_photos: int
    status: str

    class Config:
        orm_mode = True

class RecentSession(BaseModel):
    """Schema for a single recent session entry in the dashboard."""
    id: int
    photographer_name: str
    start_time: str
    photo_count: int
    status: str  # e.g., "Completed", "Partial", "Failed"

    class Config:
        orm_mode = True
