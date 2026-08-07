"""
Rutas públicas: cualquiera las puede llamar, no requieren API key.
Solo lectura (GET) — el público nunca modifica datos.

IMPORTANTE: acá usamos SIEMPRE FramePublicOut, nunca FrameOut. FrameOut
tiene purchase_price/margin (datos sensibles del negocio) y no debe
salir jamás por un endpoint público.
"""
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from decimal import Decimal

from app.database import get_db
from app.models import Frame, FrameStatus
from app.schemas import FramePublicOut
from app.exchange_rate import get_blue_rate

router = APIRouter(prefix="/catalogo", tags=["público"])


def _a_publico(frame: Frame, blue_rate) -> FramePublicOut:
    """Convierte un Frame de la DB al schema público, agregando price_ars si hay cotización."""
    data = FramePublicOut.model_validate(frame)
    if blue_rate is not None and frame.currency == "USD":
        # redondeamos a pesos enteros: no tiene sentido mostrar centavos de ARS
        data.price_ars = (frame.price * blue_rate).quantize(Decimal("1"))
    return data


@router.get("/", response_model=list[FramePublicOut])
def listar_cuadros(
    status: FrameStatus | None = None,
    db: Session = Depends(get_db),
):
    """
    Lista los cuadros. Por defecto trae todos; con ?status=available
    filtrás solo los disponibles (útil para la vista pública, que
    probablemente no quiera mostrar los ya vendidos).
    """
    query = db.query(Frame)
    if status is not None:
        query = query.filter(Frame.status == status)
    frames = query.order_by(Frame.created_at.desc()).all()

    blue_rate = get_blue_rate()
    return [_a_publico(frame, blue_rate) for frame in frames]


@router.get("/cotizacion")
def cotizacion_actual():
    """
    Devuelve la cotización usada para calcular price_ars, para que el
    frontend pueda mostrar algo como "Cotización blue: $1.350" y que el
    usuario entienda de dónde sale el precio en pesos.
    """
    rate = get_blue_rate()
    return {"dolar_blue_venta": rate, "disponible": rate is not None}


@router.get("/{frame_id}", response_model=FramePublicOut)
def obtener_cuadro(frame_id: int, db: Session = Depends(get_db)):
    frame = db.get(Frame, frame_id)
    if frame is None:
        raise HTTPException(status_code=404, detail="Cuadro no encontrado")
    return _a_publico(frame, get_blue_rate())
