from sqlalchemy.orm import Session, joinedload
from sqlalchemy import func
from services.base import BaseService
from fastapi import HTTPException, status
from models.photographer import Photographer, PhotographerCreateSchema, PhotographerUpdateSchema
from models.earning import Earning, EarningSchema
from models.user import User
from core.permissions import Permissions
from datetime import date, timedelta
from typing import List
from pydantic import BaseModel
from schemas.pagination import PaginatedResponse
from schemas.photographer import PhotoEarningSummary

from models.order import OrderItem
from models.photo import Photo
from models.photo_session import PhotoSession

class PhotoSaleDetailSchema(BaseModel):
    photo_id: int
    photo_url: str
    album_name: str
    times_sold: int
    total_earnings: float

class EarningsSummarySchema(BaseModel):
    total_earnings: float
    total_earned_photo_fraction: float
    total_orders_involved: int
    total_photos_sold: int
    photographer_id: int
    start_date: date | None
    end_date: date | None
    photo_sales_details: List[PhotoSaleDetailSchema]

from models.user import User, UserCreateSchema
from services.users import UserService
from models.role import Role

class PhotographerService(BaseService):
    def __init__(self, db: Session):
        self.db = db
    ############################################################################
    def list_photographers(self):
        photographers = self.db.query(Photographer).all()
        return photographers
    ############################################################################
    def create_photographer(self, ph_in: PhotographerCreateSchema):
        user_service = UserService(self.db)
        
        # 1. Check if user already exists
        existing_user = user_service.get_user_by_email(ph_in.email)
        if existing_user:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="A user with this email already exists."
            )
            
        # 2. Get the "Photographer" role
        photographer_role = self.db.query(Role).filter(Role.name == "Photographer").first()
        if not photographer_role:
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail="Photographer role not found. Please initialize database roles."
            )
            
        # 3. Create the User
        user_in = UserCreateSchema(
            email=ph_in.email,
            password=ph_in.password,
            role_id=photographer_role.id,
            is_active=True
        )
        new_user = user_service.create_user(user_in)
        
        # 4. Create the Photographer, excluding user-specific fields
        photographer_data = ph_in.model_dump(exclude={"email", "password"})
        new_ph = Photographer(
            **photographer_data,
            user_id=new_user.id
        )
        
        return self._save_and_refresh(new_ph)
    ############################################################################
    def get_photographer(self, ph_id: int):
        ph = self.db.query(Photographer).filter(Photographer.id==ph_id).first()
        if not ph:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Photographer not found"
            )
        return ph
    ############################################################################
    def update_photographer(self, ph_id: int, ph_in: PhotographerUpdateSchema):
        ph = self.db.query(Photographer).filter(Photographer.id==ph_id).first()

        if not ph:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Photographer not found"
            )
        
        updated_data = ph_in.model_dump(exclude_unset=True)
        
        for field, value in updated_data.items():
            setattr(ph, field, value)
        
        return self._save_and_refresh(ph)
    ############################################################################
    def delete_photographer(self, ph_id: int):
        ph = self.db.query(Photographer).filter(Photographer.id==ph_id).first()

        if not ph:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Photographer not found"
            )

        # Check for associated photo sessions
        if self.db.query(PhotoSession).filter(PhotoSession.photographer_id == ph_id).first():
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Cannot delete photographer: still has associated photo sessions."
            )

        # Check for associated earnings
        if self.db.query(Earning).filter(Earning.photographer_id == ph_id).first():
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Cannot delete photographer: still has associated earnings."
            )
        
        return self._delete_and_refresh(ph)

    ############################################################################
    # Earnings Methods
    ############################################################################

    def _check_earnings_permission(self, photographer_id: int, current_user: User):
        """Helper to check if a user can view earnings for a specific photographer."""
        # Normalizar permisos (pueden venir vacíos si el rol no tiene relaciones cargadas)
        user_permissions = {p.name for p in (current_user.role.permissions or [])}

        # El permiso FULL_ACCESS habilita ver cualquier earning
        has_full_access = Permissions.FULL_ACCESS.value in user_permissions
        can_view_any = Permissions.VIEW_ANY_EARNINGS.value in user_permissions
        can_view_own = Permissions.VIEW_OWN_EARNINGS.value in user_permissions

        if has_full_access or can_view_any:
            return

        if not can_view_own or not current_user.photographer or photographer_id != current_user.photographer.id:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="You do not have permission to view these earnings."
            )

    def get_photographer_earnings(
        self,
        photographer_id: int,
        current_user: User,
        skip: int = 0,
        limit: int = 15,
        start_date: date | None = None,
        end_date: date | None = None
    ) -> PaginatedResponse[EarningSchema]:
        """
        Returns a paginated list of earnings for a photographer within a date range.
        """
        self._check_earnings_permission(photographer_id, current_user)

        query = self.db.query(Earning).options(
            joinedload(Earning.order_item).joinedload(OrderItem.photo)
        ).filter(Earning.photographer_id == photographer_id)

        if start_date:
            query = query.filter(Earning.created_at >= start_date)
        if end_date:
            query = query.filter(Earning.created_at < end_date + timedelta(days=1))

        total = query.count()
        earnings = query.order_by(Earning.created_at.desc()).offset(skip).limit(limit).all()

        result_schemas = []
        for earning in earnings:
            schema = EarningSchema.from_orm(earning)
            if earning.order_item and earning.order_item.photo:
                schema.photo_filename = earning.order_item.photo.filename
            result_schemas.append(schema)

        return PaginatedResponse(total=total, items=result_schemas)

    def get_earnings_summary_by_photo(self, photographer_id: int, current_user: User, skip: int = 0, limit: int = 15) -> PaginatedResponse[PhotoEarningSummary]:
        """
        Returns a paginated summary of earnings grouped by photo.
        """
        self._check_earnings_permission(photographer_id, current_user)

        summary_query = self.db.query(
            Photo.id.label("photo_id"),
            Photo.filename.label("photo_filename"),
            func.sum(OrderItem.quantity).label("times_sold"),
            func.sum(Earning.amount).label("total_earnings")
        ).select_from(Earning)\
         .join(Earning.order_item)\
         .join(OrderItem.photo)\
         .filter(Earning.photographer_id == photographer_id)\
         .group_by(Photo.id, Photo.filename)

        total = summary_query.count()
        results = summary_query.order_by(func.sum(Earning.amount).desc()).offset(skip).limit(limit).all()

        return PaginatedResponse(total=total, items=results)

    def get_photographer_earnings_summary(
        self,
        photographer_id: int,
        current_user: User,
        start_date: date | None = None,
        end_date: date | None = None
    ) -> EarningsSummarySchema:
        """
        Returns a summary of earnings for a photographer within a date range,
        including details for each photo sold.
        """
        self._check_earnings_permission(photographer_id, current_user)

        # Base query for date filtering
        base_query = self.db.query(Earning).filter(Earning.photographer_id == photographer_id)
        if start_date:
            base_query = base_query.filter(Earning.created_at >= start_date)
        if end_date:
            base_query = base_query.filter(Earning.created_at < end_date + timedelta(days=1))
        
        # Subquery for date-filtered earnings
        earnings_subquery = base_query.subquery()

        # Query for overall summary totals
        summary_query = self.db.query(
            func.sum(earnings_subquery.c.amount).label("total_amount"),
            func.sum(earnings_subquery.c.earned_photo_fraction).label("total_earned_photo_fraction"),
            func.count(earnings_subquery.c.order_id.distinct()).label("total_orders_involved")
        )
        summary = summary_query.first()
        
        # Query for total photos sold (sum of quantities)
        total_photos_sold_query = self.db.query(func.sum(OrderItem.quantity))\
            .join(earnings_subquery, OrderItem.id == earnings_subquery.c.order_item_id)
        total_photos_sold = total_photos_sold_query.scalar() or 0

        # Query for detailed photo sales
        photo_details_query = self.db.query(
            Photo.id.label("photo_id"),
            Photo.object_name.label("photo_object_name"),
            PhotoSession.event_name.label("album_name"),
            func.sum(OrderItem.quantity).label("times_sold"),
            func.sum(earnings_subquery.c.amount).label("total_earnings")
        ).join(earnings_subquery, OrderItem.id == earnings_subquery.c.order_item_id)\
         .join(Photo, OrderItem.photo_id == Photo.id)\
         .join(PhotoSession, Photo.session_id == PhotoSession.id)\
         .group_by(Photo.id, Photo.object_name, PhotoSession.event_name)\
         .order_by(func.sum(earnings_subquery.c.amount).desc())

        photo_sales_details = photo_details_query.all()

        return EarningsSummarySchema(
            total_earnings=summary.total_amount or 0,
            total_earned_photo_fraction=summary.total_earned_photo_fraction or 0,
            total_orders_involved=summary.total_orders_involved or 0,
            total_photos_sold=total_photos_sold,
            photographer_id=photographer_id,
            start_date=start_date,
            end_date=end_date,
            photo_sales_details=[
                PhotoSaleDetailSchema(
                    photo_id=item.photo_id,
                    photo_url=item.photo_object_name,
                    album_name=item.album_name,
                    times_sold=item.times_sold,
                    total_earnings=item.total_earnings
                ) for item in photo_sales_details
            ]
        )

    def get_all_earnings_summaries(
        self,
        start_date: date | None = None,
        end_date: date | None = None,
    ) -> List[dict]:
        """
        Returns a summary of total earnings for every photographer, optionally filtered by date.
        """
        query = self.db.query(
            Photographer.id,
            Photographer.name,
            func.sum(Earning.amount).label("total_earnings")
        ).join(Earning, Earning.photographer_id == Photographer.id)

        if start_date:
            query = query.filter(Earning.created_at >= start_date)
        if end_date:
            query = query.filter(Earning.created_at < end_date + timedelta(days=1))

        summaries = query.group_by(Photographer.id, Photographer.name)\
         .order_by(Photographer.name)\
         .all()
        
        return [
            {"photographer_id": id, "photographer_name": name, "total_earnings": total or 0}
            for id, name, total in summaries
        ]
