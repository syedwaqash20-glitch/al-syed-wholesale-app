import sqlite3
from typing import Any, Dict
from fastapi import APIRouter, Depends

from database import get_db

router = APIRouter(
    prefix="/sales",
    tags=["Sales"]
)


@router.get("/summary")
def get_sales_summary(db: sqlite3.Connection = Depends(get_db)):
    cursor = db.cursor()

    # Daily sales (orders created today)
    cursor.execute("""
        SELECT COALESCE(SUM(net_total), 0.0), COALESCE(SUM(payment_amount), 0.0), COUNT(order_id)
        FROM orders
        WHERE DATE(order_date) = DATE('now');
    """)
    d_sum, d_received, d_cnt = cursor.fetchone()

    # Weekly sales
    cursor.execute("""
        SELECT COALESCE(SUM(net_total), 0.0), COALESCE(SUM(payment_amount), 0.0), COUNT(order_id)
        FROM orders
        WHERE DATE(order_date) >= DATE('now', '-7 days');
    """)
    w_sum, w_received, w_cnt = cursor.fetchone()

    # Yearly sales
    cursor.execute("""
        SELECT COALESCE(SUM(net_total), 0.0), COALESCE(SUM(payment_amount), 0.0), COUNT(order_id)
        FROM orders
        WHERE strftime('%Y', order_date) = strftime('%Y', 'now');
    """)
    y_sum, y_received, y_cnt = cursor.fetchone()

    # Bundles vs Packets sold totals
    cursor.execute("""
        SELECT
            COALESCE(SUM(CASE WHEN unit_type = 'bundle' THEN quantity ELSE 0 END), 0),
            COALESCE(SUM(CASE WHEN unit_type = 'packet' THEN quantity ELSE 0 END), 0),
            COALESCE(SUM(CASE WHEN unit_type = 'bundle_mix' THEN quantity ELSE 0 END), 0)
        FROM order_items;
    """)
    bundles_cnt, packets_cnt, mix_cnt = cursor.fetchone()

    return {
        "success": True,
        "daily_sales": d_sum,
        "daily_received": d_received,
        "daily_orders_count": d_cnt,
        "weekly_sales": w_sum,
        "weekly_received": w_received,
        "weekly_orders_count": w_cnt,
        "yearly_sales": y_sum,
        "yearly_received": y_received,
        "yearly_orders_count": y_cnt,
        "bundles_sold": bundles_cnt,
        "packets_sold": packets_cnt,
        "bundle_mixes_sold": mix_cnt,
    }


@router.get("/arshad-breakdown")
def get_arshad_breakdown(db: sqlite3.Connection = Depends(get_db)):
    cursor = db.cursor()

    cursor.execute("""
        SELECT
            p.product_id,
            p.product_name,
            COALESCE(SUM(oi.quantity), 0) AS total_quantity_sold,
            COALESCE(SUM(oi.quantity * oi.unit_price), 0.0) AS total_revenue
        FROM products p
        INNER JOIN brands b ON p.brand_id = b.brand_id
        LEFT JOIN order_items oi ON p.product_id = oi.product_id
        WHERE b.brand_name = 'Arshad Foods' OR p.is_arshad_foods = 1
        GROUP BY p.product_id, p.product_name
        ORDER BY total_quantity_sold DESC;
    """)

    rows = cursor.fetchall()
    breakdown = []
    total_arshad_qty = 0
    total_arshad_revenue = 0.0

    for r in rows:
        breakdown.append({
            "product_id": r[0],
            "product_name": r[1],
            "total_quantity_sold": r[2],
            "total_revenue": r[3],
        })
        total_arshad_qty += r[2]
        total_arshad_revenue += r[3]

    return {
        "success": True,
        "brand": "Arshad Foods",
        "total_quantity_sold": total_arshad_qty,
        "total_revenue": total_arshad_revenue,
        "products": breakdown
    }
