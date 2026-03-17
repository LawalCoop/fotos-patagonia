from fastapi import APIRouter, Depends, status
from sqlalchemy.orm import Session
from typing import List
from deps import get_db, get_current_user, PermissionChecker
from services.users import UserService
from models.user import UserCreateSchema, UserSchema, UserUpdateSchema, User, ChangePasswordSchema, AdminChangePasswordSchema
from core.permissions import Permissions

router = APIRouter(
    prefix="/users",
    tags=["users"],
)

@router.get("/", response_model=List[UserSchema])
def list_users(
    db: Session = Depends(get_db),
    current_user: User = Depends(PermissionChecker([Permissions.LIST_USERS]))
):
    return UserService(db).list_users()

@router.post("/", response_model=UserSchema, status_code=status.HTTP_201_CREATED)
def create_user(
    user_in: UserCreateSchema,
    db: Session = Depends(get_db),
    current_user: User = Depends(PermissionChecker([Permissions.EDIT_USER_ROLE]))
):
    return UserService(db).create_user(user_in=user_in)

@router.get("/me", response_model=UserSchema)
def read_users_me(current_user: User = Depends(get_current_user)):
    return current_user

@router.get("/{user_id}", response_model=UserSchema)
def get_user(
    user_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(PermissionChecker([Permissions.LIST_USERS]))
):
    return UserService(db).get_user(user_id)

@router.put("/{user_id}")
def update_user(
    user_id: int,
    user_in: UserUpdateSchema,
    db: Session = Depends(get_db),
    current_user: User = Depends(PermissionChecker([Permissions.EDIT_USER_ROLE]))
):
    return UserService(db).update_user(user_id, user_in)

@router.put("/me/password", response_model=UserSchema)
def change_my_password(
    password_data: ChangePasswordSchema,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    return UserService(db).change_password(current_user.id, password_data)

@router.put("/{user_id}/password", response_model=UserSchema)
def admin_change_password(
    user_id: int,
    password_data: AdminChangePasswordSchema,
    db: Session = Depends(get_db),
    current_user: User = Depends(PermissionChecker([Permissions.EDIT_USER_ROLE]))
):
    return UserService(db).admin_change_password(user_id, password_data)

@router.delete("/{user_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_user(
    user_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(PermissionChecker([Permissions.EDIT_USER_ROLE]))
):
    return UserService(db).delete_user(user_id)
