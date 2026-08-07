"""
Setup de SQLAlchemy: engine (conexión física a Postgres) + SessionLocal
(fábrica de sesiones) + Base (clase madre de todos los modelos).

get_db() es un "dependency" de FastAPI: abre una sesión por cada request
y la cierra sola al terminar, incluso si hubo una excepción. Esto evita
el bug clásico de conexiones que quedan abiertas y agotan el pool.
"""
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker, declarative_base

from app.config import settings

engine = create_engine(settings.database_url)
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

Base = declarative_base()


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
