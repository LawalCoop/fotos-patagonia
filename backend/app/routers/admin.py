from fastapi import APIRouter, Depends
from typing import List
from sqlalchemy.orm import Session

from deps import get_db, PermissionChecker
from services.admin import AdminService
from schemas.admin import AdminDashboardSchema, RecentSessionInfo
from schemas.statistics import PhotoSaleStat
from models.user import User
from core.permissions import Permissions
from fastapi import APIRouter, Depends, HTTPException

from services.photographers import PhotographerService, EarningsSummarySchema
from datetime import date

router = APIRouter(
    prefix="/admin",
    tags=["Admin"],
    dependencies=[Depends(PermissionChecker([Permissions.VIEW_ANY_EARNINGS]))]
)

@router.get("/earnings-report", response_model=List[EarningsSummarySchema])
def get_earnings_report(
    db: Session = Depends(get_db),
    start_date: date | None = None,
    end_date: date | None = None,
    current_user: User = Depends(PermissionChecker([Permissions.VIEW_ANY_EARNINGS]))
):
    """
    Provides a detailed earnings report for each photographer, including total earnings,
    photos sold, and detailed sales information. Can be filtered by a date range.
    """
    return PhotographerService(db).get_admin_earnings_report(
        current_user=current_user,
        start_date=start_date,
        end_date=end_date
    )

@router.get("/dashboard", response_model=AdminDashboardSchema)
def get_admin_dashboard(
    db: Session = Depends(get_db),
    current_user: User = Depends(PermissionChecker([Permissions.VIEW_ANY_EARNINGS])) # Redundant but explicit
):
    """
    Provides a global summary of all platform activity, including sales,
    orders, and commissions. Restricted to users with sufficient privileges.
    """
    return AdminService(db).get_dashboard_summary()

@router.get("/dashboard/recent-sessions", response_model=List[RecentSessionInfo])
def get_recent_sessions_report(
    db: Session = Depends(get_db),
    current_user: User = Depends(PermissionChecker([Permissions.VIEW_ANY_EARNINGS]))
):
    """
    Provides a summary of the last 5 photo session uploads.
    """
    return AdminService(db).get_recent_sessions()

@router.get("/stats/photographer/{photographer_id}", response_model=List[PhotoSaleStat])
def get_photographer_stats(
    photographer_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(PermissionChecker([]))
):
    """
    Provides detailed photo sales statistics for a specific photographer.
    Only accessible by the photographer themselves or an admin.
    """
    # Check if the current user is an admin or the photographer themselves
    is_admin = Permissions.VIEW_ANY_EARNINGS in [p.name for p in current_user.role.permissions]
    
    if not is_admin and current_user.photographer_id != photographer_id:
        raise HTTPException(status_code=403, detail="Not authorized to view these statistics")

    return AdminService(db).get_photo_sales_statistics(photographer_id)

