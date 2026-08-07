"""
Cotización del dólar blue, con cache simple en memoria.

Por qué cachear: la cotización no cambia segundo a segundo, y pegarle a
una API externa en CADA request del catálogo es lento e innecesario —
además te arriesgás a que te bloqueen por rate limit si tenés tráfico.
Un cache de 1 hora es más que suficiente para este caso de uso.

Nota de diseño: el cache acá es una variable global en memoria (un dict
simple). Funciona perfecto para un solo proceso/servidor como el tuyo.
Si el día de mañana corrés múltiples instancias del backend, cada una
tendría su propio cache — no es un problema real (solo significa que
cada instancia puede refrescar la cotización en un momento distinto),
pero vale la pena que sepas que esa es la limitación de este approach
vs. un cache compartido como Redis.
"""
import time
from decimal import Decimal

import requests

CACHE_TTL_SECONDS = 60 * 60  # 1 hora
DOLAR_BLUE_URL = "https://dolarapi.com/v1/dolares/blue"

_cache: dict = {"rate": None, "fetched_at": 0.0}


def get_blue_rate() -> Decimal | None:
    """
    Devuelve la cotización de venta del dólar blue, o None si la API
    externa falla y no hay nada cacheado todavía. Nunca lanza una
    excepción hacia arriba: un problema con un servicio de terceros no
    tiene por qué romper el catálogo.
    """
    now = time.time()
    cache_vigente = _cache["rate"] is not None and (now - _cache["fetched_at"]) < CACHE_TTL_SECONDS
    if cache_vigente:
        return _cache["rate"]

    try:
        response = requests.get(DOLAR_BLUE_URL, timeout=5)
        response.raise_for_status()
        data = response.json()
        rate = Decimal(str(data["venta"]))
        _cache["rate"] = rate
        _cache["fetched_at"] = now
        return rate
    except (requests.RequestException, KeyError, ValueError):
        # Si falla pero teníamos un valor viejo cacheado, mejor devolver
        # ese (aunque tenga más de 1 hora) que no devolver nada.
        return _cache["rate"]
