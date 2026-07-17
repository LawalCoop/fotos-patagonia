from fastapi import APIRouter, Depends, status, HTTPException
from sqlalchemy.orm import Session
from typing import Dict, List
from deps import get_db, PermissionChecker
from services.photos import PhotoService, PhotoCompletionRequest
from models.photo import PhotoSchema, PhotoUpdateSchema
from services.storage import storage_service
from pydantic import BaseModel, Field
from models.user import User
from core.permissions import Permissions

router = APIRouter(
    prefix="/photos",
    tags=["photos"],
)

class BulkPhotoCompletionRequest(BaseModel):
    photos: List[PhotoCompletionRequest]
    album_id: int | None = None
    # Si viene, las fotos se agregan a esa sesión existente en vez de crear una
    # nueva (finalización por tandas sin partir el lote en varias sesiones).
    session_id: int | None = None

class TagRequest(BaseModel):
    tag_names: List[str]

class PresignedUrlResponse(BaseModel):
    url: str

MAX_PRESIGNED_BATCH = 500

class PresignedUrlsRequest(BaseModel):
    object_names: List[str] = Field(..., min_length=1, max_length=MAX_PRESIGNED_BATCH)

class PresignedUrlsResponse(BaseModel):
    urls: Dict[str, str]

@router.get("/presigned-url/", response_model=PresignedUrlResponse)
def get_presigned_url(object_name: str, db: Session = Depends(get_db)):
    """
    Generates a presigned GET URL only if the object (original or thumbnail)
    belongs to a known photo. Thumbnails are considered derived and safe for previews.
    """
    photo_service = PhotoService(db)
    url = photo_service.generate_presigned_view_url(object_name)
    return {"url": url}

@router.post("/presigned-urls/", response_model=PresignedUrlsResponse)
def get_presigned_urls(request: PresignedUrlsRequest, db: Session = Depends(get_db)):
    """
    Batch version of /presigned-url/: one request and one query for a whole
    gallery instead of one per photo. Names without a known photo are omitted,
    so the caller must treat a missing key as "not available".
    """
    photo_service = PhotoService(db)
    urls = photo_service.generate_presigned_view_urls(request.object_names)
    return {"urls": urls}

@router.post("/complete-upload", response_model=List[PhotoSchema], status_code=status.HTTP_201_CREATED)
def complete_upload(
    request: BulkPhotoCompletionRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(PermissionChecker([Permissions.UPLOAD_PHOTO]))
):
    """
    Notifies the server that files have been uploaded to the storage service.
    Creates photo records in the database for each uploaded file.
    """
    photo_service = PhotoService(db)
    try:
        created_photos = photo_service.finalize_photo_uploads(
            completion_requests=request.photos,
            current_user=current_user,
            album_id=request.album_id,
            session_id=request.session_id
        )
        return created_photos
    except HTTPException as e:
        raise e
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to finalize photo uploads: {str(e)}"
        )

@router.get("/", response_model=List[PhotoSchema])
def list_photos(
    offset: int = 0, 
    limit: int = 10, 
    photographer_id: int | None = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(PermissionChecker([Permissions.LIST_ORDERS], require_all=False)) # Use a common permission or a weak one
):
    # If user is a photographer (and not admin), force their own photographer_id
    user_permissions = {p.name for p in current_user.role.permissions}
    is_admin = Permissions.FULL_ACCESS.value in user_permissions
    
    final_photographer_id = photographer_id
    
    if not is_admin and current_user.photographer:
        # If it's a photographer, they can only see their own photos
        final_photographer_id = current_user.photographer.id
    
    return PhotoService(db).list_photos(offset=offset, limit=limit, photographer_id=final_photographer_id)

class PhotoIdsRequest(BaseModel):
    photo_ids: List[int]

class CheckDuplicatesRequest(BaseModel):
    hashes: List[str]
    photographer_id: int

class CheckDuplicatesResponse(BaseModel):
    duplicate_hashes: List[str]

@router.post("/check-duplicates", response_model=CheckDuplicatesResponse)
def check_duplicates(
    request: CheckDuplicatesRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(PermissionChecker([Permissions.UPLOAD_PHOTO]))
):
    """
    Checks for existing photos by their content hashes.
    Returns a list of hashes that are already in the database.
    """
    photo_service = PhotoService(db)
    duplicate_hashes = photo_service.check_duplicate_photos(
        hashes=request.hashes,
        photographer_id=request.photographer_id
    )
    return {"duplicate_hashes": duplicate_hashes}

@router.post("/by-ids", response_model=List[PhotoSchema])
def get_photos_by_ids(request: PhotoIdsRequest, db: Session = Depends(get_db)):
    """
    Retrieves a list of photos by their specific IDs.
    """
    photo_service = PhotoService(db)
    return photo_service.get_photos_by_ids(photo_ids=request.photo_ids)


@router.get("/{photo_id}", response_model=PhotoSchema)
def get_photo(photo_id: int, db: Session = Depends(get_db)):
    return PhotoService(db).get_photo(photo_id=photo_id)

@router.put("/{photo_id}", response_model=PhotoSchema)
def update_photo(
    photo_id: int,
    photo_in: PhotoUpdateSchema,
    db: Session = Depends(get_db),
    current_user: User = Depends(PermissionChecker(
        [Permissions.EDIT_OWN_PHOTO, Permissions.EDIT_ANY_PHOTO], require_all=False
    ))
):
    return PhotoService(db).update_photo(photo_id=photo_id, photo_in=photo_in, current_user=current_user)

@router.delete("/{photo_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_photo(
    photo_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(PermissionChecker(
        [Permissions.DELETE_OWN_PHOTO, Permissions.DELETE_ANY_PHOTO], require_all=False
    ))
):
    PhotoService(db).delete_photo(photo_id=photo_id, current_user=current_user)
    return


class BulkDeleteRequest(BaseModel):
    photo_ids: List[int]

@router.delete("/", status_code=status.HTTP_200_OK)
def bulk_delete_photos(
    request: BulkDeleteRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(PermissionChecker(
        [Permissions.DELETE_OWN_PHOTO, Permissions.DELETE_ANY_PHOTO], require_all=False
    ))
):
    """
    Deletes a list of photos by their IDs.
    The user must have permission to delete each of the photos.
    """
    result = PhotoService(db).bulk_delete_photos(photo_ids=request.photo_ids, current_user=current_user)
    
    # If there were partial permissions issues, it might be good to reflect that in the response
    if result["errors"]:
        # A 207 Multi-Status would be more accurate, but for simplicity, we can use 400 or 200 with details.
        # Let's return a 200 OK but with a clear message about what happened.
        return {
            "message": "Partial success: Some photos were not deleted due to permission issues.",
            "deleted_count": result["deleted_count"],
            "errors": result["errors"]
        }
        
    return {"message": f"Successfully deleted {result['deleted_count']} photos."}

@router.post("/{photo_id}/tags", response_model=PhotoSchema)
def set_photo_tags(
    photo_id: int,
    request: TagRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(PermissionChecker(
        [Permissions.EDIT_OWN_PHOTO, Permissions.EDIT_ANY_PHOTO], require_all=False
    ))
):
    """
    Set the tags for a photo. This will replace all existing tags.
    The user must have permission to edit the photo to set its tags.
    """
    return PhotoService(db).set_tags_for_photo(
        photo_id=photo_id, tag_names=request.tag_names, current_user=current_user
    )
