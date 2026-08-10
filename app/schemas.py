"""
Schemas de Pydantic. Ojo, esto NO es lo mismo que los modelos de SQLAlchemy:

- models.py (SQLAlchemy)  -> cómo se guardan los datos en la DB.
- schemas.py (Pydantic)   -> qué forma tiene el JSON que entra/sale de la API.

Separarlos es importante: por ejemplo, cuando creás un Frame no mandás un
"id" (lo genera la DB), pero cuando lo LEÉS sí lo necesitás en la respuesta.
Si usaras la misma clase para todo, tendrías que hacer malabares con campos
opcionales. Con dos schemas distintos (FrameCreate vs FrameOut) cada uno
representa exactamente un caso de uso.
"""
from decimal import Decimal

from pydantic import BaseModel, ConfigDict, Field

from app.models import FrameStatus


class PhotoOut(BaseModel):
    id: int
    url: str
    position: int

    model_config = ConfigDict(from_attributes=True)


class FrameCreate(BaseModel):
    brand: str
    model: str
    size: str | None = None
    description: str
    currency: str = "USD"
    condition: Decimal | None = Field(default=None, ge=1, le=10)
    purchase_price: Decimal | None = None   # lo que pagaste vos; None si no lo cargás
    price: Decimal                          # precio pedido/publicado


class FrameUpdate(BaseModel):
    """Todos los campos opcionales: para poder actualizar solo lo que cambia (PATCH-style)."""
    brand: str | None = None
    model: str | None = None
    size: str | None = None
    description: str | None = None
    currency: str | None = None
    condition: Decimal | None = Field(default=None, ge=1, le=10)
    purchase_price: Decimal | None = None
    price: Decimal | None = None
    status: FrameStatus | None = None


class MarcarVendido(BaseModel):
    """
    Schema separado para la acción de venta (no un PATCH genérico), porque
    vender un cuadro no es "editar un campo cualquiera": tiene una regla de
    negocio propia (registra sold_price + sold_at + cambia status, todo junto,
    de forma atómica). Modelar acciones de negocio como su propio endpoint
    es más claro que forzarlas a través de un PATCH genérico.
    """
    sold_price: Decimal


class FrameOut(BaseModel):
    """Schema completo, con datos sensibles (compra, margen). SOLO para admin."""
    id: int
    brand: str
    model: str
    size: str | None
    description: str
    currency: str
    condition: Decimal | None = None
    purchase_price: Decimal | None
    price: Decimal
    sold_price: Decimal | None
    status: FrameStatus
    margin: Decimal | None = None   # calculado en el modelo, no viene de la DB directamente
    photos: list[PhotoOut] = []

    model_config = ConfigDict(from_attributes=True)


class FramePublicOut(BaseModel):
    """
    Schema público: NUNCA incluye purchase_price, sold_price ni margin.
    Es lo único que puede devolver el router público — si en el futuro
    agregás un campo sensible a Frame, tenés que agregarlo a propósito
    acá para que se exponga; por defecto queda oculto.
    """
    id: int
    brand: str
    model: str
    size: str | None
    description: str
    currency: str
    condition: Decimal | None = None
    price: Decimal
    price_ars: Decimal | None = None  # se completa en el router, no viene del modelo
    status: FrameStatus
    photos: list[PhotoOut] = []

    model_config = ConfigDict(from_attributes=True)


# --- Colección personal (informativa, sin precio) ---

class CollectionPhotoOut(BaseModel):
    id: int
    url: str
    position: int

    model_config = ConfigDict(from_attributes=True)


class CollectionItemCreate(BaseModel):
    brand: str
    model: str
    caption: str | None = None


class CollectionItemOut(BaseModel):
    id: int
    brand: str
    model: str
    caption: str | None
    photos: list[CollectionPhotoOut] = []

    model_config = ConfigDict(from_attributes=True)
