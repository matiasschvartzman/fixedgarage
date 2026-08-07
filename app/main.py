from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.routers import public, admin, collection_public

app = FastAPI(
    title="Fixed Garage Catalog API",
    description="Catálogo de cuadros de bicicletas fixed en venta.",
    version="1.0.0",
)

# CORS abierto: como todavía no sabemos desde qué dominio vas a servir el
# frontend (o si vas a pegarle desde una app mobile), lo dejamos permisivo.
# Cuando tengas el frontend definitivo, restringí `allow_origins` a esa URL.
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(public.router)
app.include_router(collection_public.router)
app.include_router(admin.router)
app.include_router(admin.collection_router)


@app.get("/")
def health_check():
    return {"status": "ok", "service": "fixedgarage-catalog"}
