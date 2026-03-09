from typing import List
from fastapi import APIRouter, Depends, status, Query
from pydantic import BaseModel
from sqlalchemy.orm import Session
from deps import get_db, get_current_user, PermissionChecker
from services.orders import OrderService
from models.user import User
from models.order import OrderUpdateSchema, OrderStatus, PaymentMethod, OrderSchema, PublicOrderSchema
from core.permissions import Permissions
from datetime import date

router = APIRouter(
    prefix="/orders",
    tags=["orders"],
)

class ResendEmailPayload(BaseModel):
    email: str | None = None

@router.get("/", response_model=List[OrderSchema])
def list_all_orders(
    db: Session = Depends(get_db),
    limit: int = Query(100, ge=1, le=1000),
    offset: int = Query(0, ge=0),
    start_date: date | None = Query(None),
    end_date: date | None = Query(None),
    photographer_id: int | None = Query(None),
    current_user: User = Depends(PermissionChecker([Permissions.LIST_ORDERS]))
):
    # If user is a photographer (and not admin), force their own photographer_id
    user_permissions = {p.name for p in current_user.role.permissions}
    is_admin = Permissions.FULL_ACCESS.value in user_permissions
    
    final_photographer_id = photographer_id
    
    if not is_admin and current_user.photographer:
        # If it's a photographer, they can only see orders with their photos
        final_photographer_id = current_user.photographer.id

    return OrderService(db).list_all_orders(
        limit=limit,
        offset=offset,
        start_date=start_date,
        end_date=end_date,
        photographer_id=final_photographer_id
    )

@router.get("/my-orders")
def list_my_orders(db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    return OrderService(db).list_my_orders(user_id=user.id)

@router.get("/{order_id}")
def get_order_details(
    order_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(PermissionChecker([Permissions.LIST_ALL_ORDERS]))
    # TODO: Permitir a un usuario ver su propia orden.
):
    return OrderService(db).get_order_details(order_id)

@router.get("/public/{public_id}", response_model=PublicOrderSchema)
def get_public_order_details(
    public_id: str,
    db: Session = Depends(get_db),
):
    """
    Public endpoint to get order details using the public ID (UUID).
    This does not require authentication.
    """
    return OrderService(db).get_order_by_public_id(public_id)
    
@router.put("/{order_id}/status")
def update_order_status(
    order_id: int,
    new_status: OrderStatus = Query(...),
    payment_method: PaymentMethod | None = Query(None),
    db: Session = Depends(get_db),
    current_user: User = Depends(PermissionChecker([Permissions.UPDATE_ORDER_STATUS]))
):
    return OrderService(db).update_order_status(order_id, new_status, payment_method)

@router.put("/{order_id}")
def edit_order(
    order_id: int,
    order_in: OrderUpdateSchema,
    db: Session = Depends(get_db),
    current_user: User = Depends(PermissionChecker([Permissions.EDIT_ORDER]))
):
    return OrderService(db).edit_order(order_id, order_in)

@router.post("/{order_id}/send-email")
def send_order_email(
    order_id: int,
    payload: ResendEmailPayload,
    db: Session = Depends(get_db),
    current_user: User = Depends(PermissionChecker([Permissions.UPDATE_ORDER_STATUS]))
):
    return OrderService(db).send_order_email(order_id=order_id, email_to=payload.email)

@router.delete("/{order_id}", status_code=status.HTTP_200_OK)
def delete_order(
    order_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(PermissionChecker([Permissions.DELETE_ORDER]))
):
    OrderService(db).delete_order(order_id)
    return {"message": "Order deleted successfully"}

@router.get("/{order_id}/qr-code")
def generate_qr_code(
    order_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(PermissionChecker([Permissions.UPDATE_ORDER_STATUS]))
):
    return OrderService(db).generate_qr_code(order_id)