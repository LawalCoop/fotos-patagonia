from sqlalchemy.orm import Session
from sqlalchemy import func, case
from services.base import BaseService
from models.order import Order, OrderItem, PaymentStatus
from models.photo import Photo
from models.photographer import Photographer
from models.earning import Earning
from schemas.admin import AdminDashboardSchema, AdminCommissionSummary, RecentSessionInfo
from schemas.statistics import PhotoSaleStat
from typing import List

from sqlalchemy.orm import Session
from sqlalchemy import func, case
from services.base import BaseService
from models.order import Order, OrderItem, PaymentStatus
from models.photo import Photo
from models.photographer import Photographer
from models.earning import Earning
from schemas.admin import AdminDashboardSchema, AdminCommissionSummary, RecentSessionInfo
from schemas.statistics import PhotoSaleStat
from typing import List, Optional
from datetime import date

class AdminService(BaseService):
    def get_dashboard_summary(
        self,
        start_date: Optional[date] = None,
        end_date: Optional[date] = None,
        photographer_id: Optional[int] = None,
    ) -> AdminDashboardSchema:
        """
        Calculates and returns a global summary for the admin dashboard,
        with optional filters for date range and photographer.
        """
        db = self.db

        # --- Base Query for Orders ---
        # This will be the foundation for most stats.
        orders_query = db.query(Order).filter(Order.payment_status == PaymentStatus.PAID)
        if start_date:
            orders_query = orders_query.filter(Order.created_at >= start_date)
        if end_date:
            orders_query = orders_query.filter(Order.created_at <= end_date)
        
        if photographer_id:
            orders_query = orders_query.join(OrderItem).join(Photo).filter(Photo.photographer_id == photographer_id)

        orders_subquery = orders_query.distinct(Order.id).subquery()

        # --- 1. Global Stats ---
        global_stats_query = db.query(
            func.count(orders_subquery.c.id).label("total_orders"),
            func.sum(orders_subquery.c.total).label("total_gross_revenue"),
        )
        global_stats = global_stats_query.first()
        
        order_items_query = db.query(func.sum(OrderItem.quantity))\
            .join(orders_subquery, OrderItem.order_id == orders_subquery.c.id)
        total_photos_sold = order_items_query.scalar()

        # --- Total Real Photos Sold ---
        real_photos_sold_query = db.query(func.sum(Earning.real_photos_sold))\
            .join(orders_subquery, Earning.order_id == orders_subquery.c.id)
        total_real_photos_sold = real_photos_sold_query.scalar() or 0.0

        # --- Orders by Payment Method ---
        payment_method_query = db.query(
            orders_subquery.c.payment_method,
            func.count(orders_subquery.c.id).label("count")
        ).group_by(orders_subquery.c.payment_method)
        
        orders_by_payment_method = {
            method: count for method, count in payment_method_query.all() if method
        }

        # --- Total Photos in the system (conditionally affected by photographer filter) ---
        photos_query = db.query(func.count(Photo.id))
        if photographer_id:
            photos_query = photos_query.filter(Photo.photographer_id == photographer_id)
        total_photos = photos_query.scalar()

        # --- 2. Per-Photographer Stats (affected by filters) ---
        gross_sales_query = db.query(
            Photographer.id.label("photographer_id"),
            func.sum(OrderItem.price * OrderItem.quantity).label("gross_sales")
        ).join(Photo, Photographer.id == Photo.photographer_id)\
         .join(OrderItem, Photo.id == OrderItem.photo_id)\
         .join(orders_subquery, OrderItem.order_id == orders_subquery.c.id)\
         .group_by(Photographer.id)

        if photographer_id:
            gross_sales_query = gross_sales_query.filter(Photographer.id == photographer_id)
        gross_sales_subquery = gross_sales_query.subquery()
        
        net_earnings_query = db.query(
            Earning.photographer_id.label("photographer_id"),
            func.sum(Earning.amount).label("net_earnings")
        ).join(orders_subquery, Earning.order_id == orders_subquery.c.id)\
         .group_by(Earning.photographer_id)

        if photographer_id:
            net_earnings_query = net_earnings_query.filter(Earning.photographer_id == photographer_id)
        net_earnings_subquery = net_earnings_query.subquery()
        
        photographers_query = db.query(Photographer)
        if photographer_id:
            photographers_query = photographers_query.filter(Photographer.id == photographer_id)
        
        commission_summary_query = photographers_query.add_columns(
            gross_sales_subquery.c.gross_sales,
            net_earnings_subquery.c.net_earnings
        ).outerjoin(gross_sales_subquery, Photographer.id == gross_sales_subquery.c.photographer_id)\
         .outerjoin(net_earnings_subquery, Photographer.id == net_earnings_subquery.c.photographer_id)\
         .order_by(Photographer.name)
        
        photographer_stats = commission_summary_query.all()

        commissions_by_photographer: List[AdminCommissionSummary] = []
        total_commissions = 0.0
        for p_record, gross, net in photographer_stats:
            gross_sales = gross or 0
            net_earnings = net or 0
            commission = gross_sales - net_earnings
            total_commissions += commission
            
            commissions_by_photographer.append(
                AdminCommissionSummary(
                    photographer_id=p_record.id,
                    photographer_name=p_record.name,
                    total_commission=round(commission, 2),
                    total_gross_sales=round(gross_sales, 2)
                )
            )

        # --- 3. Assemble final schema ---
        return AdminDashboardSchema(
            total_photos=total_photos or 0,
            total_photos_sold=total_photos_sold or 0,
            total_real_photos_sold=round(total_real_photos_sold, 2),
            total_orders=global_stats.total_orders or 0,
            total_gross_revenue=round(global_stats.total_gross_revenue or 0, 2),
            total_commissions=round(total_commissions, 2),
            orders_by_payment_method=orders_by_payment_method,
            commissions_by_photographer=commissions_by_photographer,
        )

    def get_recent_sessions(self) -> List[RecentSessionInfo]:
        """
        Retrieves a summary of the last 5 photo sessions for the admin dashboard.
        """
        from models.photo_session import PhotoSession
        
        sessions_query = self.db.query(
            PhotoSession.id,
            Photographer.name.label("photographer_name"),
            func.to_char(PhotoSession.event_date, 'YYYY-MM-DD HH24:MI:SS').label("start_time"),
            func.count(Photo.id).label("total_photos"),
            case(
                (func.count(Photo.id) > 0, "Completado"),
                else_ = "Pendiente"
            ).label("status")
        ).join(Photographer, PhotoSession.photographer_id == Photographer.id)\
         .outerjoin(Photo, PhotoSession.id == Photo.session_id)\
         .group_by(PhotoSession.id, Photographer.name)\
         .order_by(PhotoSession.event_date.desc())\
         .limit(5)
        
        recent_sessions = sessions_query.all()
        
        return [
            RecentSessionInfo(
                id=r.id,
                photographer_name=r.photographer_name,
                start_time=r.start_time,
                total_photos=r.total_photos,
                status=r.status
            ) for r in recent_sessions
        ]

    def get_photo_sales_statistics(self, photographer_id: int) -> List[PhotoSaleStat]:
        from models.photo_session import PhotoSession
        from models.album import Album

        stats_query = self.db.query(
            Photo.id.label("photo_id"),
            Photo.filename.label("photo_filename"),
            Album.name.label("album_name"),
            func.sum(OrderItem.quantity).label("times_sold"),
            func.sum(OrderItem.price * OrderItem.quantity).label("total_revenue")
        ).select_from(Photo)\
         .join(Photo.order_items)\
         .join(OrderItem.order)\
         .outerjoin(Photo.session)\
         .outerjoin(PhotoSession.album)\
         .filter(Photo.photographer_id == photographer_id)\
         .filter(Order.payment_status == PaymentStatus.PAID)\
         .group_by(Photo.id, Photo.filename, Album.name)\
         .order_by(func.sum(OrderItem.quantity).desc())

        results = stats_query.all()
        return [PhotoSaleStat.from_orm(r) for r in results]

