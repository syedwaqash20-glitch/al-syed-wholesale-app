import sqlite3
from fastapi import APIRouter, Depends, HTTPException, status
from typing import Any, Dict
from database import get_db
from models import OrderItemCreate, OrderItemUpdate

router = APIRouter(
    prefix="/order-items",  # Automatically prepends /order-items to all endpoints below
    tags=["Order Items"]    # Groups endpoints neatly under 'Order Items' in Swagger docs (/docs)
)



# ============================================================
# ============================================================
# ORDER ITEMS CRUD
# ============================================================
# ============================================================


def row_to_dict(row: Any, keys: list) -> Dict[str, Any]:
    """
    Safely converts a sqlite3 row (tuple or sqlite3.Row) into a dictionary
    using the provided column key names.
    """
    if row is None:
        return {}
    if isinstance(row, sqlite3.Row):
        return dict(row)
    return {key: row[idx] for idx, key in enumerate(keys)}


ORDER_ITEM_JOINED_KEYS = [
    "item_id",
    "order_id",
    "product_id",
    "product_name",
    "quantity",
    "unit_price",
]

ORDER_ITEM_BASE_KEYS = [
    "item_id",
    "order_id",
    "product_id",
    "quantity",
    "unit_price",
]


@router.get("/order-items")
def get_order_items(db: sqlite3.Connection = Depends(get_db)):
    cursor = db.cursor()

    cursor.execute("""
        SELECT
            oi.item_id,
            oi.order_id,
            oi.product_id,
            p.product_name,
            oi.quantity,
            oi.unit_price
        FROM order_items oi
        INNER JOIN products p
            ON oi.product_id = p.product_id
        ORDER BY oi.item_id;
    """)

    items = cursor.fetchall()

    return {
        "success": True,
        "count": len(items),
        "order_items": [
            row_to_dict(item, ORDER_ITEM_JOINED_KEYS) for item in items
        ],
    }


@router.get("/order-items/{item_id}")
def get_order_item(
    item_id: int,
    db: sqlite3.Connection = Depends(get_db)
):
    cursor = db.cursor()

    cursor.execute("""
        SELECT
            oi.item_id,
            oi.order_id,
            oi.product_id,
            p.product_name,
            oi.quantity,
            oi.unit_price
        FROM order_items oi
        INNER JOIN products p
            ON oi.product_id = p.product_id
        WHERE oi.item_id = ?;
    """, (item_id,))

    item = cursor.fetchone()

    if item is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Order item not found."
        )

    return {
        "success": True,
        "order_item": row_to_dict(item, ORDER_ITEM_JOINED_KEYS)
    }


@router.post(
    "/order-items",
    status_code=status.HTTP_201_CREATED
)
def create_order_item(
    item: OrderItemCreate,
    db: sqlite3.Connection = Depends(get_db)
):
    cursor = db.cursor()

    # Validate parent order
    cursor.execute("""
        SELECT order_id
        FROM orders
        WHERE order_id = ?;
    """, (item.order_id,))

    if cursor.fetchone() is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Order not found."
        )

    # Validate target product
    cursor.execute("""
        SELECT product_id
        FROM products
        WHERE product_id = ?;
    """, (item.product_id,))

    if cursor.fetchone() is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Product not found."
        )

    try:
        cursor.execute("""
            INSERT INTO order_items (
                order_id,
                product_id,
                quantity,
                unit_price
            )
            VALUES (?, ?, ?, ?);
        """, (
            item.order_id,
            item.product_id,
            item.quantity,
            item.unit_price
        ))

        item_id = cursor.lastrowid

        # Deduct inventory stock for target product (allows negative stock e.g. -5)
        cursor.execute("""
            UPDATE inventory
            SET
                current_qty = current_qty - ?,
                available_qty = available_qty - ?
            WHERE product_id = ?;
        """, (item.quantity, item.quantity, item.product_id))


        # Record stock movement log
        cursor.execute("""
            INSERT INTO inventory_movements (product_id, change_qty, movement_type, notes)
            VALUES (?, ?, 'sale', ?);
        """, (item.product_id, -item.quantity, f"Order #{item.order_id} placement (-{item.quantity})"))

        db.commit()

    except sqlite3.IntegrityError as e:
        db.rollback()

        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"Database integrity violation: {str(e)}"
        )

    # Fetch newly inserted item joined with product details
    cursor.execute("""
        SELECT
            oi.item_id,
            oi.order_id,
            oi.product_id,
            p.product_name,
            oi.quantity,
            oi.unit_price
        FROM order_items oi
        INNER JOIN products p
            ON oi.product_id = p.product_id
        WHERE oi.item_id = ?;
    """, (item_id,))

    new_item = cursor.fetchone()

    return {
        "success": True,
        "message": "Order item created successfully.",
        "order_item": row_to_dict(new_item, ORDER_ITEM_JOINED_KEYS)
    }


@router.put("/order-items/{item_id}")
def update_order_item(
    item_id: int,
    item: OrderItemUpdate,
    db: sqlite3.Connection = Depends(get_db)
):
    cursor = db.cursor()

    cursor.execute("""
        SELECT
            item_id,
            order_id,
            product_id,
            quantity,
            unit_price
        FROM order_items
        WHERE item_id = ?;
    """, (item_id,))

    existing = cursor.fetchone()

    if existing is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Order item not found."
        )

    existing_dict = row_to_dict(existing, ORDER_ITEM_BASE_KEYS)

    order_id = (
        item.order_id
        if item.order_id is not None
        else existing_dict.get("order_id")
    )

    product_id = (
        item.product_id
        if item.product_id is not None
        else existing_dict.get("product_id")
    )

    quantity = (
        item.quantity
        if item.quantity is not None
        else existing_dict.get("quantity")
    )

    unit_price = (
        item.unit_price
        if item.unit_price is not None
        else existing_dict.get("unit_price")
    )

    # Validate parent order
    cursor.execute("""
        SELECT order_id
        FROM orders
        WHERE order_id = ?;
    """, (order_id,))

    if cursor.fetchone() is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Order not found."
        )

    # Validate target product
    cursor.execute("""
        SELECT product_id
        FROM products
        WHERE product_id = ?;
    """, (product_id,))

    if cursor.fetchone() is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Product not found."
        )

    try:
        cursor.execute("""
            UPDATE order_items
            SET
                order_id = ?,
                product_id = ?,
                quantity = ?,
                unit_price = ?
            WHERE item_id = ?;
        """, (
            order_id,
            product_id,
            quantity,
            unit_price,
            item_id
        ))

        db.commit()

    except sqlite3.IntegrityError as e:
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"Database integrity violation: {str(e)}"
        )

    cursor.execute("""
        SELECT
            oi.item_id,
            oi.order_id,
            oi.product_id,
            p.product_name,
            oi.quantity,
            oi.unit_price
        FROM order_items oi
        INNER JOIN products p
            ON oi.product_id = p.product_id
        WHERE oi.item_id = ?;
    """, (item_id,))

    updated = cursor.fetchone()

    return {
        "success": True,
        "message": "Order item updated successfully.",
        "order_item": row_to_dict(updated, ORDER_ITEM_JOINED_KEYS)
    }


@router.delete("/order-items/{item_id}")
def delete_order_item(
    item_id: int,
    db: sqlite3.Connection = Depends(get_db)
):
    cursor = db.cursor()

    cursor.execute("""
        SELECT
            oi.item_id,
            oi.order_id,
            oi.product_id,
            p.product_name,
            oi.quantity,
            oi.unit_price
        FROM order_items oi
        INNER JOIN products p
            ON oi.product_id = p.product_id
        WHERE oi.item_id = ?;
    """, (item_id,))

    existing = cursor.fetchone()

    if existing is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Order item not found."
        )

    try:
        cursor.execute("""
            DELETE FROM order_items
            WHERE item_id = ?;
        """, (item_id,))

        db.commit()

    except sqlite3.IntegrityError as e:
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"Could not delete order item: {str(e)}"
        )

    return {
        "success": True,
        "message": "Order item deleted successfully.",
        "deleted_order_item": row_to_dict(existing, ORDER_ITEM_JOINED_KEYS)
    }

