"""
Wrapper fino sobre el SDK de Cloudinary.

Por qué un módulo aparte: si mañana cambiás de proveedor (ej. a S3), solo
tocás este archivo. El resto de la app (routers) llama a upload_photo()
y delete_photo() sin saber ni importarle qué hay atrás. Esto es el
principio de "separación de responsabilidades": cada módulo hace una
cosa y la hace bien.
"""
import cloudinary
import cloudinary.uploader

from app.config import settings

cloudinary.config(
    cloud_name=settings.cloudinary_cloud_name,
    api_key=settings.cloudinary_api_key,
    api_secret=settings.cloudinary_api_secret,
    secure=True,
)


def upload_photo(file_bytes: bytes, folder: str) -> dict:
    """
    Sube una foto a Cloudinary dentro de `folder` y devuelve url + public_id.

    `folder` lo arma quien llama (ej. "fixedgarage/frames/3" o
    "fixedgarage/collection/7") para mantener ordenadas las fotos de venta
    separadas de las de colección dentro de tu cuenta de Cloudinary.
    """
    result = cloudinary.uploader.upload(file_bytes, folder=folder)
    return {"url": result["secure_url"], "public_id": result["public_id"]}


def delete_photo(public_id: str) -> None:
    cloudinary.uploader.destroy(public_id)
