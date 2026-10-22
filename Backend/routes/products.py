import sqlite3
from fastapi import APIRouter, Depends, HTTPException, status

from database import get_db
from models import ProductCreate, ProductUpdate, ProductResponse

router = APIRouter(
    prefix="/products",  # Automatically prepends /products to all endpoints below
    tags=["Products"]    # Groups endpoints neatly under 'Products' in Swagger docs (/docs)
)








# ============================================================
# ============================================================
# PRODUCTS CRUD
# ============================================================
# ============================================================


# Setup helper function to safely map SQLite rows/tuples to dictionaries
def product_row_to_dict(row):
    """Converts product SQL rows or tuples into a dictionary."""
    if row is None:
        return None
    if isinstance(row, sqlite3.Row):
        return dict(row)
    if isinstance(row, (list, tuple)):
        if len(row) >= 11:
            return {
                "product_id": row[0],
                "brand_id": row[1],
                "brand_name": row[2],
                "category_id": row[3],
                "category_name": row[4],
                "product_name": row[5],
                "base_price": row[6] or row[7] or 580,
                "bundle_price": row[7] or row[6] or 580,
                "packet_price": row[8] or round((row[7] or 580)/6),
                "packet_conversion_qty": row[9] or 6,
                "is_arshad_foods": bool(row[10])
            }
        elif len(row) == 7:
            return {
                "product_id": row[0],
                "brand_id": row[1],
                "brand_name": row[2],
                "category_id": row[3],
                "category_name": row[4],
                "product_name": row[5],
                "base_price": row[6],
                "bundle_price": row[6],
                "packet_price": round(row[6]/6),
                "packet_conversion_qty": 6,
                "is_arshad_foods": False
            }
        elif len(row) == 5:
            return {
                "product_id": row[0],
                "brand_id": row[1],
                "category_id": row[2],
                "product_name": row[3],
                "base_price": row[4],
                "bundle_price": row[4],
                "packet_price": round(row[4]/6),
                "packet_conversion_qty": 6,
                "is_arshad_foods": False
            }
    return row


@router.get("", include_in_schema=False)
@router.get("/")
@router.get("/products", include_in_schema=False)
def get_products(
    db: sqlite3.Connection = Depends(get_db)
):
    cursor = db.cursor()

    cursor.execute("""
        SELECT
            p.product_id,
            p.brand_id,
            b.brand_name,
            p.category_id,
            c.category_name,
            p.product_name,
            p.base_price,
            p.bundle_price,
            p.packet_price,
            p.packet_conversion_qty,
            p.is_arshad_foods
        FROM products p
        LEFT JOIN brands b
            ON p.brand_id = b.brand_id
        LEFT JOIN categories c
            ON p.category_id = c.category_id
        ORDER BY p.product_id DESC;
    """)

    products = cursor.fetchall()

    return {
        "success": True,
        "count": len(products),
        "products": [product_row_to_dict(row) for row in products]
    }


@router.get("/{product_id}")
@router.get("/products/{product_id}", include_in_schema=False)
def get_product(
    product_id: int,
    db: sqlite3.Connection = Depends(get_db)
):
    cursor = db.cursor()

    cursor.execute("""
        SELECT
            p.product_id,
            p.brand_id,
            b.brand_name,
            p.category_id,
            c.category_name,
            p.product_name,
            p.base_price,
            p.bundle_price,
            p.packet_price,
            p.packet_conversion_qty,
            p.is_arshad_foods
        FROM products p
        LEFT JOIN brands b
            ON p.brand_id = b.brand_id
        LEFT JOIN categories c
            ON p.category_id = c.category_id
        WHERE p.product_id = ?;
    """, (product_id,))

    product = cursor.fetchone()

    if product is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Product not found."
        )

    return {
        "success": True,
        "product": product_row_to_dict(product)
    }



@router.post("", include_in_schema=False, status_code=status.HTTP_201_CREATED)
@router.post("/", status_code=status.HTTP_201_CREATED)
@router.post("/products", include_in_schema=False, status_code=status.HTTP_201_CREATED)
def create_product(
    product: ProductCreate,
    db: sqlite3.Connection = Depends(get_db)
):
    cursor = db.cursor()

    # Resolve Brand ID
    brand_id = product.brand_id
    if not brand_id and product.brand_name:
        cursor.execute("SELECT brand_id FROM brands WHERE LOWER(brand_name) = LOWER(?);", (product.brand_name.strip(),))
        row = cursor.fetchone()
        if row:
            brand_id = row[0]
        else:
            cursor.execute("INSERT INTO brands (brand_name) VALUES (?);", (product.brand_name.strip(),))
            brand_id = cursor.lastrowid
    if not brand_id:
        cursor.execute("SELECT brand_id FROM brands LIMIT 1;")
        row = cursor.fetchone()
        brand_id = row[0] if row else 1

    # Resolve Category ID
    category_id = product.category_id
    cat_name = product.category_name.strip() if product.category_name else 'General'
    if not category_id:
        cursor.execute("SELECT category_id FROM categories WHERE LOWER(category_name) = LOWER(?);", (cat_name,))
        row = cursor.fetchone()
        if row:
            category_id = row[0]
        else:
            cursor.execute("INSERT INTO categories (category_name) VALUES (?);", (cat_name,))
            category_id = cursor.lastrowid

    try:
        cursor.execute("""
            INSERT INTO products (
                brand_id,
                category_id,
                product_name,
                base_price,
                bundle_price,
                packet_price,
                is_arshad_foods
            )
            VALUES (?, ?, ?, ?, ?, ?, ?);
        """, (
            brand_id,
            category_id,
            product.product_name.strip(),
            product.base_price or product.bundle_price or 580,
            product.bundle_price or product.base_price or 580,
            product.packet_price or Math.round((product.base_price or 580)/6) if 'Math' in locals() else round((product.base_price or 580)/6),
            1 if product.is_arshad_foods else 0
        ))

        product_id = cursor.lastrowid

        # Automatically create linked inventory entry
        init_qty = product.initial_stock or 100
        cursor.execute("""
            INSERT INTO inventory (product_id, current_qty, reserved_qty, available_qty, min_stock_level)
            VALUES (?, ?, 0, ?, 5);
        """, (product_id, init_qty, init_qty))

        db.commit()

    except sqlite3.IntegrityError:
        db.rollback()


        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=(
                "A product with this name already exists "
                "under this brand."
            )
        )

    cursor.execute("""
        SELECT
            p.product_id,
            p.brand_id,
            b.brand_name,
            p.category_id,
            c.category_name,
            p.product_name,
            p.base_price
        FROM products p
        INNER JOIN brands b
            ON p.brand_id = b.brand_id
        INNER JOIN categories c
            ON p.category_id = c.category_id
        WHERE p.product_id = ?;
    """, (product_id,))

    new_product = cursor.fetchone()

    return {
        "success": True,
        "message": "Product created successfully.",
        "product": product_row_to_dict(new_product)
    }


@router.put("/{product_id}")
@router.put("/products/{product_id}", include_in_schema=False)
def update_product(
    product_id: int,
    product: ProductUpdate,
    db: sqlite3.Connection = Depends(get_db)
):
    cursor = db.cursor()

    cursor.execute("""
        SELECT
            product_id,
            brand_id,
            category_id,
            product_name,
            base_price,
            bundle_price,
            packet_price,
            packet_conversion_qty,
            is_arshad_foods
        FROM products
        WHERE product_id = ?;
    """, (product_id,))

    existing_row = cursor.fetchone()

    if existing_row is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Product not found."
        )

    # Resolve Brand ID if brand_name string is provided
    brand_id = product.brand_id
    if not brand_id and product.brand_name:
        cursor.execute("SELECT brand_id FROM brands WHERE LOWER(brand_name) = LOWER(?);", (product.brand_name.strip(),))
        row = cursor.fetchone()
        if row:
            brand_id = row[0]
        else:
            cursor.execute("INSERT INTO brands (brand_name) VALUES (?);", (product.brand_name.strip(),))
            brand_id = cursor.lastrowid
    if not brand_id:
        brand_id = existing_row[1]

    # Resolve Category ID if category_name string is provided
    category_id = product.category_id
    if not category_id and product.category_name:
        cat_name = product.category_name.strip()
        cursor.execute("SELECT category_id FROM categories WHERE LOWER(category_name) = LOWER(?);", (cat_name,))
        row = cursor.fetchone()
        if row:
            category_id = row[0]
        else:
            cursor.execute("INSERT INTO categories (category_name) VALUES (?);", (cat_name,))
            category_id = cursor.lastrowid
    if not category_id:
        category_id = existing_row[2]

    product_name = product.product_name.strip() if product.product_name is not None else existing_row[3]
    base_price = product.base_price if product.base_price is not None else existing_row[4]
    bundle_price = product.bundle_price if product.bundle_price is not None else (existing_row[5] or base_price)
    packet_price = product.packet_price if product.packet_price is not None else (existing_row[6] or round(bundle_price / 6))
    is_arshad = 1 if product.is_arshad_foods else (existing_row[8] if product.is_arshad_foods is not None else 0)

    try:
        cursor.execute("""
            UPDATE products
            SET
                brand_id = ?,
                category_id = ?,
                product_name = ?,
                base_price = ?,
                bundle_price = ?,
                packet_price = ?,
                is_arshad_foods = ?
            WHERE product_id = ?;
        """, (
            brand_id,
            category_id,
            product_name,
            base_price,
            bundle_price,
            packet_price,
            is_arshad,
            product_id
        ))

        db.commit()

    except (sqlite3.IntegrityError, RuntimeError):
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Error updating product in database."
        )

    cursor.execute("""
        SELECT
            p.product_id,
            p.brand_id,
            b.brand_name,
            p.category_id,
            c.category_name,
            p.product_name,
            p.base_price,
            p.bundle_price,
            p.packet_price,
            p.packet_conversion_qty,
            p.is_arshad_foods
        FROM products p
        LEFT JOIN brands b
            ON p.brand_id = b.brand_id
        LEFT JOIN categories c
            ON p.category_id = c.category_id
        WHERE p.product_id = ?;
    """, (product_id,))

    updated = cursor.fetchone()

    return {
        "success": True,
        "message": "Product updated successfully in Cloud database.",
        "product": product_row_to_dict(updated)
    }



@router.delete("/{product_id}")
@router.delete("/products/{product_id}", include_in_schema=False)
def delete_product(
    product_id: int,
    db: sqlite3.Connection = Depends(get_db)
):
    cursor = db.cursor()

    cursor.execute("""
        SELECT
            product_id,
            brand_id,
            category_id,
            product_name,
            base_price
        FROM products
        WHERE product_id = ?;
    """, (product_id,))

    existing_row = cursor.fetchone()

    if existing_row is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Product not found."
        )

    try:
        cursor.execute("DELETE FROM inventory WHERE product_id = ?;", (product_id,))
        cursor.execute("DELETE FROM products WHERE product_id = ?;", (product_id,))
        db.commit()
    except (sqlite3.IntegrityError, RuntimeError):
        db.rollback()

        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=(
                "This product cannot be deleted because "
                "it is being used in an order."
            )
        )

    return {
        "success": True,
        "message": "Product deleted successfully.",
        "deleted_product": product_row_to_dict(existing_row)
    }