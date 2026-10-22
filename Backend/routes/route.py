import sqlite3
from datetime import datetime, timezone
from typing import Any, Dict, Generator, List
from fastapi import APIRouter, Depends, HTTPException, status

from database import get_db
from models import RouteCreate, RouteUpdate, RouteResponse

router = APIRouter(
    prefix="/routes",
    tags=["Routes"]
)

# ─── Day-of-week helper ─────────────────────────────────────────────────────
WEEKDAY_NAMES = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"]


# ============================================================
# GET /routes/today — auto-detect today's route by weekday
# ============================================================
@router.get("/today")
def get_today_route(db: sqlite3.Connection = Depends(get_db)):
    """
    Returns the route assigned to today's weekday.
    The frontend calls this on startup to pre-load the active route
    without requiring the user to manually select a day.
    """
    # Use local server time or system time for accurate day-of-week detection in local timezone
    today_name = WEEKDAY_NAMES[datetime.now().weekday()]

    cursor = db.cursor()

    cursor.execute("""
        SELECT route_id, route_name, assigned_day, created_at
        FROM routes
        WHERE assigned_day = ?
        LIMIT 1;
    """, (today_name,))

    route = cursor.fetchone()

    if route is None:
        # No route configured for today — return a graceful response, not a 404
        return {
            "success": True,
            "today": today_name,
            "route": None,
            "message": f"No route configured for {today_name}.",
        }

    route_id = route[0]

    # Also return client count for this route
    cursor.execute("""
        SELECT COUNT(c.client_id)
        FROM clients c
        INNER JOIN areas a ON c.area_id = a.area_id
        WHERE a.route_id = ?;
    """, (route_id,))
    client_count = cursor.fetchone()[0]

    return {
        "success": True,
        "today": today_name,
        "route": {
            "route_id": route[0],
            "route_name": route[1],
            "assigned_day": route[2],
            "created_at": route[3],
            "client_count": client_count,
        }
    }


# ============================================================
# GET /routes/{route_id}/clients — all clients on a route in sequence
# ============================================================
@router.get("/{route_id}/clients")
def get_route_clients(route_id: int, db: sqlite3.Connection = Depends(get_db)):
    """
    Returns all clients assigned to a specific route, ordered by
    route_sequence so the salesperson visits them in the correct order.
    """
    cursor = db.cursor()

    # Verify route exists
    cursor.execute("SELECT route_id, route_name, assigned_day FROM routes WHERE route_id = ?;", (route_id,))
    route = cursor.fetchone()
    if not route:
        raise HTTPException(status_code=404, detail="Route not found.")

    cursor.execute("""
        SELECT
            c.client_id,
            c.area_id,
            a.area_name,
            c.client_name,
            COALESCE(c.shop_name, c.client_name) AS shop_name,
            c.address,
            c.phone_number,
            c.previous_balance,
            COALESCE(c.route_sequence, 0) AS route_sequence,
            c.created_at,
            r.route_name,
            r.assigned_day
        FROM clients c
        INNER JOIN areas a ON c.area_id = a.area_id
        INNER JOIN routes r ON a.route_id = r.route_id
        WHERE r.route_id = ?
        ORDER BY COALESCE(c.route_sequence, 0) ASC, c.client_id ASC;
    """, (route_id,))

    rows = cursor.fetchall()
    clients = []
    for r in rows:
        clients.append({
            "client_id": r[0],
            "area_id": r[1],
            "area_name": r[2],
            "client_name": r[3],
            "shop_name": r[4],
            "address": r[5],
            "phone_number": r[6],
            "previous_balance": r[7],
            "route_sequence": r[8],
            "created_at": r[9],
            "route_name": r[10],
            "assigned_day": r[11],
        })

    return {
        "success": True,
        "route_id": route_id,
        "route_name": route[1],
        "assigned_day": route[2],
        "count": len(clients),
        "clients": clients,
    }


# ============================================================
# GET /routes/{route_id}/delivery-queue — route-ordered pending deliveries
# ============================================================
@router.get("/{route_id}/delivery-queue")
def get_route_delivery_queue(route_id: int, db: sqlite3.Connection = Depends(get_db)):
    """
    Returns all orders for clients on this route, ordered by the client's
    database route_sequence. The frontend can filter pending, completed, and
    outstanding states without losing route ownership.
    This powers the Delivery screen — the salesperson sees shops in route order.
    """
    cursor = db.cursor()

    cursor.execute("SELECT route_id, route_name FROM routes WHERE route_id = ?;", (route_id,))
    if not cursor.fetchone():
        raise HTTPException(status_code=404, detail="Route not found.")

    cursor.execute("""
        SELECT
            o.order_id,
            o.client_id,
            c.client_name,
            COALESCE(c.shop_name, c.client_name) AS shop_name,
            c.address,
            c.phone_number,
            a.area_name,
            COALESCE(c.route_sequence, 0) AS route_sequence,
            o.order_date,
            o.gross_amount,
            o.discount,
            o.net_total,
            o.payment_amount,
            o.payment_status,
            o.delivery_status,
            o.outsourced_flag,
            o.previous_balance_at_order,
            o.new_balance_after_order,
            COALESCE(r.route_id, o.route_id) AS route_id,
            r.route_name
        FROM orders o
        INNER JOIN clients c ON o.client_id = c.client_id
        INNER JOIN areas a ON c.area_id = a.area_id
        INNER JOIN routes r ON a.route_id = r.route_id
                WHERE r.route_id = ?
        ORDER BY COALESCE(c.route_sequence, 0) ASC, o.order_id ASC;
    """, (route_id,))

    rows = cursor.fetchall()
    queue = []
    for r in rows:
        queue.append({
            "order_id": r[0],
            "client_id": r[1],
            "client_name": r[2],
            "shop_name": r[3],
            "address": r[4],
            "phone_number": r[5],
            "area_name": r[6],
            "route_sequence": r[7],
            "order_date": r[8],
            "gross_amount": r[9],
            "discount": r[10],
            "net_total": r[11],
            "payment_amount": r[12],
            "payment_status": r[13],
            "delivery_status": r[14],
            "outsourced_flag": bool(r[15]),
            "previous_balance_at_order": r[16],
            "new_balance_after_order": r[17],
            "route_id": r[18],
            "route_name": r[19],
        })

    return {
        "success": True,
        "route_id": route_id,
        "count": len(queue),
        "queue": queue,
    }



VALID_DAYS = {
    "Monday",
    "Tuesday",
    "Wednesday",
    "Thursday",
    "Friday",
    "Saturday",
    "Sunday"
}



# ============================================================
# ============================================================
# ROUTES CRUD
# ============================================================
# ============================================================


def row_to_dict(row: Any) -> Dict[str, Any]:
    """
    Safely converts a database row into a dictionary.
    Supports both sqlite3.Row mapping objects and standard positional tuples.
    """
    if row is None:
        return {}
    if hasattr(row, 'keys'):
        return dict(row)
    return {
        "route_id": row[0],
        "route_name": row[1],
        "assigned_day": row[2],
        "created_at": row[3],
    }


@router.get("", include_in_schema=False)
@router.get("/")
@router.get("/routes", include_in_schema=False)
def get_routes(db: sqlite3.Connection = Depends(get_db)):
    cursor = db.cursor()

    cursor.execute("""
        SELECT
            route_id,
            route_name,
            assigned_day,
            created_at
        FROM routes
        ORDER BY route_id;
    """)

    routes = cursor.fetchall()

    return {
        "success": True,
        "count": len(routes),
        "routes": [row_to_dict(row) for row in routes],
    }


@router.get("/{route_id}")
@router.get("/routes/{route_id}", include_in_schema=False)
def get_route(route_id: int, db: sqlite3.Connection = Depends(get_db)):
    cursor = db.cursor()

    cursor.execute("""
        SELECT
            route_id,
            route_name,
            assigned_day,
            created_at
        FROM routes
        WHERE route_id = ?;
    """, (route_id,))

    route = cursor.fetchone()

    if route is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Route not found."
        )

    return {"success": True, "route": row_to_dict(route)}


@router.post("", include_in_schema=False, status_code=status.HTTP_201_CREATED)
@router.post("/", status_code=status.HTTP_201_CREATED)
@router.post("/routes", include_in_schema=False, status_code=status.HTTP_201_CREATED)
def create_route(
    route: RouteCreate, db: sqlite3.Connection = Depends(get_db)
):
    route_name = route.route_name.strip() if route.route_name else ""

    if not route_name:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Route name cannot be empty."
        )

    if route.assigned_day not in VALID_DAYS:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid assigned day."
        )

    cursor = db.cursor()

    try:
        cursor.execute("""
            INSERT INTO routes (
                route_name,
                assigned_day
            )
            VALUES (?, ?);
        """, (
            route_name,
            route.assigned_day,
        ))

        db.commit()
        route_id = cursor.lastrowid

        # Auto-create default area named after the route so area selection is never blocked
        cursor.execute("""
            INSERT INTO areas (route_id, area_name)
            VALUES (?, ?);
        """, (route_id, route_name))
        db.commit()

    except (sqlite3.IntegrityError, RuntimeError):
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Route already exists."
        )

    cursor.execute("""
        SELECT
            route_id,
            route_name,
            assigned_day,
            created_at
        FROM routes
        WHERE route_id = ?;
    """, (route_id,))

    new_route = cursor.fetchone()

    return {
        "success": True,
        "message": "Route created successfully.",
        "route": row_to_dict(new_route),
    }



@router.put("/{route_id}")
@router.put("/routes/{route_id}", include_in_schema=False)
def update_route(
    route_id: int,
    route: RouteUpdate,
    db: sqlite3.Connection = Depends(get_db),
):
    cursor = db.cursor()

    cursor.execute("""
        SELECT
            route_id,
            route_name,
            assigned_day,
            created_at
        FROM routes
        WHERE route_id = ?;
    """, (route_id,))

    existing = cursor.fetchone()

    if existing is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Route not found."
        )

    existing_dict = row_to_dict(existing)

    raw_name = (
        route.route_name
        if route.route_name is not None
        else existing_dict["route_name"]
    )
    route_name = raw_name.strip() if raw_name is not None else ""

    assigned_day = (
        route.assigned_day
        if route.assigned_day is not None
        else existing_dict["assigned_day"]
    )

    if not route_name:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Route name cannot be empty."
        )

    if assigned_day not in VALID_DAYS:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid assigned day."
        )

    try:
        cursor.execute("""
            UPDATE routes
            SET
                route_name = ?,
                assigned_day = ?
            WHERE route_id = ?;
        """, (
            route_name,
            assigned_day,
            route_id,
        ))

        db.commit()

    except (sqlite3.IntegrityError, RuntimeError):
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Route already exists."
        )

    cursor.execute("""
        SELECT
            route_id,
            route_name,
            assigned_day,
            created_at
        FROM routes
        WHERE route_id = ?;
    """, (route_id,))

    updated = cursor.fetchone()

    return {
        "success": True,
        "message": "Route updated successfully.",
        "route": row_to_dict(updated),
    }


@router.delete("/{route_id}")
@router.delete("/routes/{route_id}", include_in_schema=False)
def delete_route(route_id: int, db: sqlite3.Connection = Depends(get_db)):
    cursor = db.cursor()

    cursor.execute("""
        SELECT
            route_id,
            route_name,
            assigned_day,
            created_at
        FROM routes
        WHERE route_id = ?;
    """, (route_id,))

    existing = cursor.fetchone()

    if existing is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Route not found."
        )

    try:
        cursor.execute("""
            DELETE FROM routes
            WHERE route_id = ?;
        """, (route_id,))

        db.commit()

    except (sqlite3.IntegrityError, RuntimeError) as e:
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"Could not delete route because linked records exist: {str(e)}",
        )

    return {
        "success": True,
        "message": "Route deleted successfully.",
        "deleted_route": row_to_dict(existing),
    }
