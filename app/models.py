"""
Modelos SQLAlchemy = las tablas de la base de datos.

Decisión de diseño clave: separamos "lo que se vende" (Frame) de
"lo que se muestra pero no se vende" (CollectionItem). Podríamos haber
metido todo en una sola tabla con un flag `is_collection` + campos de
precio nullable, pero eso ensucia el modelo: la mitad de los registros
tendrían plata cargada y la otra mitad no, y cualquiera que lea el código
después (vos en 6 meses, o un entrevistador revisando tu repo) tiene que
adivinar qué campos aplican a qué fila. Dos tablas, cada una con una sola
responsabilidad, es más código pero muchísimo más claro.

Frame → Photo y CollectionItem → CollectionPhoto son ambas relaciones
uno-a-muchos. Guardar las fotos en su propia tabla (en vez de una lista
de URLs en una columna JSON) es el patrón "correcto" en un modelo
relacional: permite orden, borrado individual, etc.
"""
import enum
from datetime import datetime
from decimal import Decimal

from sqlalchemy import String, Text, Numeric, DateTime, ForeignKey, Enum
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base


class FrameStatus(str, enum.Enum):
    available = "available"
    reserved = "reserved"
    sold = "sold"


class Frame(Base):
    """Un cuadro que está (o estuvo) a la venta. El corazón del negocio."""

    __tablename__ = "frames"

    id: Mapped[int] = mapped_column(primary_key=True)
    brand: Mapped[str] = mapped_column(String(100))            # ej: "Pinarello"
    model: Mapped[str] = mapped_column(String(100))            # ej: "Mercuri"
    size: Mapped[str | None] = mapped_column(String(20), nullable=True)   # ej: "55cm"
    description: Mapped[str] = mapped_column(Text)
    currency: Mapped[str] = mapped_column(String(3), default="USD")

    purchase_price: Mapped[Decimal | None] = mapped_column(Numeric(10, 2), nullable=True)
    price: Mapped[Decimal] = mapped_column(Numeric(10, 2))              # precio pedido/publicado
    sold_price: Mapped[Decimal | None] = mapped_column(Numeric(10, 2), nullable=True)  # precio real de cierre

    status: Mapped[FrameStatus] = mapped_column(
        Enum(FrameStatus), default=FrameStatus.available
    )
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    sold_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)

    photos: Mapped[list["Photo"]] = relationship(
        back_populates="frame", cascade="all, delete-orphan", order_by="Photo.position"
    )

    @property
    def margin(self) -> Decimal | None:
        """
        Margen real si ya se vendió, o margen ESTIMADO (con el precio pedido)
        si todavía está disponible. None si no cargaste el precio de compra
        (por ejemplo, piezas de colección que después decidiste vender).

        Es una @property, no una columna: se calcula al vuelo a partir de
        otros campos, así que guardarlo en la DB sería redundante y con
        riesgo de quedar desactualizado si editás el precio.
        """
        if self.purchase_price is None:
            return None
        precio_referencia = self.sold_price if self.status == FrameStatus.sold else self.price
        return precio_referencia - self.purchase_price


class Photo(Base):
    __tablename__ = "photos"

    id: Mapped[int] = mapped_column(primary_key=True)
    frame_id: Mapped[int] = mapped_column(ForeignKey("frames.id"))
    url: Mapped[str] = mapped_column(String(500))
    public_id: Mapped[str] = mapped_column(String(200))  # id de Cloudinary, para poder borrarla después
    position: Mapped[int] = mapped_column(default=0)     # orden en el carrusel de fotos

    frame: Mapped["Frame"] = relationship(back_populates="photos")


class CollectionItem(Base):
    """
    Pieza de la colección personal, mostrada de forma informativa en el
    sitio. A propósito NO tiene precio ni status de venta: no se vende
    (o no todavía). Si algún día decidís vender una pieza de colección,
    la solución es crear un Frame nuevo para ella, no agregarle plata
    a este modelo.
    """

    __tablename__ = "collection_items"

    id: Mapped[int] = mapped_column(primary_key=True)
    brand: Mapped[str] = mapped_column(String(100))
    model: Mapped[str] = mapped_column(String(100))
    caption: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)

    photos: Mapped[list["CollectionPhoto"]] = relationship(
        back_populates="item", cascade="all, delete-orphan", order_by="CollectionPhoto.position"
    )


class CollectionPhoto(Base):
    __tablename__ = "collection_photos"

    id: Mapped[int] = mapped_column(primary_key=True)
    collection_item_id: Mapped[int] = mapped_column(ForeignKey("collection_items.id"))
    url: Mapped[str] = mapped_column(String(500))
    public_id: Mapped[str] = mapped_column(String(200))
    position: Mapped[int] = mapped_column(default=0)

    item: Mapped["CollectionItem"] = relationship(back_populates="photos")
