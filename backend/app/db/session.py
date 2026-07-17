from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from core.config import settings

# El default de SQLAlchemy (pool_size=5, max_overflow=10) satura con galerías
# grandes: el front pide una URL firmada por foto y cada request toma una
# conexión. Los endpoints son sync, así que FastAPI los corre en su threadpool
# de 40; con 40 conexiones disponibles la cola nunca espera.
engine = create_engine(
    settings.DATABASE_URL,
    pool_size=10,
    max_overflow=30,
    pool_timeout=10,
    pool_pre_ping=True,
    pool_recycle=1800,
)
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
