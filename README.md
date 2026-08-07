# Fixed Garage Catalog API

Backend en FastAPI + PostgreSQL para el catálogo de cuadros de bicicletas
fixed de [@fixedgarage.arg](https://www.instagram.com/fixedgarage.arg/).

## Stack y por qué

| Pieza | Elegimos | Por qué |
|---|---|---|
| Framework | FastAPI | Validación automática, docs gratis (`/docs`), estándar en el mercado backend Python |
| DB | PostgreSQL | Datos relacionales (cuadro → fotos), gratis, robusto |
| ORM | SQLAlchemy 2.0 + Alembic | Control de esquema versionado, patrón usado en la industria |
| Fotos | Cloudinary | El disco de Railway/Render es efímero; Cloudinary da URL pública + CDN gratis |
| Auth admin | API key fija por header | Un solo admin (vos), no justifica el costo de un sistema de usuarios completo |

## Setup local

### 1. Clonar y crear entorno virtual

```bash
python3 -m venv venv
source venv/bin/activate   # en Windows: venv\Scripts\activate
pip install -r requirements.txt
```

### 2. Levantar Postgres con Docker

```bash
docker compose up -d
```

### 3. Configurar variables de entorno

```bash
cp .env.example .env
```

Completá `.env` con:
- `ADMIN_API_KEY`: inventá cualquier string secreta.
- `CLOUDINARY_*`: creá una cuenta gratis en [cloudinary.com](https://cloudinary.com),
  el dashboard te da esos 3 valores.

### 4. Correr las migraciones (crea las tablas)

```bash
alembic revision --autogenerate -m "tablas iniciales"
alembic upgrade head
```

### 5. Levantar el servidor

```bash
uvicorn app.main:app --reload
```

Abrí http://localhost:8000/docs — ahí tenés Swagger con todos los
endpoints, y podés probarlos desde el navegador sin escribir código.

## Modelo de datos

Dos entidades separadas a propósito:

- **Frame**: lo que vendés. Tiene `purchase_price`, `price` (pedido) y
  `sold_price` (real de cierre) — de ahí sale el `margin` (calculado,
  no se guarda en la DB).
- **CollectionItem**: tu colección personal, informativa. Solo marca,
  modelo, fotos y caption — sin precios ni status de venta.

**Importante — dos schemas de salida para Frame:**
- `FrameOut` (admin): incluye `purchase_price`, `sold_price`, `margin`. NUNCA se expone públicamente.
- `FramePublicOut` (catálogo público): solo `price` (USD) + `price_ars` (convertido con dólar blue). Sin datos de compra ni margen.

## Cotización del dólar blue

El precio de venta se carga siempre en USD (fuente de verdad). El
catálogo público automáticamente agrega `price_ars`, calculado con la
cotización de venta del dólar blue (vía [dolarapi.com](https://dolarapi.com),
gratis, sin API key). La cotización se cachea en memoria por 1 hora para
no golpear la API externa en cada request.

Si la API externa está caída, `price_ars` viene `null` en vez de romper
el catálogo entero — un servicio de terceros caído no debería tumbar tu
sitio.

## Endpoints principales

**Públicos (sin auth):**
- `GET /catalogo/` — lista cuadros a la venta, con `price` (USD) y `price_ars` (`?status=available` para filtrar)
- `GET /catalogo/{id}` — detalle de un cuadro
- `GET /catalogo/cotizacion` — cotización actual usada (para mostrarla en el frontend)
- `GET /coleccion/` — lista la colección personal (informativa)

**Admin — cuadros (header `X-API-Key: <tu clave>`):**
- `POST /admin/cuadros/` — crear un cuadro (con `purchase_price` opcional)
- `PATCH /admin/cuadros/{id}` — editar cualquier campo
- `POST /admin/cuadros/{id}/vender` — marcar vendido (pide `sold_price`, registra fecha automáticamente)
- `DELETE /admin/cuadros/{id}` — borrar (borra también sus fotos en Cloudinary)
- `POST /admin/cuadros/{id}/fotos` — subir una foto (multipart/form-data)
- `DELETE /admin/cuadros/{id}/fotos/{photo_id}` — borrar una foto puntual
- `GET /admin/cuadros/resumen-margenes` — margen realizado (vendidos) + potencial (disponibles)

**Admin — colección:**
- `POST /admin/coleccion/` — crear pieza de colección
- `POST /admin/coleccion/{id}/fotos` — subir foto
- `DELETE /admin/coleccion/{id}` — borrar pieza

## Deploy (para acceder desde cualquier PC/celular)

1. Subí este repo a GitHub.
2. Creá un proyecto en [Railway](https://railway.app) o [Render](https://render.com).
3. Agregá un servicio de Postgres (te dan la `DATABASE_URL` automáticamente).
4. Configurá las variables de entorno (las mismas del `.env`) en el dashboard del servicio.
5. Comando de arranque: `uvicorn app.main:app --host 0.0.0.0 --port $PORT`

## Cargar tus 4 cuadros actuales

Con el server corriendo, desde una terminal:

```bash
curl -X POST http://localhost:8000/admin/cuadros/ \
  -H "X-API-Key: tu-clave" \
  -H "Content-Type: application/json" \
  -d '{
    "brand": "Pinarello",
    "model": "Mercuri",
    "size": "55cm",
    "description": "Cuadro fixed, detalles en violeta, poco uso",
    "price": 150000
  }'
```

Te devuelve el `id` del cuadro creado. Con ese id, subís las fotos:

```bash
curl -X POST http://localhost:8000/admin/cuadros/1/fotos \
  -H "X-API-Key: tu-clave" \
  -F "archivo=@/ruta/a/tu/foto.jpg"
```

## Próximos pasos posibles

- Frontend simple (React o incluso HTML+JS) que consuma `GET /catalogo/`.
- Paginación en el listado (innecesaria con 4 cuadros, pero buena práctica).
- Tests con `pytest` + `httpx` — armamos esto en la próxima etapa si querés.
