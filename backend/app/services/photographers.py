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
    real_photos_sold: float
    total_earnings: float

class EarningsSummarySchema(BaseModel):
    total_earnings: float
    total_earned_photo_fraction: float
    total_real_photos_sold: float
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
        photographers = self.db.query(Photographer).options(joinedload(Photographer.user)).filter(Photographer.is_active == True).all()
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
        ph = self.db.query(Photographer).filter(
            Photographer.id == ph_id,
            Photographer.is_active == True
        ).first()
        if not ph:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Photographer not found or is inactive"
            )
        return ph
    ############################################################################
    def update_photographer(self, ph_id: int, ph_in: PhotographerUpdateSchema):
        ph = self.db.query(Photographer).options(joinedload(Photographer.user)).filter(Photographer.id==ph_id).first()

        if not ph:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Photographer not found"
            )
        
        updated_data = ph_in.model_dump(exclude_unset=True)
        
        if "email" in updated_data:
            new_email = updated_data.pop("email")
            if ph.user:
                # Verificar si el nuevo email ya está en uso por otro usuario
                existing_user = self.db.query(User).filter(User.email == new_email).first()
                if existing_user and existing_user.id != ph.user.id:
                    raise HTTPException(
                        status_code=status.HTTP_400_BAD_REQUEST,
                        detail="Email already registered"
                    )
                ph.user.email = new_email
                self.db.add(ph.user)
        
        for field, value in updated_data.items():
            setattr(ph, field, value)
        
        return self._save_and_refresh(ph)
    ############################################################################
    def inactivate_photographer(self, ph_id: int):
        ph = self.db.query(Photographer).options(joinedload(Photographer.user)).filter(Photographer.id==ph_id).first()

        if not ph:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Photographer not found"
            )

        ph.is_active = False
        if ph.user:
            ph.user.is_active = False
        
        self.db.add(ph)
        self.db.commit()
        self.db.refresh(ph)
        
        return {"message": "Photographer inactivated successfully"}

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
            func.sum(Earning.real_photos_sold).label("real_photos_sold"),
            func.sum(Earning.amount).label("total_earnings")
        ).select_from(Earning)\
         .join(Earning.order_item)\
         .join(OrderItem.photo)\
         .filter(Earning.photographer_id == photographer_id)\
         .filter(OrderItem.format == None)\
         .group_by(Photo.id, Photo.filename)

        total = summary_query.count()
        results = summary_query.order_by(func.sum(Earning.amount).desc()).offset(skip).limit(limit).all()

        return PaginatedResponse(total=total, items=results)

    def get_earnings_summary_by_order(self, photographer_id: int, current_user: User, skip: int = 0, limit: int = 15, start_date: date | None = None, end_date: date | None = None):
        """
        Returns a paginated summary of earnings grouped by order.
        """
        self._check_earnings_permission(photographer_id, current_user)

        summary_query = self.db.query(
            Earning.order_id,
            func.min(Earning.created_at).label("created_at"),
            func.sum(OrderItem.quantity).label("total_photos"),
            func.sum(Earning.real_photos_sold).label("real_photos_sold"),
            func.sum(Earning.amount).label("total_earnings")
        ).select_from(Earning)\
         .join(Earning.order_item)\
         .filter(Earning.photographer_id == photographer_id)\
         .filter(OrderItem.format == None)\
         .group_by(Earning.order_id)
         
        if start_date:
            summary_query = summary_query.filter(Earning.created_at >= start_date)
        if end_date:
            summary_query = summary_query.filter(Earning.created_at < end_date + timedelta(days=1))

        total = summary_query.count()
        results = summary_query.order_by(func.min(Earning.created_at).desc()).offset(skip).limit(limit).all()
        
        # Now fetch total photos for these orders to calculate percentage
        order_ids = [r.order_id for r in results]
        order_totals = {}
        if order_ids:
            totals_query = self.db.query(
                OrderItem.order_id,
                func.sum(OrderItem.quantity).label("order_total_photos")
            ).filter(OrderItem.order_id.in_(order_ids))\
             .filter(OrderItem.format == None)\
             .group_by(OrderItem.order_id).all()
            for t in totals_query:
                order_totals[t.order_id] = t.order_total_photos

        from schemas.photographer import OrderEarningSummary
        result_schemas = []
        for r in results:
            order_total_photos = order_totals.get(r.order_id, 0)
            percentage_in_order = 0.0
            if order_total_photos > 0:
                percentage_in_order = (r.total_photos / order_total_photos) * 100
                
            # Create a dict from the result row, then update it
            schema_data = r._asdict() if hasattr(r, '_asdict') else dict(zip(r._fields, r))
            schema_data["order_total_photos"] = order_total_photos
            schema_data["percentage_in_order"] = percentage_in_order
            
            result_schemas.append(OrderEarningSummary(**schema_data))

        return PaginatedResponse(total=total, items=result_schemas)

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
            func.sum(earnings_subquery.c.real_photos_sold).label("total_real_photos_sold"),
            func.count(earnings_subquery.c.order_id.distinct()).label("total_orders_involved")
        )
        summary = summary_query.first()
        
        # Query for total photos sold (sum of quantities)
        total_photos_sold_query = self.db.query(func.sum(OrderItem.quantity))\
            .join(earnings_subquery, OrderItem.id == earnings_subquery.c.order_item_id)\
            .filter(OrderItem.format == None)
        total_photos_sold = total_photos_sold_query.scalar() or 0

        # Query for detailed photo sales
        photo_details_query = self.db.query(
            Photo.id.label("photo_id"),
            Photo.object_name.label("photo_object_name"),
            PhotoSession.event_name.label("album_name"),
            func.sum(OrderItem.quantity).label("times_sold"),
            func.sum(earnings_subquery.c.real_photos_sold).label("real_photos_sold"),
            func.sum(earnings_subquery.c.amount).label("total_earnings")
        ).join(earnings_subquery, OrderItem.id == earnings_subquery.c.order_item_id)\
         .join(Photo, OrderItem.photo_id == Photo.id)\
         .join(PhotoSession, Photo.session_id == PhotoSession.id)\
         .filter(OrderItem.format == None)\
         .group_by(Photo.id, Photo.object_name, PhotoSession.event_name)\
         .order_by(func.sum(earnings_subquery.c.amount).desc())

        photo_sales_details = photo_details_query.all()

        return EarningsSummarySchema(
            total_earnings=summary.total_amount or 0,
            total_earned_photo_fraction=summary.total_earned_photo_fraction or 0,
            total_real_photos_sold=summary.total_real_photos_sold or 0,
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
                    real_photos_sold=item.real_photos_sold,
                    total_earnings=item.total_earnings
                ) for item in photo_sales_details
            ]
        )

    def get_admin_earnings_report(
        self,
        current_user: User,
        start_date: date | None = None,
        end_date: date | None = None
    ) -> List[EarningsSummarySchema]:
        """
        Generates a detailed earnings report for all active photographers.
        """
        photographers = self.db.query(Photographer).filter(Photographer.is_active == True).all()
        
        report = []
        for photographer in photographers:
            summary = self.get_photographer_earnings_summary(
                photographer_id=photographer.id,
                current_user=current_user,
                start_date=start_date,
                end_date=end_date
            )
            report.append(summary)
            
        return report

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
