import sqlite3
from typing import Any, Dict
from fastapi import APIRouter, Depends, HTTPException, status

from database import get_db
from models import WhatsAppIntentRequest, WhatsAppIntentResponse

router = APIRouter(
    prefix="/whatsapp",
    tags=["WhatsApp Bot"]
)


@router.post("/intent", response_model=WhatsAppIntentResponse)
def process_whatsapp_intent(
    req: WhatsAppIntentRequest,
    db: sqlite3.Connection = Depends(get_db)
):
    cursor = db.cursor()

    intent = req.intent.lower().strip()

    if intent == "create_order":
        if not req.client_id and not req.shop_name:
            return WhatsAppIntentResponse(
                success=False,
                intent=intent,
                message="Client identity missing. Please specify client_id or shop_name.",
                data=None
            )

        client_id = req.client_id
        if not client_id and req.shop_name:
            cursor.execute("""
                SELECT client_id, client_name, COALESCE(shop_name, client_name), previous_balance
                FROM clients
                WHERE shop_name LIKE ? OR client_name LIKE ?;
            """, (f"%{req.shop_name}%", f"%{req.shop_name}%"))
            client_row = cursor.fetchone()
            if not client_row:
                return WhatsAppIntentResponse(
                    success=False,
                    intent=intent,
                    message=f"Client or Shop '{req.shop_name}' not found.",
                    data=None
                )
            client_id, client_name, shop_name, prev_bal = client_row
        else:
            cursor.execute("SELECT client_id, client_name, COALESCE(shop_name, client_name), previous_balance FROM clients WHERE client_id = ?;", (client_id,))
            client_row = cursor.fetchone()
            if not client_row:
                return WhatsAppIntentResponse(
                    success=False,
                    intent=intent,
                    message=f"Client ID #{client_id} not found.",
                    data=None
                )
            client_id, client_name, shop_name, prev_bal = client_row

        if not req.items or len(req.items) == 0:
            return WhatsAppIntentResponse(
                success=False,
                intent=intent,
                message="No order items provided in WhatsApp intent.",
                data=None
            )

        order_items_to_create = []
        gross_total = 0.0
        outsourced_flag = False

        for item in req.items:
            p_id = item.product_id
            if not p_id and item.product_name:
                cursor.execute("SELECT product_id, product_name, base_price FROM products WHERE product_name LIKE ?;", (f"%{item.product_name}%",))
                p_row = cursor.fetchone()
                if not p_row:
                    return WhatsAppIntentResponse(
                        success=False,
                        intent=intent,
                        message=f"Product '{item.product_name}' not found.",
                        data=None
                    )
                p_id, p_name, u_price = p_row
            else:
                cursor.execute("SELECT product_id, product_name, base_price FROM products WHERE product_id = ?;", (p_id,))
                p_row = cursor.fetchone()
                if not p_row:
                    return WhatsAppIntentResponse(
                        success=False,
                        intent=intent,
                        message=f"Product ID #{p_id} not found.",
                        data=None
                    )
                p_id, p_name, u_price = p_row

            if u_price <= 0:
                return WhatsAppIntentResponse(
                    success=False,
                    intent=intent,
                    message=f"Price is missing for product '{p_name}'. Please set price before placing order.",
                    data=None
                )

            # Check stock
            cursor.execute("SELECT available_qty FROM inventory WHERE product_id = ?;", (p_id,))
            inv_row = cursor.fetchone()
            avail = inv_row[0] if inv_row else 100

            proc_status = "internal"
            if item.quantity > avail:
                proc_status = "outsourced"
                outsourced_flag = True

            line_total = item.quantity * u_price
            gross_total += line_total

            order_items_to_create.append({
                "product_id": p_id,
                "product_name": p_name,
                "quantity": item.quantity,
                "unit_price": u_price,
                "unit_type": item.unit_type,
                "procurement_status": proc_status
            })

        net_total = gross_total
        new_bal = prev_bal + net_total

        # Create Order
        cursor.execute("""
            INSERT INTO orders (
                client_id, gross_amount, discount, net_total, payment_amount, payment_status, delivery_status, outsourced_flag, previous_balance_at_order, new_balance_after_order
            ) VALUES (?, ?, 0.0, ?, 0.0, 'pending', 'pending', ?, ?, ?);
        """, (client_id, gross_total, net_total, 1 if outsourced_flag else 0, prev_bal, new_bal))

        order_id = cursor.lastrowid

        for oi in order_items_to_create:
            cursor.execute("""
                INSERT INTO order_items (order_id, product_id, quantity, unit_price, unit_type, procurement_status)
                VALUES (?, ?, ?, ?, ?, ?);
            """, (order_id, oi["product_id"], oi["quantity"], oi["unit_price"], oi["unit_type"], oi["procurement_status"]))

        db.commit()

        return WhatsAppIntentResponse(
            success=True,
            intent=intent,
            message=f"✅ Order #{order_id} created successfully for {shop_name} ({client_name}). Total: Rs. {net_total:.2f}",
            data={
                "order_id": order_id,
                "shop_name": shop_name,
                "net_total": net_total,
                "items_count": len(order_items_to_create),
                "outsourced": outsourced_flag
            }
        )

    elif intent == "client_balance":
        if not req.shop_name and not req.client_id:
            return WhatsAppIntentResponse(success=False, intent=intent, message="Client identity required.", data=None)

        cursor.execute("""
            SELECT client_id, client_name, shop_name, previous_balance
            FROM clients
            WHERE shop_name LIKE ? OR client_name LIKE ? OR client_id = ?;
        """, (f"%{req.shop_name}%", f"%{req.shop_name}%", req.client_id or -1))

        row = cursor.fetchone()
        if not row:
            return WhatsAppIntentResponse(success=False, intent=intent, message="Client not found.", data=None)

        return WhatsAppIntentResponse(
            success=True,
            intent=intent,
            message=f"ℹ️ {row[2] or row[1]} current balance: Rs. {row[3]:.2f}",
            data={"client_id": row[0], "client_name": row[1], "shop_name": row[2], "previous_balance": row[3]}
        )

    else:
        return WhatsAppIntentResponse(
            success=False,
            intent=intent,
            message=f"Unsupported intent '{intent}'. Supported intents: 'create_order', 'client_balance', 'check_stock'.",
            data=None
        )
