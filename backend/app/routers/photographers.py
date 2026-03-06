from fastapi import APIRouter, Depends, status
from sqlalchemy.orm import Session
from deps import get_db, PermissionChecker
from services.photographers import PhotographerService
from models.photographer import PhotographerCreateSchema, PhotographerSchema, PhotographerUpdateSchema
from core.permissions import Permissions
from models.user import User

router = APIRouter(
    prefix="/photographers",
    tags=["photographers"],
)

@router.get("/")
def list_photographers(
    db: Session = Depends(get_db)
):
    return PhotographerService(db).list_photographers()

@router.post("/", response_model=PhotographerSchema, status_code=status.HTTP_201_CREATED)
def create_photographer(
    ph_in: PhotographerCreateSchema,
    db: Session = Depends(get_db),
    current_user: User = Depends(PermissionChecker([Permissions.CREATE_PHOTOGRAPHER]))
):
    ph = PhotographerService(db).create_photographer(ph_in)
    return ph

@router.get("/{photographer_id}")
def get_photographer(
    photographer_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(PermissionChecker([Permissions.LIST_PHOTOGRAPHERS]))
):
    return PhotographerService(db).get_photographer(photographer_id)

@router.put("/{photographer_id}", response_model=PhotographerSchema)
def update_photographer(
    photographer_id: int,
    photographer_in: PhotographerUpdateSchema,
    db: Session = Depends(get_db),
    current_user: User = Depends(PermissionChecker([Permissions.EDIT_PHOTOGRAPHER]))
):
    return PhotographerService(db).update_photographer(photographer_id, photographer_in)

@router.delete("/{photographer_id}", status_code=status.HTTP_200_OK)
def inactivate_photographer(
    photographer_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(PermissionChecker([Permissions.DELETE_PHOTOGRAPHER]))
):
    return PhotographerService(db).inactivate_photographer(photographer_id)

# Earnings Endpoints

from datetime import date
from typing import List
from models.earning import EarningSchema
from schemas.photographer import PhotoEarningSummary, OrderEarningSummary
from schemas.pagination import PaginatedResponse
from services.photographers import EarningsSummarySchema

@router.get("/{photographer_id}/earnings", response_model=PaginatedResponse[EarningSchema])
def get_photographer_earnings(
    photographer_id: int,
    skip: int = 0,
    limit: int = 15,
    start_date: date | None = None,
    end_date: date | None = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(PermissionChecker(
        [Permissions.VIEW_OWN_EARNINGS, Permissions.VIEW_ANY_EARNINGS], require_all=False
    ))
):
    return PhotographerService(db).get_photographer_earnings(
        photographer_id=photographer_id,
        current_user=current_user,
        skip=skip,
        limit=limit,
        start_date=start_date,
        end_date=end_date
    )

@router.get("/{photographer_id}/earnings/summary_by_order", response_model=PaginatedResponse[OrderEarningSummary])
def get_earnings_summary_by_order(
    photographer_id: int,
    skip: int = 0,
    limit: int = 15,
    start_date: date | None = None,
    end_date: date | None = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(PermissionChecker(
        [Permissions.VIEW_OWN_EARNINGS, Permissions.VIEW_ANY_EARNINGS], require_all=False
    ))
):
    return PhotographerService(db).get_earnings_summary_by_order(
        photographer_id=photographer_id,
        current_user=current_user,
        skip=skip,
        limit=limit,
        start_date=start_date,
        end_date=end_date
    )

@router.get("/{photographer_id}/earnings/summary", response_model=EarningsSummarySchema)
def get_photographer_earnings_summary(
    photographer_id: int,
    start_date: date | None = None,
    end_date: date | None = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(PermissionChecker(
        [Permissions.VIEW_OWN_EARNINGS, Permissions.VIEW_ANY_EARNINGS], require_all=False
    ))
):
    return PhotographerService(db).get_photographer_earnings_summary(
        photographer_id=photographer_id,
        current_user=current_user,
        start_date=start_date,
        end_date=end_date
    )

@router.get("/{photographer_id}/earnings/summary_by_photo", response_model=PaginatedResponse[PhotoEarningSummary])
def get_earnings_summary_by_photo(
    photographer_id: int,
    skip: int = 0,
    limit: int = 15,
    db: Session = Depends(get_db),
    current_user: User = Depends(PermissionChecker(
        [Permissions.VIEW_OWN_EARNINGS, Permissions.VIEW_ANY_EARNINGS], require_all=False
    ))
):
    return PhotographerService(db).get_earnings_summary_by_photo(
        photographer_id=photographer_id,
        current_user=current_user,
        skip=skip,
        limit=limit
    )
