import sqlite3
from fastapi import APIRouter, Depends, HTTPException, status

from database import get_db
from models import BrandCreate, BrandResponse, BrandUpdate

router = APIRouter(
    prefix="/brands",  # Automatically prepends /brands to all endpoints below
    tags=["Brands"]    # Groups endpoints neatly under 'Brands' in Swagger docs (/docs)
)

# ============================================================
# BRANDS CRUD
# ============================================================

# ------------------------------------------------------------
# GET ALL BRANDS (URL: GET /brands)
# ------------------------------------------------------------

@router.get("/", response_model=None)
def get_brands(
    db: sqlite3.Connection = Depends(get_db)
):
    cursor = db.cursor()

    cursor.execute("""
        SELECT
            brand_id,
            brand_name
        FROM brands
        ORDER BY brand_id;
    """)

    brands = cursor.fetchall()

    # Safely handle both sqlite3.Row and raw tuple types:
    formatted_brands = []
    for row in brands:
        if isinstance(row, sqlite3.Row):
            formatted_brands.append(dict(row))
        else:
            # Fallback when row_factory is not set (tuples)
            formatted_brands.append({
                "brand_id": row[0],
                "brand_name": row[1]
            })

    return {
        "success": True,
        "count": len(formatted_brands),
        "brands": formatted_brands
    }

# ------------------------------------------------------------
# GET ONE BRAND (URL: GET /brands/{brand_id})
# ------------------------------------------------------------

@router.get("/{brand_id}")
def get_brand(
    brand_id: int,
    db: sqlite3.Connection = Depends(get_db)
):
    cursor = db.cursor()
    cursor.execute("""
        SELECT
            brand_id,
            brand_name
        FROM brands
        WHERE brand_id = ?;
    """, (brand_id,))

    brand = cursor.fetchone()

    if brand is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Brand not found."
        )

    # Convert safely regardless of whether row_factory is set
    brand_dict = dict(brand) if isinstance(brand, sqlite3.Row) else {
        "brand_id": brand[0],
        "brand_name": brand[1]
    }

    return {
        "success": True,
        "brand": brand_dict
    }

# ------------------------------------------------------------
# CREATE BRAND (URL: POST /brands)
# ------------------------------------------------------------

@router.post(
    "/",
    status_code=status.HTTP_201_CREATED
)
def create_brand(
    brand: BrandCreate,
    db: sqlite3.Connection = Depends(get_db)
):
    brand_name = brand.brand_name.strip()

    if not brand_name:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Brand name cannot be empty or whitespace only."
        )

    cursor = db.cursor()

    try:
        cursor.execute("""
            INSERT INTO brands (brand_name)
            VALUES (?);
        """, (brand_name,))

        db.commit()

        brand_id = cursor.lastrowid

        cursor.execute("""
            SELECT
                brand_id,
                brand_name
            FROM brands
            WHERE brand_id = ?;
        """, (brand_id,))

        new_brand = cursor.fetchone()

        if isinstance(new_brand, sqlite3.Row):
            brand_dict = dict(new_brand)
        else:
            brand_dict = {
                "brand_id": new_brand[0],
                "brand_name": new_brand[1]
            }

        return {
            "success": True,
            "message": "Brand created successfully.",
            "brand": brand_dict
        }

    except (sqlite3.IntegrityError, RuntimeError):
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Brand name already exists."
        )

# ------------------------------------------------------------
# UPDATE BRAND (URL: PUT /brands/{brand_id})
# ------------------------------------------------------------

@router.put("/{brand_id}")
def update_brand(
    brand_id: int,
    brand: BrandUpdate,
    db: sqlite3.Connection = Depends(get_db)
):
    cursor = db.cursor()

    cursor.execute("""
        SELECT
            brand_id,
            brand_name
        FROM brands
        WHERE brand_id = ?;
    """, (brand_id,))

    existing = cursor.fetchone()

    if existing is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Brand not found."
        )

    if brand.brand_name is None:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Provide brand_name to update."
        )

    clean_brand_name = brand.brand_name.strip()

    if not clean_brand_name:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Brand name cannot be empty or whitespace only."
        )

    try:
        cursor.execute("""
            UPDATE brands
            SET brand_name = ?
            WHERE brand_id = ?;
        """, (clean_brand_name, brand_id))

        db.commit()

    except (sqlite3.IntegrityError, RuntimeError):
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Brand name already exists."
        )

    cursor.execute("""
        SELECT
            brand_id,
            brand_name
        FROM brands
        WHERE brand_id = ?;
    """, (brand_id,))

    updated = cursor.fetchone()

    updated_dict = dict(updated) if isinstance(updated, sqlite3.Row) else {
        "brand_id": updated[0],
        "brand_name": updated[1]
    }

    return {
        "success": True,
        "message": "Brand updated successfully.",
        "brand": updated_dict
    }

# ------------------------------------------------------------
# DELETE BRAND (URL: DELETE /brands/{brand_id})
# ------------------------------------------------------------

@router.delete("/{brand_id}")
def delete_brand(
    brand_id: int,
    db: sqlite3.Connection = Depends(get_db)
):
    cursor = db.cursor()

    cursor.execute("""
        SELECT
            brand_id,
            brand_name
        FROM brands
        WHERE brand_id = ?;
    """, (brand_id,))

    existing = cursor.fetchone()

    if existing is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Brand not found."
        )

    try:
        cursor.execute("""
            DELETE FROM brands
            WHERE brand_id = ?;
        """, (brand_id,))

        db.commit()

    except (sqlite3.IntegrityError, RuntimeError):
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=(
                "This brand cannot be deleted because "
                "products are associated with it."
            )
        )

    deleted_dict = dict(existing) if isinstance(existing, sqlite3.Row) else {
        "brand_id": existing[0],
        "brand_name": existing[1]
    }

    return {
        "success": True,
        "message": "Brand deleted successfully.",
        "deleted_brand": deleted_dict
    }