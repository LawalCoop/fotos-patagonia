import asyncio
from sqlalchemy.orm import Session

from db.session import SessionLocal
from models.role import Role
from models.permission import Permission
from models.user import User
from models.photographer import Photographer
from core.permissions import Permissions
from core.config import settings
from core.security import get_password_hash

# Define los permisos para cada rol
# El Admin tiene un permiso especial 'full_access' que le da acceso a todo.
# Los otros roles tienen permisos explícitos.
ROLES_PERMISSIONS = {
    "Admin": [
        Permissions.FULL_ACCESS.value
    ],
    "Supervisor": [
        Permissions.LIST_ALL_ORDERS.value,
        Permissions.UPDATE_ORDER_STATUS.value,
        Permissions.EDIT_ORDER.value,
        Permissions.LIST_PHOTOGRAPHERS.value,
        Permissions.CREATE_PHOTOGRAPHER.value,
        Permissions.EDIT_PHOTOGRAPHER.value,
        Permissions.DELETE_PHOTOGRAPHER.value,
        Permissions.EDIT_ANY_ALBUM.value,
        Permissions.EDIT_ANY_PHOTO.value,
        Permissions.DELETE_ANY_PHOTO.value,
        Permissions.DELETE_ANY_SESSION.value, # Added for Supervisor
        Permissions.MANAGE_DISCOUNTS.value,
        Permissions.MANAGE_TAGS.value,
        Permissions.MANAGE_COMBOS.value,
        Permissions.LIST_USERS.value,
        Permissions.VIEW_ANY_EARNINGS.value,
    ],
    "Photographer": [
        Permissions.CREATE_ALBUM.value,
        Permissions.EDIT_OWN_ALBUM.value, # Re-added - Photographers should edit OWN album
        Permissions.DELETE_OWN_ALBUM.value,
        Permissions.UPLOAD_PHOTO.value,
        Permissions.EDIT_OWN_PHOTO.value,
        Permissions.DELETE_OWN_PHOTO.value,
        Permissions.VIEW_OWN_EARNINGS.value,
        Permissions.LIST_ORDERS.value, # Permiso acotado para listar pedidos propios en UI sin exponer list_all_orders
        Permissions.UPDATE_ORDER_STATUS.value,
        Permissions.EDIT_ORDER.value,
    ],
    "Customer": []
}

def init_db(
    db: Session,
    first_superuser_email: str | None = None,
    first_superuser_password: str | None = None
) -> None:
    """
    Inicializa la base de datos con roles, permisos y un usuario admin.
    """
    # Ensure superuser credentials are set, either from arguments or settings
    if first_superuser_email is None:
        first_superuser_email = settings.FIRST_SUPERUSER_EMAIL
    if first_superuser_password is None:
        first_superuser_password = settings.FIRST_SUPERUSER_PASSWORD

    # --- 1. Crear todos los permisos en la base de datos ---
    all_permissions_in_db = {p.name for p in db.query(Permission).all()}
    all_permissions_in_enum = {p.value for p in Permissions}

    permissions_to_create = all_permissions_in_enum - all_permissions_in_db
    for perm_name in permissions_to_create:
        db.add(Permission(name=perm_name, description=f"Permiso para {perm_name}"))
    db.commit()
    print(f"Creados {len(permissions_to_create)} nuevos permisos.")

    # --- 2. Crear roles y asignarles permisos ---
    all_permissions_map = {p.name: p for p in db.query(Permission).all()}

    for role_name, role_perms_list in ROLES_PERMISSIONS.items():
        role = db.query(Role).filter(Role.name == role_name).first()
        if not role:
            role = Role(name=role_name, description=f"Rol de {role_name}")
            db.add(role)
            db.commit()
            db.refresh(role)
            print(f"Rol '{role_name}' creado.")

        # Asignar permisos al rol
        current_role_perms = {p.name for p in role.permissions}
        perms_to_assign_names = set(role_perms_list)
        
        new_assignments = perms_to_assign_names - current_role_perms
        for perm_name in new_assignments:
            if perm_name in all_permissions_map:
                role.permissions.append(all_permissions_map[perm_name])
        
        if new_assignments:
            db.commit()
            print(f"Asignados {len(new_assignments)} nuevos permisos al rol '{role_name}'.")

    # --- 3. Crear usuario Admin si no existe ---
    admin_role = db.query(Role).filter(Role.name == "Admin").first()
    if not admin_role:
        print("Error: No se encontró el rol de Admin para crear el superusuario.")
        return

    user = db.query(User).filter(User.email == first_superuser_email).first()
    if not user:
        user = User(
            email=first_superuser_email,
            hashed_password=get_password_hash(first_superuser_password),
            is_active=True,
            role_id=admin_role.id
        )
        db.add(user)
        db.commit()
        db.refresh(user) # Refresh user to get its ID before creating photographer
        print(f"Usuario admin '{first_superuser_email}' creado.")

        # Create a Photographer for the admin user
        # You can adjust these values as needed for your test data
        admin_photographer = Photographer(
            name="Admin Photographer",
            commission_percentage=10.0,
            contact_info="admin@example.com",
            user_id=user.id
        )
        db.add(admin_photographer)
        db.commit()
        print(f"Fotógrafo para el admin '{first_superuser_email}' creado.")

