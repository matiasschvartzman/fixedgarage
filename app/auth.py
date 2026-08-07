"""
Auth por API key: la forma más simple de proteger un endpoint.

Cómo funciona: el cliente (vos, desde Postman/curl/tu futura app) manda
un header "X-API-Key: <tu clave secreta>". Esta función la compara con la
que está en tu .env. Si no coincide, corta con 401 antes de que la request
llegue al endpoint.

Nota para tu formación: esto NO es lo mismo que autenticación de usuarios
(no sabés "quién" hizo la request, solo que "conoce el secreto"). Está bien
para un admin único como este caso. Si mañana tenés varios admins con
permisos distintos, ahí sí pasás a JWT + tabla de usuarios.
"""
from fastapi import Header, HTTPException, status

from app.config import settings


def require_admin(x_api_key: str = Header(...)) -> None:
    if x_api_key != settings.admin_api_key:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="API key inválida",
        )
