"""
Colección personal: solo lectura pública, sin precios ni status de venta.
Es el "showroom" informativo que mencionaste — llama la atención pero no
se vende (al menos no todavía).
"""
from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.database import get_db
from app.models import CollectionItem
from app.schemas import CollectionItemOut

router = APIRouter(prefix="/coleccion", tags=["público"])


@router.get("/", response_model=list[CollectionItemOut])
def listar_coleccion(db: Session = Depends(get_db)):
    return db.query(CollectionItem).order_by(CollectionItem.created_at.desc()).all()
