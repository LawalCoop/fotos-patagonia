from sqlalchemy.orm import Session, joinedload
from fastapi import HTTPException, status

from models.user import User, UserCreateSchema, UserUpdateSchema, ChangePasswordSchema, AdminChangePasswordSchema
from models.role import Role
from core.security import get_password_hash, verify_password
from services.base import BaseService

class UserService(BaseService):
    def get_user_by_email(self, email: str) -> User | None:
        return self.db.query(User).filter(User.email == email).first()

    def list_users(self) -> list[User]:
        """Returns a list of all users with their roles and permissions eagerly loaded."""
        return self.db.query(User).options(
            joinedload(User.role).joinedload(Role.permissions)
        ).all()

    def get_user(self, user_id: int) -> User:
        """Returns a specific user by its ID with its role and permissions eagerly loaded."""
        user = (
            self.db.query(User)
            .options(
                joinedload(User.role).joinedload(Role.permissions),
                joinedload(User.photographer)
            )
            .filter(User.id == user_id)
            .first()
        )
        if not user:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found")
        return user

    def create_user(self, user_in: UserCreateSchema) -> User:
        hashed_password = get_password_hash(user_in.password)
        db_user = User(
            email=user_in.email,
            hashed_password=hashed_password,
            is_active=user_in.is_active,
            role_id=user_in.role_id
        )
        self._save_and_refresh(db_user)
        return self.get_user(db_user.id) # Re-fetch to ensure relationships are loaded

    def update_user(self, user_id: int, user_in: UserUpdateSchema) -> User:
        """Updates an existing user."""
        db_user = self.get_user(user_id) # Fetches with joinedload
        
        update_data = user_in.model_dump(exclude_unset=True)
        if "password" in update_data and update_data["password"]:
            db_user.hashed_password = get_password_hash(update_data["password"])
            del update_data["password"]

        for field, value in update_data.items():
            setattr(db_user, field, value)
            
        self._save_and_refresh(db_user) # Saves and refreshes, potentially expiring relationships
        return self.get_user(user_id) # Re-fetch to ensure relationships are loaded after refresh

    def delete_user(self, user_id: int):
        """Deletes a user."""
        db_user = self.get_user(user_id)
        return self._delete_and_refresh(db_user)

    def change_password(self, user_id: int, password_data: ChangePasswordSchema) -> User:
        """Changes a user's password, verifying the current one."""
        db_user = self.get_user(user_id)
        if not verify_password(password_data.current_password, db_user.hashed_password):
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="La contraseña actual es incorrecta")
        
        db_user.hashed_password = get_password_hash(password_data.new_password)
        self._save_and_refresh(db_user)
        return self.get_user(user_id)

    def admin_change_password(self, user_id: int, password_data: AdminChangePasswordSchema) -> User:
        """Changes a user's password without needing the current one (for admins)."""
        db_user = self.get_user(user_id)
        db_user.hashed_password = get_password_hash(password_data.new_password)
        self._save_and_refresh(db_user)
        return self.get_user(user_id)