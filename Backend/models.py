from typing import Optional, List, Any, Dict
from pydantic import BaseModel, Field


# ============================================================
# BRAND
# ============================================================

class BrandCreate(BaseModel):
    brand_name: str = Field(..., min_length=1, max_length=255)


class BrandUpdate(BaseModel):
    brand_name: Optional[str] = Field(
        None,
        min_length=1,
        max_length=255
    )


class BrandResponse(BaseModel):
    brand_id: int
    brand_name: str


# ============================================================
# CATEGORY
# ============================================================

class CategoryCreate(BaseModel):
    category_name: str = Field(
        ...,
        min_length=1,
        max_length=255
    )


class CategoryUpdate(BaseModel):
    category_name: Optional[str] = Field(
        None,
        min_length=1,
        max_length=255
    )


class CategoryResponse(BaseModel):
    category_id: int
    category_name: str


# ============================================================
# PRODUCT
# ============================================================

class ProductCreate(BaseModel):
    brand_id: Optional[int] = None
    brand_name: Optional[str] = None
    category_id: Optional[int] = None
    category_name: Optional[str] = None

    product_name: str = Field(
        ...,
        min_length=1,
        max_length=255
    )

    base_price: float = Field(0.0, ge=0)
    unit_type: str = Field("bundle") # 'bundle' or 'packet'
    packet_conversion_qty: int = Field(6, ge=1) # 6 packets = 1 Bundle Mix
    packet_price: float = Field(0.0, ge=0)
    bundle_price: float = Field(0.0, ge=0)
    is_arshad_foods: bool = False
    initial_stock: Optional[int] = 100


class ProductUpdate(BaseModel):
    brand_id: Optional[int] = None
    brand_name: Optional[str] = None
    category_id: Optional[int] = None
    category_name: Optional[str] = None

    product_name: Optional[str] = Field(
        None,
        min_length=1,
        max_length=255
    )

    base_price: Optional[float] = Field(None, ge=0)
    unit_type: Optional[str] = None
    packet_conversion_qty: Optional[int] = None
    packet_price: Optional[float] = None
    bundle_price: Optional[float] = None
    is_arshad_foods: Optional[bool] = None

    unit_type: Optional[str] = None
    packet_conversion_qty: Optional[int] = Field(None, ge=1)
    packet_price: Optional[float] = Field(None, ge=0)
    bundle_price: Optional[float] = Field(None, ge=0)
    is_arshad_foods: Optional[bool] = None


class ProductResponse(BaseModel):
    product_id: int
    brand_id: int
    category_id: int
    product_name: str
    base_price: float
    unit_type: str = "bundle"
    packet_conversion_qty: int = 6
    packet_price: float = 0.0
    bundle_price: float = 0.0
    is_arshad_foods: bool = False
    brand_name: Optional[str] = None
    category_name: Optional[str] = None


# ============================================================
# ROUTE
# ============================================================

class RouteCreate(BaseModel):
    route_name: str = Field(
        ...,
        min_length=1,
        max_length=255
    )

    assigned_day: str


class RouteUpdate(BaseModel):
    route_name: Optional[str] = Field(
        None,
        min_length=1,
        max_length=255
    )

    assigned_day: Optional[str] = None


class RouteResponse(BaseModel):
    route_id: int
    route_name: str
    assigned_day: str
    created_at: str


# ============================================================
# AREA
# ============================================================

class AreaCreate(BaseModel):
    route_id: int

    area_name: str = Field(
        ...,
        min_length=1,
        max_length=255
    )


class AreaUpdate(BaseModel):
    route_id: Optional[int] = None

    area_name: Optional[str] = Field(
        None,
        min_length=1,
        max_length=255
    )


class AreaResponse(BaseModel):
    area_id: int
    route_id: int
    area_name: str


# ============================================================
# CLIENT
# ============================================================

class ClientCreate(BaseModel):
    area_id: int

    client_name: str = Field(
        ...,
        min_length=1,
        max_length=255
    )
    shop_name: str = Field(
        ...,
        min_length=1,
        max_length=255
    )

    address: str = Field(
        ...,
        min_length=1
    )

    phone_number: Optional[str] = None
    shop_picture_url: Optional[str] = None

    previous_balance: float = 0.0
    route_sequence: int = 0


class ClientUpdate(BaseModel):
    area_id: Optional[int] = None

    client_name: Optional[str] = Field(
        None,
        min_length=1,
        max_length=255
    )
    shop_name: Optional[str] = Field(
        None,
        min_length=1,
        max_length=255
    )

    address: Optional[str] = Field(
        None,
        min_length=1
    )

    phone_number: Optional[str] = None
    shop_picture_url: Optional[str] = None

    previous_balance: Optional[float] = None
    route_sequence: Optional[int] = None


class ClientResponse(BaseModel):
    client_id: int
    area_id: int
    client_name: str
    shop_name: str
    address: str
    phone_number: Optional[str] = None
    shop_picture_url: Optional[str] = None
    previous_balance: float
    route_sequence: int = 0
    created_at: str
    area_name: Optional[str] = None
    route_name: Optional[str] = None
    assigned_day: Optional[str] = None


# ============================================================
# ORDER
# ============================================================

class OrderCreate(BaseModel):
    client_id: int

    order_date: Optional[str] = None

    gross_amount: float = Field(
        0.0,
        ge=0
    )

    discount: float = Field(
        0.0,
        ge=0
    )

    net_total: float = Field(
        0.0,
        ge=0
    )
    payment_amount: float = Field(0.0, ge=0)
    payment_status: str = "pending" # 'pending', 'paid', 'partial'
    delivery_status: str = "pending" # 'pending', 'delivering', 'delivered', 'shop_closed'
    outsourced_flag: bool = False
    previous_balance_at_order: float = 0.0
    new_balance_after_order: float = 0.0
    route_id: Optional[int] = None          # which route was active during order collection
    idempotency_key: Optional[str] = None  # UUID from frontend to prevent duplicate orders


class OrderUpdate(BaseModel):
    client_id: Optional[int] = None
    order_date: Optional[str] = None

    gross_amount: Optional[float] = Field(
        None,
        ge=0
    )

    discount: Optional[float] = Field(
        None,
        ge=0
    )

    net_total: Optional[float] = Field(
        None,
        ge=0
    )
    payment_amount: Optional[float] = Field(None, ge=0)
    payment_status: Optional[str] = None
    delivery_status: Optional[str] = None
    outsourced_flag: Optional[bool] = None
    previous_balance_at_order: Optional[float] = None
    new_balance_after_order: Optional[float] = None


class OrderResponse(BaseModel):
    order_id: int
    client_id: int
    client_name: Optional[str] = None
    shop_name: Optional[str] = None
    area_name: Optional[str] = None
    route_name: Optional[str] = None
    route_sequence: Optional[int] = None
    order_date: str
    gross_amount: float
    discount: float
    net_total: float
    payment_amount: float = 0.0
    payment_status: str = "pending"
    delivery_status: str = "pending"
    outsourced_flag: bool = False
    previous_balance_at_order: float = 0.0
    new_balance_after_order: float = 0.0
    route_id: Optional[int] = None
    idempotency_key: Optional[str] = None


# ============================================================
# ORDER ITEM
# ============================================================

class OrderItemCreate(BaseModel):
    order_id: int
    product_id: int

    quantity: int = Field(
        ...,
        gt=0
    )

    unit_price: float = Field(
        ...,
        ge=0
    )
    unit_type: str = "bundle" # 'packet', 'bundle', 'bundle_mix'
    procurement_status: str = "internal" # 'internal', 'outsourced'
    bundle_mix_details: Optional[str] = None # JSON string if mixed bundle


class OrderItemUpdate(BaseModel):
    order_id: Optional[int] = None
    product_id: Optional[int] = None

    quantity: Optional[int] = Field(
        None,
        gt=0
    )

    unit_price: Optional[float] = Field(
        None,
        ge=0
    )
    unit_type: Optional[str] = None
    procurement_status: Optional[str] = None
    bundle_mix_details: Optional[str] = None


class OrderItemResponse(BaseModel):
    item_id: int
    order_id: int
    product_id: int
    product_name: Optional[str] = None
    quantity: int
    unit_price: float
    unit_type: str = "bundle"
    procurement_status: str = "internal"
    bundle_mix_details: Optional[str] = None


# ============================================================
# INVENTORY & MOVEMENTS
# ============================================================

class StockAdjustment(BaseModel):
    product_id: int
    change_qty: int
    movement_type: str = "adjustment" # 'purchase', 'order_reserve', 'delivery', 'adjustment', 'return', 'outsource'
    notes: Optional[str] = None


class InventoryResponse(BaseModel):
    product_id: int
    product_name: str
    brand_name: Optional[str] = None
    current_qty: int
    reserved_qty: int
    available_qty: int
    min_stock_level: int = 10
    is_arshad_foods: bool = False


class InventoryMovementResponse(BaseModel):
    movement_id: int
    product_id: int
    product_name: Optional[str] = None
    change_qty: int
    movement_type: str
    reference_id: Optional[int] = None
    notes: Optional[str] = None
    created_at: str


# ============================================================
# WHATSAPP INTENT
# ============================================================

class WhatsAppItem(BaseModel):
    product_id: Optional[int] = None
    product_name: Optional[str] = None
    quantity: int = Field(..., gt=0)
    unit_type: str = "bundle"


class WhatsAppIntentRequest(BaseModel):
    intent: str # 'create_order', 'check_stock', 'client_balance'
    client_id: Optional[int] = None
    shop_name: Optional[str] = None
    items: Optional[List[WhatsAppItem]] = None


class WhatsAppIntentResponse(BaseModel):
    success: bool
    intent: str
    message: str
    data: Optional[Dict[str, Any]] = None


# ============================================================
# APP VERSION
# ============================================================

class VersionCheckResponse(BaseModel):
    latest_version: str = "1.0.0"
    min_supported_version: str = "1.0.0"
    mandatory_update: bool = False
    download_url: Optional[str] = None