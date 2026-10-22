import sqlite3
from fastapi import APIRouter, Depends, HTTPException, status

from database import get_db
from models import CategoryCreate, CategoryUpdate, CategoryResponse

router = APIRouter(
    prefix="/categories",  # Automatically prepends /categories to all endpoints below
    tags=["Categories"]    # Groups endpoints neatly under 'Categories' in Swagger docs (/docs)
)




# ============================================================
# ============================================================
# CATEGORIES CRUD
# ============================================================
# ============================================================

# Setup helper function to safely map SQLite rows/tuples to dictionaries
def row_to_dict(row):
    """Converts a SQLite row or tuple into a dictionary."""
    if row is None:
        return None
    if isinstance(row, sqlite3.Row):
        return dict(row)
    if isinstance(row, tuple):
        # Assumes the standard query order: category_id, category_name
        return {
            "category_id": row[0],
            "category_name": row[1]
        }
    return row




@router.get("", include_in_schema=False)
@router.get("/")
@router.get("/categories", include_in_schema=False)
def get_categories(
    db: sqlite3.Connection = Depends(get_db)
):
    cursor = db.cursor()
    cursor.execute("""
        SELECT
            category_id,
            category_name
        FROM categories
        ORDER BY category_id;
    """)
    categories = cursor.fetchall()

    return {
        "success": True,
        "count": len(categories),
        "categories": [row_to_dict(row) for row in categories]
    }


# ------------------------------------------------------------
# GET ONE CATEGORY
# ------------------------------------------------------------

@router.get("/{category_id}")
@router.get("/categories/{category_id}", include_in_schema=False)
def get_category(
    category_id: int,
    db: sqlite3.Connection = Depends(get_db)
):
    cursor = db.cursor()
    cursor.execute("""
        SELECT
            category_id,
            category_name
        FROM categories
        WHERE category_id = ?;
    """, (category_id,))

    category = cursor.fetchone()

    if category is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Category not found."
        )

    return {
        "success": True,
        "category": row_to_dict(category)
    }


# ------------------------------------------------------------
# CREATE CATEGORY
# ------------------------------------------------------------

@router.post("", include_in_schema=False, status_code=status.HTTP_201_CREATED)
@router.post("/", status_code=status.HTTP_201_CREATED)
@router.post("/categories", include_in_schema=False, status_code=status.HTTP_201_CREATED)
def create_category(
    category: CategoryCreate,
    db: sqlite3.Connection = Depends(get_db)
):
    category_name = category.category_name.strip()

    if not category_name:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Category name cannot be empty or whitespace only."
        )

    cursor = db.cursor()

    try:
        cursor.execute("""
            INSERT INTO categories (category_name)
            VALUES (?);
        """, (category_name,))

        db.commit()
        category_id = cursor.lastrowid

    except sqlite3.IntegrityError:
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Category name already exists."
        )

    cursor.execute("""
        SELECT
            category_id,
            category_name
        FROM categories
        WHERE category_id = ?;
    """, (category_id,))

    new_category = cursor.fetchone()

    return {
        "success": True,
        "message": "Category created successfully.",
        "category": row_to_dict(new_category)
    }


# ------------------------------------------------------------
# UPDATE CATEGORY
# ------------------------------------------------------------

@router.put("/{category_id}")
@router.put("/categories/{category_id}", include_in_schema=False)
def update_category(
    category_id: int,
    category: CategoryUpdate,
    db: sqlite3.Connection = Depends(get_db)
):
    cursor = db.cursor()

    cursor.execute("""
        SELECT
            category_id,
            category_name
        FROM categories
        WHERE category_id = ?;
    """, (category_id,))

    existing = cursor.fetchone()

    if existing is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Category not found."
        )

    if category.category_name is None:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Provide category_name to update."
        )

    clean_category_name = category.category_name.strip()

    if not clean_category_name:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Category name cannot be empty or whitespace only."
        )

    try:
        cursor.execute("""
            UPDATE categories
            SET category_name = ?
            WHERE category_id = ?;
        """, (clean_category_name, category_id))

        db.commit()

    except sqlite3.IntegrityError:
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Category name already exists."
        )

    cursor.execute("""
        SELECT
            category_id,
            category_name
        FROM categories
        WHERE category_id = ?;
    """, (category_id,))

    updated = cursor.fetchone()

    return {
        "success": True,
        "message": "Category updated successfully.",
        "category": row_to_dict(updated)
    }


# ------------------------------------------------------------
# DELETE CATEGORY
# ------------------------------------------------------------

@router.delete("/{category_id}")
@router.delete("/categories/{category_id}", include_in_schema=False)
def delete_category(
    category_id: int,
    db: sqlite3.Connection = Depends(get_db)
):
    cursor = db.cursor()

    cursor.execute("""
        SELECT
            category_id,
            category_name
        FROM categories
        WHERE category_id = ?;
    """, (category_id,))

    existing = cursor.fetchone()

    if existing is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Category not found."
        )

    try:
        cursor.execute("""
            DELETE FROM categories
            WHERE category_id = ?;
        """, (category_id,))

        db.commit()

    except sqlite3.IntegrityError:
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=(
                "This category cannot be deleted because "
                "products are associated with it."
            )
        )

    return {
        "success": True,
        "message": "Category deleted successfully.",
        "deleted_category": row_to_dict(existing)
    }
