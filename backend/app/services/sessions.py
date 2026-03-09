from sqlalchemy.orm import Session, joinedload
from fastapi import HTTPException, status
from models.photo_session import PhotoSession, PhotoSessionCreateSchema, PhotoSessionUpdateSchema
from services.base import BaseService
from models.album import Album

class SessionService(BaseService):
    def list_sessions(self, photographer_id: int | None = None) -> list[PhotoSession]:
        """Returns a list of all photo sessions with their photographer eagerly loaded."""
        query = self.db.query(PhotoSession).options(
            joinedload(PhotoSession.photographer), 
            joinedload(PhotoSession.album)
        )
        if photographer_id:
            query = query.filter(PhotoSession.photographer_id == photographer_id)
        return query.all()

    def get_session(self, session_id: int) -> PhotoSession:
        """Returns a specific photo session by its ID with its photographer eagerly loaded."""
        session = (
            self.db.query(PhotoSession)
            .options(joinedload(PhotoSession.photographer), joinedload(PhotoSession.album))
            .filter(PhotoSession.id == session_id)
            .first()
        )
        if not session:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Photo session not found")
        return session

    def create_session(self, session_in: PhotoSessionCreateSchema) -> PhotoSession:
        """Creates a new photo session."""
        data = session_in.model_dump(exclude={"album_id"})
        db_session = PhotoSession(**data)
        if session_in.album_id is not None:
            album = self.db.query(Album).filter(Album.id == session_in.album_id).first()
            if not album:
              raise HTTPException(status_code=404, detail="Album not found")
            db_session.album = album

        return self._save_and_refresh(db_session)
    
    def update_session(self, session_id: int, session_in: PhotoSessionUpdateSchema) -> PhotoSession:
        db_session = self.get_session(session_id)
        data = session_in.model_dump(exclude_unset=True)

        for field in ["event_name", "description", "event_date", "location", "photographer_id"]:
            if field in data:
               setattr(db_session, field, data[field])

        if "album_id" in data:
            if data["album_id"] is None:
                db_session.album = None
            else:
                album = self.db.query(Album).filter(Album.id == data["album_id"]).first()
                if not album:
                    raise HTTPException(status_code=404, detail="Album not found")
                db_session.album = album

        return self._save_and_refresh(db_session)


    def delete_session(self, session_id: int):
        """Deletes a photo session."""
        db_session = self.get_session(session_id)
        return self._delete_and_refresh(db_session)

    # Method for sending cart link is kept for later implementation
    def send_cart_link(self, session_id: int):
        # Business logic for sending a cart link for a session
        return {"message": f"SessionService: Send cart link for session {session_id} logic"}
