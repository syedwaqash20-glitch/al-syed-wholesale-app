import sqlite3
from typing import Any, Dict
from fastapi import APIRouter, Depends, HTTPException, status

from database import get_db
from models import ClientCreate, ClientUpdate, ClientResponse

router = APIRouter(
    prefix="/clients",
    tags=["Clients"]
)


def row_to_dict(row: Any, is_joined: bool = False) -> Dict[str, Any]:
    if row is None:
        return {}
    if hasattr(row, 'keys'):
        return dict(row)

    if is_joined:
        return {
            "client_id": row[0],
            "area_id": row[1],
            "area_name": row[2],
            "client_name": row[3],
            "shop_name": row[4] if row[4] else row[3],
            "address": row[5],
            "phone_number": row[6],
            "shop_picture_url": row[7],
            "previous_balance": row[8],
            "route_sequence": row[9],
            "created_at": row[10],
            "route_name": row[11] if len(row) > 11 else None,
            "assigned_day": row[12] if len(row) > 12 else None,
        }

    return {
        "client_id": row[0],
        "area_id": row[1],
        "client_name": row[2],
        "shop_name": row[3] if len(row) > 3 else row[2],
        "address": row[4] if len(row) > 4 else "",
        "phone_number": row[5] if len(row) > 5 else None,
        "shop_picture_url": row[6] if len(row) > 6 else None,
        "previous_balance": row[7] if len(row) > 7 else 0.0,
        "route_sequence": row[8] if len(row) > 8 else 0,
        "created_at": row[9] if len(row) > 9 else None,
    }


@router.get("", include_in_schema=False)
@router.get("/")
@router.get("/clients", include_in_schema=False)
def get_clients(db: sqlite3.Connection = Depends(get_db)):
    cursor = db.cursor()

    cursor.execute("""
        SELECT
            c.client_id,
            c.area_id,
            a.area_name,
            c.client_name,
            COALESCE(c.shop_name, c.client_name) AS shop_name,
            c.address,
            c.phone_number,
            c.shop_picture_url,
            c.previous_balance,
            COALESCE(c.route_sequence, 0) AS route_sequence,
            c.created_at,
            r.route_name,
            r.assigned_day
        FROM clients c
        INNER JOIN areas a ON c.area_id = a.area_id
        LEFT JOIN routes r ON a.route_id = r.route_id
        ORDER BY c.client_id ASC;

    """)

    clients = cursor.fetchall()

    return {
        "success": True,
        "count": len(clients),
        "clients": [row_to_dict(row, is_joined=True) for row in clients],
    }


@router.get("/{client_id}")
@router.get("/clients/{client_id}", include_in_schema=False)
def get_client(
    client_id: int,
    db: sqlite3.Connection = Depends(get_db)
):
    cursor = db.cursor()

    cursor.execute("""
        SELECT
            c.client_id,
            c.area_id,
            a.area_name,
            c.client_name,
            COALESCE(c.shop_name, c.client_name) AS shop_name,
            c.address,
            c.phone_number,
            c.shop_picture_url,
            c.previous_balance,
            COALESCE(c.route_sequence, 0) AS route_sequence,
            c.created_at,
            r.route_name,
            r.assigned_day
        FROM clients c
        INNER JOIN areas a ON c.area_id = a.area_id
        LEFT JOIN routes r ON a.route_id = r.route_id
        WHERE c.client_id = ?;
    """, (client_id,))

    client = cursor.fetchone()

    if client is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Client not found."
        )

    return {
        "success": True,
        "client": row_to_dict(client, is_joined=True)
    }


@router.post("", include_in_schema=False, status_code=status.HTTP_201_CREATED)
@router.post("/", status_code=status.HTTP_201_CREATED)
@router.post("/clients", include_in_schema=False, status_code=status.HTTP_201_CREATED)
def create_client(
    client: ClientCreate,
    db: sqlite3.Connection = Depends(get_db)
):
    cursor = db.cursor()

    cursor.execute("""
        SELECT area_id FROM areas WHERE area_id = ?;
    """, (client.area_id,))

    if cursor.fetchone() is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Area not found."
        )

    client_name = client.client_name.strip() if client.client_name else ""
    shop_name = client.shop_name.strip() if client.shop_name else client_name

    if not client_name:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Client name cannot be empty."
        )

    try:
        cursor.execute("""
            INSERT INTO clients (
                area_id,
                client_name,
                shop_name,
                address,
                phone_number,
                shop_picture_url,
                previous_balance,
                route_sequence
            )
            VALUES (?, ?, ?, ?, ?, ?, ?, ?);
        """, (
            client.area_id,
            client_name,
            shop_name,
            client.address.strip() if client.address else "",
            client.phone_number,
            client.shop_picture_url,
            client.previous_balance,
            client.route_sequence
        ))

        db.commit()
        client_id = cursor.lastrowid

    except (sqlite3.IntegrityError, RuntimeError) as e:
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"Database integrity error: {str(e)}"
        )

    cursor.execute("""
        SELECT
            c.client_id,
            c.area_id,
            a.area_name,
            c.client_name,
            COALESCE(c.shop_name, c.client_name) AS shop_name,
            c.address,
            c.phone_number,
            c.shop_picture_url,
            c.previous_balance,
            COALESCE(c.route_sequence, 0) AS route_sequence,
            c.created_at,
            r.route_name,
            r.assigned_day
        FROM clients c
        INNER JOIN areas a ON c.area_id = a.area_id
        LEFT JOIN routes r ON a.route_id = r.route_id
        WHERE c.client_id = ?;
    """, (client_id,))

    new_client = cursor.fetchone()

    return {
        "success": True,
        "message": "Client created successfully.",
        "client": row_to_dict(new_client, is_joined=True)
    }


@router.put("/{client_id}")
@router.put("/clients/{client_id}", include_in_schema=False)
def update_client(
    client_id: int,
    client: ClientUpdate,
    db: sqlite3.Connection = Depends(get_db)
):
    cursor = db.cursor()

    cursor.execute("""
        SELECT client_id, area_id, client_name, shop_name, address, phone_number, shop_picture_url, previous_balance, route_sequence
        FROM clients
        WHERE client_id = ?;
    """, (client_id,))

    existing = cursor.fetchone()

    if existing is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Client not found."
        )

    area_id = client.area_id if client.area_id is not None else existing[1]
    client_name = client.client_name.strip() if client.client_name is not None else existing[2]
    shop_name = client.shop_name.strip() if client.shop_name is not None else (existing[3] or client_name)
    address = client.address.strip() if client.address is not None else existing[4]
    phone_number = client.phone_number if client.phone_number is not None else existing[5]
    shop_picture_url = client.shop_picture_url if client.shop_picture_url is not None else existing[6]
    previous_balance = client.previous_balance if client.previous_balance is not None else existing[7]
    route_sequence = client.route_sequence if client.route_sequence is not None else existing[8]

    try:
        cursor.execute("""
            UPDATE clients
            SET
                area_id = ?,
                client_name = ?,
                shop_name = ?,
                address = ?,
                phone_number = ?,
                shop_picture_url = ?,
                previous_balance = ?,
                route_sequence = ?
            WHERE client_id = ?;
        """, (
            area_id,
            client_name,
            shop_name,
            address,
            phone_number,
            shop_picture_url,
            previous_balance,
            route_sequence,
            client_id
        ))

        db.commit()

    except (sqlite3.IntegrityError, RuntimeError) as e:
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"Database integrity error: {str(e)}"
        )

    cursor.execute("""
        SELECT
            c.client_id,
            c.area_id,
            a.area_name,
            c.client_name,
            COALESCE(c.shop_name, c.client_name) AS shop_name,
            c.address,
            c.phone_number,
            c.shop_picture_url,
            c.previous_balance,
            COALESCE(c.route_sequence, 0) AS route_sequence,
            c.created_at,
            r.route_name,
            r.assigned_day
        FROM clients c
        INNER JOIN areas a ON c.area_id = a.area_id
        LEFT JOIN routes r ON a.route_id = r.route_id
        WHERE c.client_id = ?;
    """, (client_id,))

    updated = cursor.fetchone()

    return {
        "success": True,
        "message": "Client updated successfully.",
        "client": row_to_dict(updated, is_joined=True)
    }


@router.delete("/{client_id}")
@router.delete("/clients/{client_id}", include_in_schema=False)
def delete_client(
    client_id: int,
    db: sqlite3.Connection = Depends(get_db)
):
    cursor = db.cursor()

    cursor.execute("SELECT client_id, client_name FROM clients WHERE client_id = ?;", (client_id,))
    existing = cursor.fetchone()

    if existing is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Client not found."
        )

    try:
        cursor.execute("DELETE FROM clients WHERE client_id = ?;", (client_id,))
        db.commit()

    except (sqlite3.IntegrityError, RuntimeError):
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="This client cannot be deleted because dependent records exist."
        )

    return {
        "success": True,
        "message": "Client deleted successfully."
    }


@router.get("/{client_id}/orders")
@router.get("/clients/{client_id}/orders", include_in_schema=False)
def get_client_orders(client_id: int, db: sqlite3.Connection = Depends(get_db)):
    """
    Returns all orders for a specific client, newest first.
    Each order includes its line items for the Client History screen.
    """
    cursor = db.cursor()

    # Verify client exists
    cursor.execute("SELECT client_id, client_name, shop_name FROM clients WHERE client_id = ?;", (client_id,))
    client = cursor.fetchone()
    if not client:
        raise HTTPException(status_code=404, detail="Client not found.")

    cursor.execute("SELECT previous_balance FROM clients WHERE client_id = ?;", (client_id,))
    current_balance = cursor.fetchone()[0] or 0.0

    cursor.execute("""
        SELECT
            o.order_id,
            o.order_date,
            o.gross_amount,
            o.discount,
            o.net_total,
            o.payment_amount,
            o.payment_status,
            o.delivery_status,
            o.previous_balance_at_order,
            o.new_balance_after_order
        FROM orders o
        WHERE o.client_id = ?
        ORDER BY o.order_id DESC;
    """, (client_id,))

    orders = cursor.fetchall()
    order_list = []

    for o in orders:
        order_id = o[0]

        # Fetch items for each order
        cursor.execute("""
            SELECT
                oi.item_id, oi.product_id, p.product_name,
                oi.quantity, oi.unit_price, oi.unit_type,
                oi.procurement_status
            FROM order_items oi
            INNER JOIN products p ON oi.product_id = p.product_id
            WHERE oi.order_id = ?
            ORDER BY oi.item_id;
        """, (order_id,))
        items = cursor.fetchall()

        order_list.append({
            "order_id": o[0],
            "order_date": o[1],
            "gross_amount": o[2],
            "discount": o[3],
            "net_total": o[4],
            "payment_amount": o[5],
            "payment_status": o[6],
            "delivery_status": o[7],
            "previous_balance_at_order": o[8],
            "new_balance_after_order": o[9],
            "items": [
                {
                    "item_id": i[0],
                    "product_id": i[1],
                    "product_name": i[2],
                    "quantity": i[3],
                    "unit_price": i[4],
                    "unit_type": i[5],
                    "procurement_status": i[6],
                    "subtotal": i[3] * i[4],
                }
                for i in items
            ],
        })

    return {
        "success": True,
        "client_id": client_id,
        "client_name": client[1],
        "shop_name": client[2] or client[1],
        "current_balance": current_balance,
        "count": len(order_list),
        "orders": order_list,
    }