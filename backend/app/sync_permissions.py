import sys
from sqlalchemy.orm import Session

# Ajustar el path para que encuentre los módulos si se corre desde la raíz de app
import os
sys.path.append(os.path.dirname(os.path.abspath(__file__)))

from db.session import SessionLocal
from models.role import Role
from models.permission import Permission
from core.permissions import Permissions
from db.init_db import ROLES_PERMISSIONS

def sync_permissions():
    """
    Sincroniza los permisos definidos en el código (Enum y ROLES_PERMISSIONS)
    con la base de datos, sin tocar usuarios.
    """
    db: Session = SessionLocal()
    try:
        print("Iniciando sincronización de permisos...")

        # --- 1. Crear todos los permisos que falten en la base de datos ---
        all_permissions_in_db = {p.name for p in db.query(Permission).all()}
        all_permissions_in_enum = {p.value for p in Permissions}

        permissions_to_create = all_permissions_in_enum - all_permissions_in_db
        if permissions_to_create:
            for perm_name in permissions_to_create:
                db.add(Permission(name=perm_name, description=f"Permiso para {perm_name}"))
            db.commit()
            print(f"✅ Creados {len(permissions_to_create)} nuevos permisos en la BD: {permissions_to_create}")
        else:
            print("✅ Todos los permisos ya existen en la BD.")

        # --- 2. Asignar permisos a los roles según ROLES_PERMISSIONS ---
        all_permissions_map = {p.name: p for p in db.query(Permission).all()}

        for role_name, role_perms_list in ROLES_PERMISSIONS.items():
            role = db.query(Role).filter(Role.name == role_name).first()
            if not role:
                print(f"⚠️ Rol '{role_name}' no existe en la BD, saltando...")
                continue

            current_role_perms = {p.name for p in role.permissions}
            perms_to_assign_names = set(role_perms_list)
            
            new_assignments = perms_to_assign_names - current_role_perms
            if new_assignments:
                for perm_name in new_assignments:
                    if perm_name in all_permissions_map:
                        role.permissions.append(all_permissions_map[perm_name])
                
                db.commit()
                print(f"✅ Asignados {len(new_assignments)} nuevos permisos al rol '{role_name}': {new_assignments}")
            else:
                print(f"✅ El rol '{role_name}' ya tiene todos sus permisos al día.")
                
        print("\n🎉 Sincronización de permisos completada con éxito.")

    except Exception as e:
        print(f"❌ Error durante la sincronización: {e}")
        db.rollback()
    finally:
        db.close()

if __name__ == "__main__":
    sync_permissions()
