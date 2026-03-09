from fastapi import APIRouter, Depends, status
from sqlalchemy.orm import Session
from typing import List
from deps import get_db, PermissionChecker
from services.sessions import SessionService
from models.photo_session import PhotoSessionSchema, PhotoSessionCreateSchema, PhotoSessionUpdateSchema
from core.permissions import Permissions
from models.user import User

router = APIRouter(
    prefix="/sessions",
    tags=["sessions"],
)

@router.get("/", response_model=List[PhotoSessionSchema])
def list_sessions(
    db: Session = Depends(get_db),
    current_user: User = Depends(PermissionChecker([Permissions.LIST_ORDERS], require_all=False))
):
    user_permissions = {p.name for p in current_user.role.permissions}
    is_admin = Permissions.FULL_ACCESS.value in user_permissions
    
    photographer_id = None
    if not is_admin and current_user.photographer:
        photographer_id = current_user.photographer.id

    return SessionService(db).list_sessions(photographer_id=photographer_id)

@router.post("/", response_model=PhotoSessionSchema, status_code=status.HTTP_201_CREATED)
def create_session(
    session_in: PhotoSessionCreateSchema,
    db: Session = Depends(get_db),
    current_user: User = Depends(PermissionChecker([Permissions.CREATE_ALBUM]))
):
    # Ensure photographer can only create sessions for themselves
    user_permissions = {p.name for p in current_user.role.permissions}
    is_admin = Permissions.FULL_ACCESS.value in user_permissions
    
    if not is_admin and current_user.photographer:
        session_in.photographer_id = current_user.photographer.id

    return SessionService(db).create_session(session_in=session_in)

@router.get("/{session_id}", response_model=PhotoSessionSchema)
def get_session(
    session_id: int, 
    db: Session = Depends(get_db),
    current_user: User = Depends(PermissionChecker([Permissions.LIST_ORDERS], require_all=False))
):
    session = SessionService(db).get_session(session_id=session_id)
    
    # Check ownership
    user_permissions = {p.name for p in current_user.role.permissions}
    is_admin = Permissions.FULL_ACCESS.value in user_permissions
    if not is_admin and current_user.photographer and session.photographer_id != current_user.photographer.id:
        raise HTTPException(status_code=403, detail="Not enough permissions")
        
    return session

@router.put("/{session_id}", response_model=PhotoSessionSchema)
def update_session(
    session_id: int,
    session_in: PhotoSessionUpdateSchema,
    db: Session = Depends(get_db),
    current_user: User = Depends(PermissionChecker([Permissions.EDIT_OWN_ALBUM, Permissions.EDIT_ANY_ALBUM], require_all=False))
):
    session_service = SessionService(db)
    session = session_service.get_session(session_id)
    
    user_permissions = {p.name for p in current_user.role.permissions}
    is_admin = Permissions.FULL_ACCESS.value in user_permissions
    
    if not is_admin:
        if not current_user.photographer or session.photographer_id != current_user.photographer.id:
            raise HTTPException(status_code=403, detail="Not enough permissions")
        # Ensure they don't change the photographer_id to someone else
        if session_in.photographer_id is not None:
             session_in.photographer_id = current_user.photographer.id

    return session_service.update_session(session_id=session_id, session_in=session_in)

@router.delete("/{session_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_session(
    session_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(PermissionChecker([Permissions.DELETE_ANY_SESSION]))
):
    return SessionService(db).delete_session(session_id=session_id)

# --- Special Actions ---

@router.post("/{session_id}/send-cart-link")
def send_cart_link(
    session_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(PermissionChecker([Permissions.EDIT_ANY_ALBUM]))
):
    return SessionService(db).send_cart_link(session_id)