from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from core.config import settings

# 40 = tamaño del threadpool que FastAPI usa para endpoints sync, o sea el
# máximo de requests concurrentes: con una conexión por hilo la cola no espera.
# El default (5+10) dejaba 25 hilos peleando por 15 conexiones.
engine = create_engine(
    settings.DATABASE_URL,
    pool_size=10,
    max_overflow=30,
    pool_timeout=10,
    pool_pre_ping=True,
    pool_recycle=1800,
)
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
