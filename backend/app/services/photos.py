from sqlalchemy.orm import Session, joinedload
from fastapi import HTTPException, status
from models.photo import Photo, PhotoCreateSchema, PhotoUpdateSchema, PhotoSchema
from models.photo_session import PhotoSession
from models.tag import Tag
from services.base import BaseService
from services.storage import storage_service
from pydantic import BaseModel
from typing import List
from sqlalchemy import select
from models.user import User
from core.permissions import Permissions
from datetime import datetime
from services.sessions import SessionService
from models.photo_session import PhotoSessionCreateSchema as SessionCreateSchema
from sqlalchemy.exc import NoResultFound

class PhotoCompletionRequest(BaseModel):
    object_name: str
    original_filename: str
    contentHash: str # Añadido para detección de duplicados
    description: str | None = None
    price: float
    photographer_id: int

class PhotoService(BaseService):
    def _apply_album_default_price(self, photo: Photo) -> Photo:
        """
        Si la foto no tiene precio propio, hereda el del álbum.
        """
        if photo.price is None:
            if photo.session and photo.session.album and photo.session.album.default_photo_price is not None:
                photo.price = photo.session.album.default_photo_price
        return photo

    def _generate_presigned_urls(self, photo: Photo) -> PhotoSchema:
        """
        Validates a Photo object against the PhotoSchema. 
        URL generation is now a front-end concern using the object_name.
        """
        photo = self._apply_album_default_price(photo)
        return PhotoSchema.model_validate(photo)

    def _is_thumbnail_object(self, object_name: str) -> bool:
        return object_name.startswith("photos/thumb_")

    def _resolve_original_from_thumb(self, thumb_object_name: str) -> str:
        # photos/thumb_<uuid>.ext -> photos/<uuid>.ext
        base = thumb_object_name[len("photos/") :]
        if not base.startswith("thumb_"):
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Invalid thumbnail name."
            )
        return f"photos/{base[len('thumb_'):]}"

    def ensure_object_belongs_to_photo(self, object_name: str) -> Photo:
        """
        Validates that the requested object belongs to a known photo.
        Thumbnails must map to an existing original photo; originals must exist in DB.
        """
        if self._is_thumbnail_object(object_name):
            original_object_name = self._resolve_original_from_thumb(object_name)
            photo = (
                self.db.query(Photo)
                .filter(Photo.object_name == original_object_name)
                .first()
            )
            if not photo:
                raise HTTPException(
                    status_code=status.HTTP_404_NOT_FOUND,
                    detail="Thumbnail not associated to any photo."
                )
            return photo

        photo = (
            self.db.query(Photo)
            .filter(Photo.object_name == object_name)
            .first()
        )
        if not photo:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Photo not found."
            )
        return photo

    def generate_presigned_view_url(self, object_name: str) -> str:
        """
        Allows GET presigned URLs only for:
        - thumbnails that belong to a known photo (preview use-case)
        - originals that belong to a known photo (download flow)
        """
        self.ensure_object_belongs_to_photo(object_name)
        return storage_service.generate_presigned_get_url(object_name)

    def list_photos(self, offset: int = 0, limit: int = 10) -> List[PhotoSchema]:
        """Returns a list of all photos with presigned URLs."""
        photos = self.db.query(Photo).options(
            joinedload(Photo.photographer),
            joinedload(Photo.session).joinedload(PhotoSession.album)
        ).order_by(Photo.id.desc()).offset(offset).limit(limit).all()
        return [self._generate_presigned_urls(p) for p in photos]

    def get_photo(self, photo_id: int) -> PhotoSchema:
        """Returns a specific photo by its ID with presigned URLs."""
        photo = (
            self.db.query(Photo)
            .options(
                joinedload(Photo.photographer),
                joinedload(Photo.session).joinedload(PhotoSession.album)
            )
            .filter(Photo.id == photo_id)
            .first()
        )
        if not photo:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Photo not found")
        return self._generate_presigned_urls(photo)

    def get_photos_by_ids(self, photo_ids: List[int]) -> List[PhotoSchema]:
        """
        Returns a list of photos by their specific IDs.
        """
        if not photo_ids:
            return []
        
        photos = (
            self.db.query(Photo)
            .options(
                joinedload(Photo.photographer),
                joinedload(Photo.session).joinedload(PhotoSession.album),
            )
            .filter(Photo.id.in_(photo_ids))
            .all()
        )
        return [self._generate_presigned_urls(p) for p in photos]

    def check_duplicate_photos(self, hashes: List[str], photographer_id: int) -> List[str]:
        """
        Checks if any of the given photo hashes already exist for a specific photographer.
        Returns a list of content hashes that are found to be duplicates.
        """
        print(f"DEBUG: Checking for duplicate hashes for photographer_id {photographer_id}: {hashes}")

        if not hashes:
            return []
        
        # Buscar fotos que coincidan con los hashes
        existing_photos_query = self.db.query(Photo.content_hash).filter(
            Photo.content_hash.in_(hashes)
        )
        existing_photos = existing_photos_query.all()
        
        # Extraer los hashes de las fotos existentes
        duplicate_hashes = [p.content_hash for p in existing_photos if p.content_hash is not None]
        print(f"DEBUG: Found existing hashes: {duplicate_hashes}")
        return duplicate_hashes

    def create_photo(self, photo_in: PhotoCreateSchema) -> Photo:
        """Creates a new photo record in the database."""
        db_photo = Photo(**photo_in.model_dump())
        return self._save_and_refresh(db_photo)

    def update_photo(self, photo_id: int, photo_in: PhotoUpdateSchema, current_user: User) -> PhotoSchema:
        """Updates an existing photo record, checking for ownership."""
        db_photo_q = self.db.query(Photo).filter(Photo.id == photo_id).first()
        if not db_photo_q:
             raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Photo not found")

        user_permissions = {p.name for p in current_user.role.permissions}
        can_edit_any = Permissions.EDIT_ANY_PHOTO.value in user_permissions
        can_edit_own = Permissions.EDIT_OWN_PHOTO.value in user_permissions

        if not can_edit_any:
            if not can_edit_own or not current_user.photographer or db_photo_q.photographer_id != current_user.photographer.id:
                raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="You do not have permission to edit this photo.")

        update_data = photo_in.model_dump(exclude_unset=True)
        for field, value in update_data.items():
            setattr(db_photo_q, field, value)
            
        updated_photo = self._save_and_refresh(db_photo_q)
        return self._generate_presigned_urls(updated_photo)

    def delete_photo(self, photo_id: int, current_user: User):
        """
        Deletes a photo record and its corresponding file from storage.
        """
        photo_to_delete = self.db.query(Photo).filter(Photo.id == photo_id).first()
        if not photo_to_delete:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Photo not found for deletion.")

        user_permissions = {p.name for p in current_user.role.permissions}

        if Permissions.FULL_ACCESS.value not in user_permissions:
            can_delete_any = Permissions.DELETE_ANY_PHOTO.value in user_permissions
            can_delete_own = Permissions.DELETE_OWN_PHOTO.value in user_permissions
            is_owner = current_user.photographer and photo_to_delete.photographer_id == current_user.photographer.id

            if not can_delete_any and not (can_delete_own and is_owner):
                raise HTTPException(
                    status_code=status.HTTP_403_FORBIDDEN,
                    detail="You do not have permission to delete this photo."
                )
        
        try:
            storage_service.delete_file(photo_to_delete.object_name)
        except Exception as e:
            print(f"Error deleting file from storage for photo ID {photo_id}: {e}")
            
        self.db.delete(photo_to_delete)
        self.db.commit()

    def bulk_delete_photos(self, photo_ids: List[int], current_user: User):
        if not photo_ids:
            return {"deleted_count": 0, "errors": []}

        user_permissions = {p.name for p in current_user.role.permissions}
        has_full_access = Permissions.FULL_ACCESS.value in user_permissions
        can_delete_any = Permissions.DELETE_ANY_PHOTO.value in user_permissions
        can_delete_own = Permissions.DELETE_OWN_PHOTO.value in user_permissions

        photos_to_delete = self.db.query(Photo).filter(Photo.id.in_(photo_ids)).all()
        
        valid_photos_to_delete = []
        errors = []
        
        photo_map = {photo.id: photo for photo in photos_to_delete}

        for photo_id in photo_ids:
            photo = photo_map.get(photo_id)
            if not photo:
                errors.append(f"Photo with ID {photo_id} not found.")
                continue

            if has_full_access or can_delete_any:
                valid_photos_to_delete.append(photo)
            else:
                is_owner = current_user.photographer and photo.photographer_id == current_user.photographer.id
                if can_delete_own and is_owner:
                    valid_photos_to_delete.append(photo)
                else:
                    errors.append(f"Permission denied to delete photo with ID {photo_id}.")

        if not valid_photos_to_delete:
            if errors:
                raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="; ".join(errors))
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="No valid photos found to delete.")

        db_ids_to_delete = []
        for photo in valid_photos_to_delete:
            try:
                storage_service.delete_file(photo.object_name)
            except Exception as e:
                print(f"Error deleting file for photo ID {photo.id} from storage: {e}")
            db_ids_to_delete.append(photo.id)
            
        self.db.query(Photo).filter(Photo.id.in_(db_ids_to_delete)).delete(synchronize_session=False)
        self.db.commit()

        return {"deleted_count": len(db_ids_to_delete), "errors": errors}

    def set_tags_for_photo(self, photo_id: int, tag_names: List[str], current_user: User) -> PhotoSchema:
        db_photo = self.db.query(Photo).filter(Photo.id == photo_id).first()
        if not db_photo:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Photo not found.")

        user_permissions = {p.name for p in current_user.role.permissions}
        
        # El admin con FULL_ACCESS puede saltarse las comprobaciones de propiedad
        if Permissions.FULL_ACCESS.value not in user_permissions:
            can_edit_any = Permissions.EDIT_ANY_PHOTO.value in user_permissions
            can_edit_own = Permissions.EDIT_OWN_PHOTO.value in user_permissions

            if not can_edit_any:
                is_owner = current_user.photographer and db_photo.photographer_id == current_user.photographer.id
                if not (can_edit_own and is_owner):
                    raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="You do not have permission to edit tags for this photo.")

        db_photo.tags.clear()
        
        for tag_name in tag_names:
            if not tag_name.strip():
                continue
            tag = self.db.query(Tag).filter(Tag.name.ilike(tag_name.strip())).first()
            if not tag:
                tag = Tag(name=tag_name.strip())
                self.db.add(tag)
            db_photo.tags.append(tag)
            
        updated_photo = self._save_and_refresh(db_photo)
        return self._generate_presigned_urls(updated_photo)

    def finalize_photo_uploads(self, completion_requests: List[PhotoCompletionRequest], current_user: User, album_id: int | None = None) -> List[PhotoSchema]:
        from models.album import Album  # Importación local para evitar la dependencia circular

        if not completion_requests:
            return []

        # 1. Extraer todos los hashes y object_names
        all_hashes = [req.contentHash for req in completion_requests if req.contentHash]
        print(f"DEBUG: Finalizing upload for hashes: {all_hashes}")
        object_name_to_request_map = {req.object_name: req for req in completion_requests}

        # 2. Identificar duplicados en una sola consulta
        if all_hashes:
            existing_hashes_query = self.db.query(Photo.content_hash).filter(Photo.content_hash.in_(all_hashes))
            existing_hashes_results = existing_hashes_query.all()
            existing_hashes = {res[0] for res in existing_hashes_results}
            print(f"DEBUG: Hashes found in DB: {existing_hashes}")
        else:
            existing_hashes = set()

        # 3. Procesar solicitudes: separar nuevas de duplicadas
        new_requests = []
        for req in completion_requests:
            if req.contentHash in existing_hashes:
                print(f"DEBUG: Skipping '{req.original_filename}' (hash: {req.contentHash}) as a duplicate.")
                # Si es un duplicado, eliminar el archivo recién subido
                try:
                    storage_service.delete_file(req.object_name)
                    # Opcional: registrar que se eliminó un duplicado
                    print(f"Deleted duplicate upload from storage: {req.object_name}")
                except Exception as e:
                    # Opcional: registrar el error si la eliminación falla
                    print(f"Error deleting duplicate file {req.object_name} from storage: {e}")
            else:
                print(f"DEBUG: Processing '{req.original_filename}' (hash: {req.contentHash}) as a new photo.")
                new_requests.append(req)
        
        if not new_requests:
            return []

        # --- El resto del proceso solo opera sobre `new_requests` ---

        created_photos_schemas = []
        user_permissions = {p.name for p in current_user.role.permissions}
        can_edit_any = Permissions.EDIT_ANY_PHOTO.value in user_permissions or Permissions.FULL_ACCESS.value in user_permissions
        
        default_price = None
        if album_id:
            album = self.db.query(Album).filter(Album.id == album_id).first()
            if album and album.default_photo_price is not None:
                default_price = album.default_photo_price

        photographer_id = new_requests[0].photographer_id

        try:
            session_service = SessionService(self.db)
            new_session_data = SessionCreateSchema(
                event_name=f"Carga de fotos {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}",
                description="Sesión generada automáticamente para un lote de carga de fotos.",
                event_date=datetime.now(),
                location="Carga en línea",
                photographer_id=photographer_id,
                album_id=album_id
            )
            new_session = session_service.create_session(session_in=new_session_data)
            batch_session_id = new_session.id
        except Exception as e:
            raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail=f"Failed to create photo session for batch: {str(e)}")

        for photo_data in new_requests:
            if not can_edit_any:
                if not current_user.photographer or photo_data.photographer_id != current_user.photographer.id:
                    raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail=f"Permission denied for photographer ID {photo_data.photographer_id}.")
            try:
                price_to_use = default_price if default_price is not None else photo_data.price

                photo_in = PhotoCreateSchema(
                    filename=photo_data.original_filename,
                    description=photo_data.description,
                    price=price_to_use,
                    object_name=photo_data.object_name,
                    photographer_id=photo_data.photographer_id,
                    session_id=batch_session_id,
                )
                # Manually set content_hash as it's not in PhotoCreateSchema
                created_photo = Photo(**photo_in.model_dump())
                created_photo.content_hash = photo_data.contentHash
                
                saved_photo = self._save_and_refresh(created_photo)
                created_photos_schemas.append(self._generate_presigned_urls(saved_photo))

            except Exception as e:
                # Si llegamos aquí, podría ser por una race condition donde el hash se insertó
                # después de nuestra verificación inicial. La constraint `unique` nos protegería.
                self.db.rollback()
                print(f"Failed to create photo record for {photo_data.original_filename}: {e}")
                # Opcional: podrías intentar eliminar el archivo de S3 aquí también
                # si sospechas que el error se debe a la constraint de unicidad.
        
        return created_photos_schemas

    def download_photo(self, photo_id: int):
        return {"message": f"PhotoService: Download photo {photo_id} logic"}

    def request_presigned_urls(self):
        return {"message": "PhotoService: Request presigned URLs logic"}
