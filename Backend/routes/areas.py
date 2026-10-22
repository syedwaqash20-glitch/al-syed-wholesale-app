import sqlite3
from typing import Any, Dict
from fastapi import APIRouter, Depends, HTTPException, status

from database import get_db
from models import AreaCreate, AreaUpdate, AreaResponse

router = APIRouter(
    prefix="/areas",  # Automatically prepends /areas to all endpoints below
    tags=["Areas"]    # Groups endpoints neatly under 'Areas' in Swagger docs (/docs)
)






# ============================================================
# ============================================================
# AREAS CRUD
# ============================================================
# ============================================================

def row_to_dict(row: Any) -> Dict[str, Any]:
    """
    Safely converts a sqlite3 row (tuple or sqlite3.Row) into a dictionary.
    Handles JOIN queries by mapping indexed elements or keys appropriately.
    """
    if row is None:
        return {}
    if hasattr(row, 'keys'):
        return dict(row)
    
    # Fallback for plain tuples based on length/context
    if len(row) == 4:
        # Check if the query returned (area_id, route_id, route_name, area_name)
        # or (area_id, route_id, area_name, created_at)
        return {
            "area_id": row[0],
            "route_id": row[1],
            "route_name": row[2] if isinstance(row[2], str) else None,
            "area_name": row[3] if len(row) > 3 else row[2],
        }
    return {
        "area_id": row[0],
        "route_id": row[1],
        "area_name": row[2]
    }

@router.get("", include_in_schema=False)
@router.get("/")
@router.get("/areas", include_in_schema=False)
def get_areas(db: sqlite3.Connection = Depends(get_db)):
    cursor = db.cursor()

    cursor.execute("""
        SELECT
            a.area_id,
            a.route_id,
            r.route_name,
            a.area_name
        FROM areas a
        INNER JOIN routes r
            ON a.route_id = r.route_id
        ORDER BY a.area_id;
    """)

    areas = cursor.fetchall()

    return {
        "success": True,
        "count": len(areas),
        "areas": [row_to_dict(row) for row in areas],
    }


@router.get("/{area_id}")
@router.get("/areas/{area_id}", include_in_schema=False)
def get_area(
    area_id: int,
    db: sqlite3.Connection = Depends(get_db)
):
    cursor = db.cursor()

    cursor.execute("""
        SELECT
            a.area_id,
            a.route_id,
            r.route_name,
            a.area_name
        FROM areas a
        INNER JOIN routes r
            ON a.route_id = r.route_id
        WHERE a.area_id = ?;
    """, (area_id,))

    area = cursor.fetchone()

    if area is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Area not found."
        )

    return {
        "success": True,
        "area": row_to_dict(area)
    }


@router.post("", include_in_schema=False, status_code=status.HTTP_201_CREATED)
@router.post("/", status_code=status.HTTP_201_CREATED)
@router.post("/areas", include_in_schema=False, status_code=status.HTTP_201_CREATED)
def create_area(
    area: AreaCreate,
    db: sqlite3.Connection = Depends(get_db)
):
    cursor = db.cursor()

    # Validate Route existence
    cursor.execute("""
        SELECT route_id
        FROM routes
        WHERE route_id = ?;
    """, (area.route_id,))

    if cursor.fetchone() is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Route not found."
        )

    area_name = area.area_name.strip() if area.area_name else ""
    if not area_name:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Area name cannot be empty."
        )

    try:
        cursor.execute("""
            INSERT INTO areas (
                route_id,
                area_name
            )
            VALUES (?, ?);
        """, (
            area.route_id,
            area_name
        ))

        db.commit()
        area_id = cursor.lastrowid

    except (sqlite3.IntegrityError, RuntimeError):
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Area already exists on this route."
        )

    # Fetch created record with join for consistent output
    cursor.execute("""
        SELECT
            a.area_id,
            a.route_id,
            r.route_name,
            a.area_name
        FROM areas a
        INNER JOIN routes r
            ON a.route_id = r.route_id
        WHERE a.area_id = ?;
    """, (area_id,))

    new_area = cursor.fetchone()

    return {
        "success": True,
        "message": "Area created successfully.",
        "area": row_to_dict(new_area)
    }


@router.put("/{area_id}")
@router.put("/areas/{area_id}", include_in_schema=False)
def update_area(
    area_id: int,
    area: AreaUpdate,
    db: sqlite3.Connection = Depends(get_db)
):
    cursor = db.cursor()

    cursor.execute("""
        SELECT
            area_id,
            route_id,
            area_name
        FROM areas
        WHERE area_id = ?;
    """, (area_id,))

    existing = cursor.fetchone()

    if existing is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Area not found."
        )

    existing_dict = row_to_dict(existing)

    route_id = (
        area.route_id
        if area.route_id is not None
        else existing_dict.get("route_id")
    )

    raw_area_name = (
        area.area_name
        if area.area_name is not None
        else existing_dict.get("area_name")
    )
    area_name = raw_area_name.strip() if raw_area_name else ""

    if not area_name:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Area name cannot be empty."
        )

    # Check target route existence
    cursor.execute("""
        SELECT route_id
        FROM routes
        WHERE route_id = ?;
    """, (route_id,))

    if cursor.fetchone() is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Route not found."
        )

    try:
        cursor.execute("""
            UPDATE areas
            SET
                route_id = ?,
                area_name = ?
            WHERE area_id = ?;
        """, (
            route_id,
            area_name,
            area_id
        ))

        db.commit()

    except (sqlite3.IntegrityError, RuntimeError):
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Area already exists on this route."
        )

    cursor.execute("""
        SELECT
            a.area_id,
            a.route_id,
            r.route_name,
            a.area_name
        FROM areas a
        INNER JOIN routes r
            ON a.route_id = r.route_id
        WHERE a.area_id = ?;
    """, (area_id,))

    updated = cursor.fetchone()

    return {
        "success": True,
        "message": "Area updated successfully.",
        "area": row_to_dict(updated)
    }


@router.delete("/{area_id}")
@router.delete("/areas/{area_id}", include_in_schema=False)
def delete_area(
    area_id: int,
    db: sqlite3.Connection = Depends(get_db)
):
    cursor = db.cursor()

    cursor.execute("""
        SELECT
            area_id,
            route_id,
            area_name
        FROM areas
        WHERE area_id = ?;
    """, (area_id,))

    existing = cursor.fetchone()

    if existing is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Area not found."
        )

    try:
        cursor.execute("""
            DELETE FROM areas
            WHERE area_id = ?;
        """, (area_id,))

        db.commit()

    except sqlite3.IntegrityError:
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=(
                "This area cannot be deleted because "
                "clients are associated with it."
            )
        )

    return {
        "success": True,
        "message": "Area deleted successfully.",
        "deleted_area": row_to_dict(existing)
    }
