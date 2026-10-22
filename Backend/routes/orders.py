import json
import sqlite3
from typing import Any, Dict
from fastapi import APIRouter, Depends, HTTPException, status

from database import get_db
from models import OrderCreate, OrderUpdate, OrderResponse

router = APIRouter(
    prefix="/orders",
    tags=["Orders"]
)


ORDER_JOINED_KEYS = [
    "order_id", "client_id", "client_name", "shop_name",
    "area_name", "route_name", "route_sequence",
    "order_date", "gross_amount", "discount", "net_total",
    "payment_amount", "payment_status", "delivery_status",
    "outsourced_flag", "previous_balance_at_order", "new_balance_after_order",
    "route_id", "idempotency_key",
]

ITEM_JOINED_KEYS = [
    "item_id", "order_id", "product_id", "product_name",
    "quantity", "unit_price", "unit_type", "procurement_status", "bundle_mix_details",
]


def row_to_dict(row: Any, keys: list) -> Dict[str, Any]:
    if row is None:
        return {}
    if hasattr(row, 'keys'):
        return dict(row)
    return {key: row[idx] for idx, key in enumerate(keys)}


ORDER_SELECT_SQL = """
    SELECT
        o.order_id,
        o.client_id,
        c.client_name,
        COALESCE(c.shop_name, c.client_name) AS shop_name,
        a.area_name,
        r.route_name,
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
        o.idempotency_key
    FROM orders o
    INNER JOIN clients c ON o.client_id = c.client_id
    INNER JOIN areas a ON c.area_id = a.area_id
    LEFT JOIN routes r ON a.route_id = r.route_id
"""


@router.get("", include_in_schema=False)
@router.get("/")
@router.get("/orders", include_in_schema=False)
def get_orders(db: sqlite3.Connection = Depends(get_db)):
    cursor = db.cursor()
    cursor.execute(ORDER_SELECT_SQL + " ORDER BY o.order_id ASC;")

    orders = cursor.fetchall()
    return {
        "success": True,
        "count": len(orders),
        "orders": [row_to_dict(row, ORDER_JOINED_KEYS) for row in orders],
    }


@router.get("/{order_id}")
@router.get("/orders/{order_id}", include_in_schema=False)
def get_order(order_id: int, db: sqlite3.Connection = Depends(get_db)):
    cursor = db.cursor()
    cursor.execute(ORDER_SELECT_SQL + " WHERE o.order_id = ?;", (order_id,))
    order = cursor.fetchone()
    if order is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Order not found.")

    cursor.execute("""
        SELECT
            oi.item_id, oi.order_id, oi.product_id, p.product_name,
            oi.quantity, oi.unit_price, oi.unit_type, oi.procurement_status, oi.bundle_mix_details
        FROM order_items oi
        INNER JOIN products p ON oi.product_id = p.product_id
        WHERE oi.order_id = ?
        ORDER BY oi.item_id;
    """, (order_id,))
    items = cursor.fetchall()

    return {
        "success": True,
        "order": row_to_dict(order, ORDER_JOINED_KEYS),
        "items": [row_to_dict(item, ITEM_JOINED_KEYS) for item in items],
    }



@router.post("", include_in_schema=False, status_code=status.HTTP_201_CREATED)
@router.post("/", status_code=status.HTTP_201_CREATED)
@router.post("/orders", include_in_schema=False, status_code=status.HTTP_201_CREATED)
def create_order(order: OrderCreate, db: sqlite3.Connection = Depends(get_db)):
    cursor = db.cursor()

    # ── Idempotency check ─────────────────────────────────────────────────
    # If the same idempotency_key is re-submitted (e.g. after a network retry),
    # return the existing order instead of creating a duplicate.
    if order.idempotency_key:
        cursor.execute("SELECT order_id FROM orders WHERE idempotency_key = ?;", (order.idempotency_key,))
        existing_idem = cursor.fetchone()
        if existing_idem:
            cursor.execute(ORDER_SELECT_SQL + " WHERE o.order_id = ?;", (existing_idem[0],))
            existing_order = cursor.fetchone()
            return {
                "success": True,
                "message": "Order already exists (idempotency match).",
                "order": row_to_dict(existing_order, ORDER_JOINED_KEYS)
            }

    # ── Client validation ─────────────────────────────────────────────────
    cursor.execute("SELECT client_id, previous_balance FROM clients WHERE client_id = ?;", (order.client_id,))
    client_res = cursor.fetchone()
    if client_res is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Client not found. Please select a valid client."
        )

    prev_bal = float(client_res[1] if client_res[1] is not None else 0.0)
    new_bal  = prev_bal + order.net_total - order.payment_amount
    payment_st = (
        "paid"    if order.payment_amount >= order.net_total and order.net_total > 0
        else "partial" if order.payment_amount > 0
        else "pending"
    )

    try:
        cursor.execute("""
            INSERT INTO orders (
                client_id, gross_amount, discount, net_total,
                payment_amount, payment_status, delivery_status, outsourced_flag,
                previous_balance_at_order, new_balance_after_order,
                route_id, idempotency_key
            )
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?);
        """, (
            order.client_id,
            order.gross_amount,
            order.discount,
            order.net_total,
            order.payment_amount,
            payment_st,
            order.delivery_status or "pending",
            1 if order.outsourced_flag else 0,
            prev_bal,
            new_bal,
            order.route_id,
            order.idempotency_key,
        ))
        db.commit()
        order_id = cursor.lastrowid

    except sqlite3.IntegrityError as e:
        db.rollback()
        # Could be idempotency_key unique constraint — handle gracefully
        if "idx_orders_idempotency" in str(e) or "idempotency" in str(e).lower():
            raise HTTPException(status_code=409, detail="Duplicate order submission detected.")
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=f"Database error: {str(e)}")

    cursor.execute(ORDER_SELECT_SQL + " WHERE o.order_id = ?;", (order_id,))
    new_order = cursor.fetchone()

    return {
        "success": True,
        "message": "Order created successfully.",
        "order": row_to_dict(new_order, ORDER_JOINED_KEYS)
    }



@router.put("/{order_id}")
@router.put("/orders/{order_id}", include_in_schema=False)
def update_order(
    order_id: int,
    order: OrderUpdate,
    db: sqlite3.Connection = Depends(get_db)
):
    cursor = db.cursor()

    cursor.execute("SELECT * FROM orders WHERE order_id = ?;", (order_id,))
    existing = cursor.fetchone()

    if existing is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Order not found."
        )

    # Save previous data for audit log
    cursor.execute("PRAGMA table_info(orders);")
    cols = [c[1] for c in cursor.fetchall()]
    prev_dict = dict(zip(cols, existing))

    client_id = order.client_id if order.client_id is not None else prev_dict["client_id"]
    gross_amount = order.gross_amount if order.gross_amount is not None else prev_dict["gross_amount"]
    discount = order.discount if order.discount is not None else prev_dict["discount"]
    net_total = order.net_total if order.net_total is not None else prev_dict["net_total"]
    payment_amount = order.payment_amount if order.payment_amount is not None else prev_dict.get("payment_amount", 0.0)
    delivery_status = order.delivery_status if order.delivery_status is not None else prev_dict.get("delivery_status", "pending")
    outsourced_flag = 1 if (order.outsourced_flag if order.outsourced_flag is not None else prev_dict.get("outsourced_flag", 0)) else 0

    cursor.execute("SELECT previous_balance FROM clients WHERE client_id = ?;", (client_id,))
    c_res = cursor.fetchone()
    prev_bal = c_res[0] if c_res else 0.0
    new_bal = prev_bal + net_total - payment_amount
    payment_st = "paid" if payment_amount >= net_total and net_total > 0 else ("partial" if payment_amount > 0 else "pending")

    try:
        cursor.execute("""
            UPDATE orders
            SET
                client_id = ?,
                gross_amount = ?,
                discount = ?,
                net_total = ?,
                payment_amount = ?,
                payment_status = ?,
                delivery_status = ?,
                outsourced_flag = ?,
                previous_balance_at_order = ?,
                new_balance_after_order = ?
            WHERE order_id = ?;
        """, (
            client_id,
            gross_amount,
            discount,
            net_total,
            payment_amount,
            payment_st,
            delivery_status,
            outsourced_flag,
            prev_bal,
            new_bal,
            order_id
        ))

        # Log edit audit trailing
        new_dict = {
            "client_id": client_id,
            "gross_amount": gross_amount,
            "discount": discount,
            "net_total": net_total,
            "payment_amount": payment_amount,
            "delivery_status": delivery_status,
            "outsourced_flag": outsourced_flag
        }
        cursor.execute("""
            INSERT INTO bill_edit_logs (order_id, edited_by, previous_data, new_data)
            VALUES (?, 'Admin', ?, ?);
        """, (order_id, json.dumps(prev_dict), json.dumps(new_dict)))

        # If delivery_status changed to 'delivered', update client balance
        if delivery_status == "delivered":
            cursor.execute("UPDATE clients SET previous_balance = ? WHERE client_id = ?;", (new_bal, client_id))

        db.commit()

    except sqlite3.IntegrityError as e:
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"Database integrity violation: {str(e)}"
        )

    cursor.execute("""
        SELECT
            o.order_id,
            o.client_id,
            c.client_name,
            COALESCE(c.shop_name, c.client_name) AS shop_name,
            o.order_date,
            o.gross_amount,
            o.discount,
            o.net_total,
            o.payment_amount,
            o.payment_status,
            o.delivery_status,
            o.outsourced_flag,
            o.previous_balance_at_order,
            o.new_balance_after_order
        FROM orders o
        INNER JOIN clients c ON o.client_id = c.client_id
        WHERE o.order_id = ?;
    """, (order_id,))

    updated = cursor.fetchone()

    return {
        "success": True,
        "message": "Order updated successfully.",
        "order": row_to_dict(updated, ORDER_JOINED_KEYS)
    }


@router.put("/{order_id}/delivery-status")
@router.put("/orders/{order_id}/delivery-status", include_in_schema=False)
def update_delivery_status(
    order_id: int,
    status_val: str,
    payment_amount: float | None = None,
    discount_amount: float | None = None,
    db: sqlite3.Connection = Depends(get_db)
):
    valid_statuses = ["pending", "delivering", "delivered", "shop_closed", "cancelled"]
    if status_val not in valid_statuses:
        raise HTTPException(status_code=400, detail=f"Invalid status. Must be one of: {valid_statuses}")
    if payment_amount is not None and payment_amount < 0:
        raise HTTPException(status_code=400, detail="Payment amount cannot be negative.")
    if discount_amount is not None and discount_amount < 0:
        raise HTTPException(status_code=400, detail="Discount amount cannot be negative.")

    cursor = db.cursor()
    cursor.execute(
        """
        SELECT client_id, net_total, payment_amount, delivery_status, discount, gross_amount, previous_balance_at_order, new_balance_after_order
        FROM orders
        WHERE order_id = ?;
        """,
        (order_id,)
    )
    order_res = cursor.fetchone()
    if not order_res:
        raise HTTPException(status_code=404, detail="Order not found.")

    client_id = order_res[0]
    old_net_total = float(order_res[1] or 0.0)
    old_payment = float(order_res[2] or 0.0)
    old_status = order_res[3]
    old_discount = float(order_res[4] or 0.0)
    gross_amount = float(order_res[5] or 0.0)
    prev_bal_at_order = float(order_res[6] or 0.0)
    old_bal_after_order = float(order_res[7] or 0.0)

    try:
        cursor.execute("BEGIN;")
        cursor.execute("SELECT previous_balance FROM clients WHERE client_id = ?;", (client_id,))
        client_res = cursor.fetchone()
        if not client_res:
            raise HTTPException(status_code=404, detail="Client not found.")
        
        client_current_balance = float(client_res[0] or 0.0)
        
        new_discount = float(discount_amount) if discount_amount is not None else old_discount
        new_net_total = gross_amount - new_discount
        new_payment = float(payment_amount) if payment_amount is not None else old_payment
        
        payment_status = (
            "paid" if new_payment >= new_net_total and new_net_total > 0
            else "partial" if new_payment > 0 else "pending"
        )

        client_new_balance = client_current_balance
        new_bal_after_order = old_bal_after_order
        new_prev_bal_at_order = prev_bal_at_order

        # State Machine for Balance Updates
        if status_val == "delivered" and old_status != "delivered":
            # CASE 1: First time marking as delivered
            # Lock the previous balance to the client's current balance
            new_prev_bal_at_order = client_current_balance
            new_bal_after_order = new_prev_bal_at_order + new_net_total - new_payment
            client_new_balance = new_bal_after_order
            
            # Inventory Deductions for first-time delivery
            cursor.execute("SELECT product_id, quantity, procurement_status FROM order_items WHERE order_id = ?;", (order_id,))
            for prod_id, qty, proc_status in cursor.fetchall():
                if proc_status == "outsourced":
                    cursor.execute("INSERT INTO inventory_movements (product_id, change_qty, movement_type, reference_id, notes) VALUES (?, ?, 'delivery_outsourced', ?, 'Delivered via external procurement');", (prod_id, -qty, order_id))
                else:
                    cursor.execute("UPDATE inventory SET current_qty = MAX(0, current_qty - ?), reserved_qty = MAX(0, reserved_qty - ?) WHERE product_id = ?;", (qty, qty, prod_id))
                    cursor.execute("INSERT INTO inventory_movements (product_id, change_qty, movement_type, reference_id, notes) VALUES (?, ?, 'delivery', ?, 'Delivered to client');", (prod_id, -qty, order_id))
                    
        elif status_val == "delivered" and old_status == "delivered":
            # CASE 2: Already delivered, updating payment or discount
            # Calculate the delta impact on the balance
            old_impact = old_net_total - old_payment
            new_impact = new_net_total - new_payment
            balance_delta = new_impact - old_impact
            
            client_new_balance = client_current_balance + balance_delta
            new_bal_after_order = prev_bal_at_order + new_net_total - new_payment
            
        elif status_val != "delivered" and old_status == "delivered":
            # CASE 3: Un-delivering an order (reverting)
            old_impact = old_net_total - old_payment
            client_new_balance = client_current_balance - old_impact
            new_prev_bal_at_order = 0.0
            new_bal_after_order = 0.0
            
            # Revert inventory
            cursor.execute("SELECT product_id, quantity, procurement_status FROM order_items WHERE order_id = ?;", (order_id,))
            for prod_id, qty, proc_status in cursor.fetchall():
                if proc_status == "outsourced":
                    cursor.execute("INSERT INTO inventory_movements (product_id, change_qty, movement_type, reference_id, notes) VALUES (?, ?, 'revert_outsourced', ?, 'Delivery reverted');", (prod_id, qty, order_id))
                else:
                    cursor.execute("UPDATE inventory SET current_qty = current_qty + ?, reserved_qty = reserved_qty + ? WHERE product_id = ?;", (qty, qty, prod_id))
                    cursor.execute("INSERT INTO inventory_movements (product_id, change_qty, movement_type, reference_id, notes) VALUES (?, ?, 'revert_delivery', ?, 'Delivery reverted');", (prod_id, qty, order_id))
        else:
            # CASE 4: Pending to Pending (just updating fields, no balance impact)
            pass

        # Update the Order
        cursor.execute("""
            UPDATE orders
            SET delivery_status = ?, discount = ?, net_total = ?, payment_amount = ?, payment_status = ?,
                previous_balance_at_order = ?, new_balance_after_order = ?
            WHERE order_id = ?;
        """, (status_val, new_discount, new_net_total, new_payment, payment_status, new_prev_bal_at_order, new_bal_after_order, order_id))

        # Update the Client Balance if changed
        if client_new_balance != client_current_balance:
            cursor.execute("UPDATE clients SET previous_balance = ? WHERE client_id = ?;", (client_new_balance, client_id))

        db.commit()
        
        # Fetch the fully updated order to return to the frontend
        cursor.execute(
            """
            SELECT o.*, c.client_name, c.shop_name, c.phone_number
            FROM orders o
            JOIN clients c ON o.client_id = c.client_id
            WHERE o.order_id = ?;
            """,
            (order_id,)
        )
        updated_order_row = cursor.fetchone()
        
    except HTTPException:
        db.rollback()
        raise
    except (sqlite3.Error, RuntimeError) as err:
        db.rollback()
        raise HTTPException(status_code=500, detail=f"Could not finalize delivery: {err}")

    # Helper to convert row to dict
    updated_order_dict = dict(updated_order_row) if updated_order_row else None

    return {
        "success": True,
        "message": f"Delivery status updated to {status_val}.",
        "order": updated_order_dict,
        "client_previous_balance": client_new_balance
    }


@router.put("/{order_id}/remaining-balance")
@router.put("/orders/{order_id}/remaining-balance", include_in_schema=False)
def update_remaining_balance(
    order_id: int,
    remaining_balance: float,
    db: sqlite3.Connection = Depends(get_db)
):
    """Set the exact outstanding balance for an already delivered bill."""
    if remaining_balance < 0:
        raise HTTPException(status_code=400, detail="Remaining balance cannot be negative.")

    cursor = db.cursor()
    cursor.execute("""
        SELECT client_id, net_total, payment_amount, delivery_status,
               previous_balance_at_order, new_balance_after_order
        FROM orders
        WHERE order_id = ?;
    """, (order_id,))
    existing = cursor.fetchone()
    if not existing:
        raise HTTPException(status_code=404, detail="Order not found.")
    if existing[3] != "delivered":
        raise HTTPException(status_code=400, detail="Only delivered bills can have their remaining balance updated.")

    client_id, net_total, old_payment, _, previous_balance, old_balance = existing
    new_payment = max(0.0, float(previous_balance or 0.0) + float(net_total or 0.0) - remaining_balance)
    payment_status = "paid" if remaining_balance == 0 else ("partial" if new_payment > 0 else "pending")

    try:
        cursor.execute("BEGIN;")
        cursor.execute("SELECT previous_balance FROM clients WHERE client_id = ?;", (client_id,))
        client = cursor.fetchone()
        if not client:
            raise HTTPException(status_code=404, detail="Client not found.")

        balance_delta = float(old_balance or 0.0) - remaining_balance
        client_balance = float(client[0] or 0.0) - balance_delta
        cursor.execute("""
            UPDATE orders
            SET payment_amount = ?, payment_status = ?, new_balance_after_order = ?
            WHERE order_id = ?;
        """, (new_payment, payment_status, remaining_balance, order_id))
        cursor.execute("UPDATE clients SET previous_balance = ? WHERE client_id = ?;", (client_balance, client_id))
        db.commit()
        cursor.execute("""
            SELECT o.*, c.client_name, c.shop_name, c.phone_number
            FROM orders o JOIN clients c ON o.client_id = c.client_id
            WHERE o.order_id = ?;
        """, (order_id,))
        updated = cursor.fetchone()
    except HTTPException:
        db.rollback()
        raise
    except (sqlite3.Error, RuntimeError) as err:
        db.rollback()
        raise HTTPException(status_code=500, detail=f"Could not update remaining balance: {err}")

    return {
        "success": True,
        "message": "Remaining balance updated successfully.",
        "order": dict(updated),
        "client_id": client_id,
        "client_previous_balance": client_balance,
    }


@router.put("/{order_id}/record-payment")
@router.put("/orders/{order_id}/record-payment", include_in_schema=False)
def record_delivery_payment(
    order_id: int,
    payment_today: float,
    db: sqlite3.Connection = Depends(get_db)
):
    """Record today's payment against the balance stored for this bill."""
    if payment_today < 0:
        raise HTTPException(status_code=400, detail="Payment cannot be negative.")

    cursor = db.cursor()
    cursor.execute("""
        SELECT client_id, payment_amount, new_balance_after_order, delivery_status
        FROM orders
        WHERE order_id = ?;
    """, (order_id,))
    existing = cursor.fetchone()
    if not existing:
        raise HTTPException(status_code=404, detail="Order not found.")
    if existing[3] != "delivered":
        raise HTTPException(status_code=400, detail="Payment can only be recorded for a delivered bill.")

    client_id, old_payment, database_remaining, _ = existing
    database_remaining = max(0.0, float(database_remaining or 0.0))
    payment_today = float(payment_today)
    applied_payment = min(payment_today, database_remaining)
    new_remaining = database_remaining - applied_payment
    new_payment = float(old_payment or 0.0) + applied_payment
    payment_status = "paid" if new_remaining == 0 else "partial"

    try:
        cursor.execute("BEGIN;")
        cursor.execute("SELECT previous_balance FROM clients WHERE client_id = ?;", (client_id,))
        client = cursor.fetchone()
        if not client:
            raise HTTPException(status_code=404, detail="Client not found.")
        client_balance = max(0.0, float(client[0] or 0.0) - applied_payment)
        cursor.execute("""
            UPDATE orders
            SET payment_amount = ?, payment_status = ?, new_balance_after_order = ?
            WHERE order_id = ?;
        """, (new_payment, payment_status, new_remaining, order_id))
        cursor.execute("UPDATE clients SET previous_balance = ? WHERE client_id = ?;", (client_balance, client_id))
        db.commit()
        cursor.execute("""
            SELECT o.*, c.client_name, c.shop_name, c.phone_number
            FROM orders o JOIN clients c ON o.client_id = c.client_id
            WHERE o.order_id = ?;
        """, (order_id,))
        updated = cursor.fetchone()
    except HTTPException:
        db.rollback()
        raise
    except (sqlite3.Error, RuntimeError) as err:
        db.rollback()
        raise HTTPException(status_code=500, detail=f"Could not record payment: {err}")

    return {
        "success": True,
        "message": "Delivery payment recorded successfully.",
        "order": dict(updated),
        "client_id": client_id,
        "payment_today": applied_payment,
        "client_previous_balance": client_balance,
    }



@router.delete("/{order_id}")
@router.delete("/orders/{order_id}", include_in_schema=False)
def delete_order(
    order_id: int,
    db: sqlite3.Connection = Depends(get_db)
):
    cursor = db.cursor()

    cursor.execute("""
        SELECT delivery_status, client_id, net_total, payment_amount 
        FROM orders 
        WHERE order_id = ?;
    """, (order_id,))
    existing = cursor.fetchone()

    if existing is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Order not found."
        )

    delivery_status, client_id, net_total, payment_amount = existing

    # Fetch order items to revert inventory
    cursor.execute("SELECT product_id, quantity, procurement_status FROM order_items WHERE order_id = ?;", (order_id,))
    items = cursor.fetchall()

    try:
        cursor.execute("BEGIN;")

        # Revert inventory
        for prod_id, qty, proc_status in items:
            if proc_status != "outsourced":
                if delivery_status == 'delivered':
                    # It was delivered, so current_qty was deducted. Add back to current and available.
                    cursor.execute("""
                        UPDATE inventory 
                        SET current_qty = current_qty + ?, 
                            available_qty = available_qty + ?
                        WHERE product_id = ?;
                    """, (qty, qty, prod_id))
                    cursor.execute("""
                        INSERT INTO inventory_movements (product_id, change_qty, movement_type, reference_id, notes)
                        VALUES (?, ?, 'revert_delete_delivery', ?, 'Order deleted (reverted delivery)');
                    """, (prod_id, qty, order_id))
                else:
                    # It was only pending/reserved. Revert reservation.
                    cursor.execute("""
                        UPDATE inventory 
                        SET reserved_qty = MAX(0, reserved_qty - ?), 
                            available_qty = available_qty + ?
                        WHERE product_id = ?;
                    """, (qty, qty, prod_id))
                    cursor.execute("""
                        INSERT INTO inventory_movements (product_id, change_qty, movement_type, reference_id, notes)
                        VALUES (?, ?, 'revert_delete_reserve', ?, 'Order deleted (reverted reservation)');
                    """, (prod_id, qty, order_id))

        # Revert client balance if it was delivered
        if delivery_status == 'delivered':
            cursor.execute("SELECT previous_balance FROM clients WHERE client_id = ?;", (client_id,))
            client_res = cursor.fetchone()
            if client_res:
                curr_bal = float(client_res[0] or 0.0)
                reverted_bal = curr_bal - float(net_total or 0.0) + float(payment_amount or 0.0)
                cursor.execute("UPDATE clients SET previous_balance = ? WHERE client_id = ?;", (reverted_bal, client_id))

        cursor.execute("DELETE FROM orders WHERE order_id = ?;", (order_id,))
        db.commit()

    except sqlite3.IntegrityError as e:
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"Could not delete order: {str(e)}"
        )

    return {
        "success": True,
        "message": "Order deleted successfully."
    }