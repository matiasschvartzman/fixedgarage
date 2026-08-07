"""
Configuración de la app, leída de variables de entorno (.env).

Por qué así: nunca hardcodeamos secretos (contraseñas, API keys) en el código.
pydantic-settings valida que existan y tengan el tipo correcto al arrancar,
así si te olvidaste de configurar algo, la app falla al inicio con un error
claro, en vez de fallar en el peor momento en producción.
"""
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    database_url: str
    admin_api_key: str

    cloudinary_cloud_name: str
    cloudinary_api_key: str
    cloudinary_api_secret: str

    model_config = SettingsConfigDict(env_file=".env", extra="ignore")


settings = Settings()
