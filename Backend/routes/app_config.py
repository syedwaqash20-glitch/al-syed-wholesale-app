import sqlite3
from typing import Any, Dict
from fastapi import APIRouter, Depends, HTTPException

from database import get_db

router = APIRouter(
    prefix="/app",
    tags=["App Configuration & Printing"]
)


@router.get("/version")
def check_app_version():
    return {
        "success": True,
        "latest_version": "1.0.0",
        "min_supported_version": "1.0.0",
        "mandatory_update": False,
        "download_url": "https://alsyeddistribution.com/app-latest.apk",
        "release_notes": "Al Syed Distribution Mobile App v1.0.0 - Mobile distribution, ESC/POS thermal printing, Bundle Mix support."
    }


@router.get("/thermal-receipt/{order_id}")
def get_thermal_receipt(
    order_id: int,
    db: sqlite3.Connection = Depends(get_db)
):
    cursor = db.cursor()

    cursor.execute("""
        SELECT
            o.order_id,
            c.client_name,
            COALESCE(c.shop_name, c.client_name) AS shop_name,
            c.address,
            c.phone_number,
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
        INNER JOIN clients c ON o.client_id = c.client_id
        WHERE o.order_id = ?;
    """, (order_id,))

    order_row = cursor.fetchone()
    if not order_row:
        raise HTTPException(status_code=404, detail="Order not found.")

    oid, c_name, s_name, addr, phone, date_str, gross, disc, net, paid, payment_status, delivery_status, prev_bal, new_bal = order_row

    cursor.execute("""
        SELECT
            p.product_name,
            oi.quantity,
            oi.unit_price,
            oi.unit_type,
            oi.procurement_status
        FROM order_items oi
        INNER JOIN products p ON oi.product_id = p.product_id
        WHERE oi.order_id = ?;
    """, (order_id,))

    items = cursor.fetchall()

    # Format 32-column Thermal Receipt Text (Standard 58mm / 80mm ESC/POS printer width)
    lines = []
    lines.append("================================")
    lines.append("    AL SYED DISTRIBUTION APP   ")
    lines.append("   Wholesale Distribution Bill  ")
    lines.append("================================")
    lines.append(f"Bill No  : #{oid}")
    lines.append(f"Date     : {str(date_str)[:16]}")
    lines.append(f"Shop     : {s_name}")
    lines.append(f"Client   : {c_name}")
    if phone:
        lines.append(f"Phone    : {phone}")
    lines.append("--------------------------------")
    lines.append("Item             Qty   Price  Tot")
    lines.append("--------------------------------")

    for item in items:
        pname, qty, price, utype, proc = item
        total = qty * price
        tag = " (Outsourced)" if proc == "outsourced" else ""
        short_name = (pname[:13] + "..") if len(pname) > 15 else pname
        lines.append(f"{short_name:<15} {qty:>3} {price:>6.0f} {total:>5.0f}{tag}")

    lines.append("--------------------------------")
    lines.append(f"Subtotal         : Rs. {gross:>8.2f}")
    if disc > 0:
        lines.append(f"Discount         : Rs. {disc:>8.2f}")
    lines.append(f"Current Bill     : Rs. {net:>8.2f}")
    lines.append(f"Previous Balance : Rs. {prev_bal:>8.2f}")
    lines.append(f"Payment Received : Rs. {paid:>8.2f}")
    lines.append(f"Payment Status   : {payment_status}")
    lines.append(f"Total Amount     : Rs. {(net + prev_bal):>8.2f}")
    lines.append(f"Outstanding      : Rs. {new_bal:>8.2f}")
    lines.append(f"Payment Received : Rs. {paid:>8.2f}")
    lines.append("--------------------------------")
    lines.append(f"NEW BALANCE      : Rs. {new_bal:>8.2f}")
    lines.append("================================")
    lines.append("   Thank you for your business!  ")
    lines.append("================================\n\n\n")

    receipt_text = "\n".join(lines)
    # ESC/POS byte sequence generation simulation (ASCII to Hex string)
    esc_pos_hex = receipt_text.encode('utf-8').hex()

    return {
        "success": True,
        "order_id": order_id,
        "receipt_text": receipt_text,
        "esc_pos_hex": esc_pos_hex,
    }
