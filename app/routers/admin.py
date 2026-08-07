"""
Rutas de admin: todas protegidas con `Depends(require_admin)`.
Acá vivo el CRUD completo (crear, editar, borrar) porque solo vos las usás.

Dos routers en este archivo: uno para Frame (venta) y otro para
CollectionItem (colección informativa). Los separamos porque son recursos
distintos con reglas distintas — mezclarlos en un solo router con ifs
adentro sería más difícil de leer y de testear.
"""
from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException, UploadFile, File
from sqlalchemy.orm import Session

from app.database import get_db
from app.auth import require_admin
from app.models import Frame, Photo, FrameStatus, CollectionItem, CollectionPhoto
from app.schemas import (
    FrameCreate, FrameUpdate, FrameOut, MarcarVendido,
    CollectionItemCreate, CollectionItemOut,
)
from app.images import upload_photo, delete_photo

router = APIRouter(
    prefix="/admin/cuadros",
    tags=["admin"],
    dependencies=[Depends(require_admin)],  # se aplica a TODAS las rutas de este router
)

collection_router = APIRouter(
    prefix="/admin/coleccion",
    tags=["admin"],
    dependencies=[Depends(require_admin)],
)


@router.get("/resumen-margenes")
def resumen_margenes(db: Session = Depends(get_db)):
    """
    Vista rápida del negocio: margen total ya realizado (cuadros vendidos)
    y margen potencial de lo que sigue disponible. Va como GET simple
    (no response_model tipado) porque es un endpoint de reporte, no un
    recurso CRUD — devuelve un resumen calculado, no una entidad de la DB.
    """
    frames = db.query(Frame).all()

    vendidos = [f for f in frames if f.status == FrameStatus.sold]
    disponibles = [f for f in frames if f.status == FrameStatus.available]

    margen_realizado = sum((f.margin for f in vendidos if f.margin is not None), start=0)
    margen_potencial = sum((f.margin for f in disponibles if f.margin is not None), start=0)

    return {
        "cuadros_vendidos": len(vendidos),
        "margen_realizado": margen_realizado,
        "cuadros_disponibles": len(disponibles),
        "margen_potencial_disponible": margen_potencial,
    }


@router.post("/", response_model=FrameOut, status_code=201)
def crear_cuadro(data: FrameCreate, db: Session = Depends(get_db)):
    frame = Frame(**data.model_dump())
    db.add(frame)
    db.commit()
    db.refresh(frame)
    return frame


@router.patch("/{frame_id}", response_model=FrameOut)
def editar_cuadro(frame_id: int, data: FrameUpdate, db: Session = Depends(get_db)):
    frame = db.get(Frame, frame_id)
    if frame is None:
        raise HTTPException(status_code=404, detail="Cuadro no encontrado")

    # exclude_unset=True: solo pisa los campos que el cliente mandó de verdad,
    # no los que quedaron en None por default.
    for campo, valor in data.model_dump(exclude_unset=True).items():
        setattr(frame, campo, valor)

    db.commit()
    db.refresh(frame)
    return frame


@router.delete("/{frame_id}", status_code=204)
def borrar_cuadro(frame_id: int, db: Session = Depends(get_db)):
    frame = db.get(Frame, frame_id)
    if frame is None:
        raise HTTPException(status_code=404, detail="Cuadro no encontrado")

    for photo in frame.photos:
        delete_photo(photo.public_id)  # limpiamos también en Cloudinary, no dejamos basura

    db.delete(frame)
    db.commit()


@router.post("/{frame_id}/vender", response_model=FrameOut)
def marcar_vendido(frame_id: int, data: MarcarVendido, db: Session = Depends(get_db)):
    """
    Endpoint dedicado para la acción de venta, en vez de que lo hagas a
    mano con un PATCH. Registra sold_price + sold_at + status en un solo
    paso atómico, así nunca queda un cuadro "sold" sin sold_price cargado
    (lo que te rompería el cálculo de margen).
    """
    frame = db.get(Frame, frame_id)
    if frame is None:
        raise HTTPException(status_code=404, detail="Cuadro no encontrado")

    frame.status = FrameStatus.sold
    frame.sold_price = data.sold_price
    frame.sold_at = datetime.utcnow()

    db.commit()
    db.refresh(frame)
    return frame


@router.post("/{frame_id}/fotos", response_model=FrameOut, status_code=201)
async def subir_foto(frame_id: int, archivo: UploadFile = File(...), db: Session = Depends(get_db)):
    frame = db.get(Frame, frame_id)
    if frame is None:
        raise HTTPException(status_code=404, detail="Cuadro no encontrado")

    contenido = await archivo.read()
    resultado = upload_photo(contenido, folder=f"fixedgarage/frames/{frame_id}")

    siguiente_posicion = len(frame.photos)
    photo = Photo(
        frame_id=frame_id,
        url=resultado["url"],
        public_id=resultado["public_id"],
        position=siguiente_posicion,
    )
    db.add(photo)
    db.commit()
    db.refresh(frame)
    return frame


@router.delete("/{frame_id}/fotos/{photo_id}", response_model=FrameOut)
def borrar_foto(frame_id: int, photo_id: int, db: Session = Depends(get_db)):
    photo = db.get(Photo, photo_id)
    if photo is None or photo.frame_id != frame_id:
        raise HTTPException(status_code=404, detail="Foto no encontrada")

    delete_photo(photo.public_id)
    db.delete(photo)
    db.commit()

    frame = db.get(Frame, frame_id)
    db.refresh(frame)
    return frame


# --- Colección personal (informativa) ---

@collection_router.post("/", response_model=CollectionItemOut, status_code=201)
def crear_item_coleccion(data: CollectionItemCreate, db: Session = Depends(get_db)):
    item = CollectionItem(**data.model_dump())
    db.add(item)
    db.commit()
    db.refresh(item)
    return item


@collection_router.delete("/{item_id}", status_code=204)
def borrar_item_coleccion(item_id: int, db: Session = Depends(get_db)):
    item = db.get(CollectionItem, item_id)
    if item is None:
        raise HTTPException(status_code=404, detail="Pieza no encontrada")

    for photo in item.photos:
        delete_photo(photo.public_id)

    db.delete(item)
    db.commit()


@collection_router.post("/{item_id}/fotos", response_model=CollectionItemOut, status_code=201)
async def subir_foto_coleccion(item_id: int, archivo: UploadFile = File(...), db: Session = Depends(get_db)):
    item = db.get(CollectionItem, item_id)
    if item is None:
        raise HTTPException(status_code=404, detail="Pieza no encontrada")

    contenido = await archivo.read()
    resultado = upload_photo(contenido, folder=f"fixedgarage/collection/{item_id}")

    photo = CollectionPhoto(
        collection_item_id=item_id,
        url=resultado["url"],
        public_id=resultado["public_id"],
        position=len(item.photos),
    )
    db.add(photo)
    db.commit()
    db.refresh(item)
    return item
