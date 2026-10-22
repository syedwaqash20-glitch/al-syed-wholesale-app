import os
import time
from datetime import datetime, timezone
from typing import Optional

from fastapi import Depends, FastAPI, HTTPException, Request, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.middleware.trustedhost import TrustedHostMiddleware
from fastapi.security.api_key import APIKeyHeader

# Optional: Load .env file automatically if python-dotenv is installed
try:
    from dotenv import load_dotenv
    load_dotenv()
except ImportError:
    pass

from wholesale_inventory import initialize_database


# Sub-routers
from routes.areas import router as areas_router
from routes.brands import router as brands_router
from routes.categories import router as categories_router
from routes.clients import router as clients_router
from routes.order_items import router as order_items_router
from routes.orders import router as orders_router
from routes.products import router as products_router
from routes.route import router as routes_router
from routes.inventory import router as inventory_router
from routes.sales import router as sales_router
from routes.whatsapp import router as whatsapp_router
from routes.app_config import router as app_config_router

# ============================================================
# PRODUCTION HARDENED CONFIGURATION
# ============================================================

ENVIRONMENT = os.getenv("ENVIRONMENT", "development").lower()
IS_PRODUCTION = ENVIRONMENT == "production"

API_KEY = os.getenv("APP_API_KEY", "")
API_KEY_NAME = os.getenv("APP_API_KEY_NAME", "X-API-Key")

api_key_header = APIKeyHeader(name=API_KEY_NAME, auto_error=False)


async def verify_api_key(header_key: Optional[str] = Depends(api_key_header)) -> str:
    """API Key validation - allows header key or pass-through in dev mode."""
    if IS_PRODUCTION and (not header_key or header_key != API_KEY):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Access denied: Invalid or missing API Key.",
            headers={"WWW-Authenticate": "ApiKey"},
        )
    return header_key or ""


# ============================================================
# FASTAPI APPLICATION INSTANTIATION
# ============================================================

app = FastAPI(
    title="Al Syed Distribution Wholesale App",
    version="1.0.0",
    docs_url="/docs",
    redoc_url="/redoc",
    openapi_url="/openapi.json",
)


@app.on_event("startup")
def startup_db():
    initialize_database()


# ============================================================
# SECURITY MIDDLEWARE
# ============================================================

@app.middleware("http")
async def add_security_headers(request: Request, call_next):
    response = await call_next(request)
    response.headers["X-Frame-Options"] = "DENY"
    response.headers["X-Content-Type-Options"] = "nosniff"
    return response


# Dynamic CORS Origins Configuration - open for all clients (mobile APKs, web apps)
app.add_middleware(TrustedHostMiddleware, allowed_hosts=["*"])

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
    expose_headers=["*"],
    max_age=600,
)


# ============================================================
# PROTECTED ROUTE REGISTRATION
# ============================================================

GLOBAL_SECURITY = [Depends(verify_api_key)]

app.include_router(brands_router, dependencies=GLOBAL_SECURITY)
app.include_router(categories_router, dependencies=GLOBAL_SECURITY)
app.include_router(products_router, dependencies=GLOBAL_SECURITY)
app.include_router(routes_router, dependencies=GLOBAL_SECURITY)
app.include_router(areas_router, dependencies=GLOBAL_SECURITY)
app.include_router(clients_router, dependencies=GLOBAL_SECURITY)
app.include_router(orders_router, dependencies=GLOBAL_SECURITY)
app.include_router(order_items_router, dependencies=GLOBAL_SECURITY)
app.include_router(inventory_router, dependencies=GLOBAL_SECURITY)
app.include_router(sales_router, dependencies=GLOBAL_SECURITY)
app.include_router(whatsapp_router, dependencies=GLOBAL_SECURITY)
app.include_router(app_config_router, dependencies=GLOBAL_SECURITY)

# ============================================================
# PUBLIC ROOT HEALTH CHECK ENDPOINT
# ============================================================

@app.get("/", tags=["Root"])
def root():
    return {
        "success": True,
        "message": "Al Syed Distribution Wholesale App API",
        "timestamp": datetime.now(timezone.utc).isoformat(),
    }
