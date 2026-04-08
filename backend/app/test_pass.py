import sys
import os
sys.path.append(os.path.dirname(os.path.abspath(__file__)))
from db.session import SessionLocal
from services.users import UserService
from models.user import AdminChangePasswordSchema, User
from core.security import verify_password

def test_password():
    db = SessionLocal()
    user_svc = UserService(db)
    
    # Just grab any active user
    user = db.query(User).filter(User.is_active == True).first()
    
    if not user:
        print("No users found")
        return
        
    print(f"User ID: {user.id}, Email: {user.email}")
    old_hash = user.hashed_password
    
    # Change password
    schema = AdminChangePasswordSchema(new_password="NewSecurePassword123!")
    user_svc.admin_change_password(user.id, schema)
    
    db.refresh(user)
    new_hash = user.hashed_password
    
    print(f"Old hash: {old_hash}")
    print(f"New hash: {new_hash}")
    
    is_valid = verify_password("NewSecurePassword123!", new_hash)
    print(f"Is valid for NewSecurePassword123!: {is_valid}")
    
test_password()
