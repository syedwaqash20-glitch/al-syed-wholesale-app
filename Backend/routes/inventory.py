import sqlite3
from typing import Any, Dict
from fastapi import APIRouter, Depends, HTTPException, status

from database import get_db
from models import StockAdjustment

router = APIRouter(
    prefix="/inventory",
    tags=["Inventory"]
)


@router.get("/")
def get_inventory(db: sqlite3.Connection = Depends(get_db)):
    cursor = db.cursor()

    cursor.execute("""
        SELECT
            p.product_id,
            p.product_name,
            COALESCE(b.brand_name, 'General') AS brand_name,
            COALESCE(c.category_name, 'General') AS category_name,
            COALESCE(p.bundle_price, p.base_price, 580) AS bundle_price,
            COALESCE(p.packet_price, 97) AS packet_price,
            COALESCE(p.base_price, 580) AS base_price,
            COALESCE(i.current_qty, 100) AS current_qty,
            COALESCE(i.reserved_qty, 0) AS reserved_qty,
            COALESCE(i.available_qty, 100) AS available_qty,
            COALESCE(i.min_stock_level, 10) AS min_stock_level,
            p.is_arshad_foods
        FROM products p
        LEFT JOIN brands b ON p.brand_id = b.brand_id
        LEFT JOIN categories c ON p.category_id = c.category_id
        LEFT JOIN inventory i ON p.product_id = i.product_id
        ORDER BY p.product_id DESC;
    """)

    rows = cursor.fetchall()
    items = []
    for r in rows:
        items.append({
            "product_id": r[0],
            "product_name": r[1],
            "brand_name": r[2],
            "category_name": r[3],
            "bundle_price": r[4],
            "packet_price": r[5],
            "base_price": r[6],
            "current_qty": r[7],
            "reserved_qty": r[8],
            "available_qty": r[9],
            "min_stock_level": r[10],
            "is_arshad_foods": bool(r[11]),
        })

    return {
        "success": True,
        "count": len(items),
        "inventory": items,
    }


@router.get("/movements")
def get_movements(db: sqlite3.Connection = Depends(get_db)):
    cursor = db.cursor()

    cursor.execute("""
        SELECT
            m.movement_id,
            m.product_id,
            p.product_name,
            m.change_qty,
            m.movement_type,
            m.reference_id,
            m.notes,
            m.created_at
        FROM inventory_movements m
        LEFT JOIN products p ON m.product_id = p.product_id
        ORDER BY m.movement_id DESC
        LIMIT 10;
    """)

    rows = cursor.fetchall()
    movements = []
    for r in rows:
        movements.append({
            "movement_id": r[0],
            "product_id": r[1],
            "product_name": r[2] or f"Product #{r[1]}",
            "change_qty": r[3],
            "movement_type": r[4],
            "reference_id": r[5],
            "notes": r[6],
            "created_at": r[7],
        })

    return {
        "success": True,
        "count": len(movements),
        "movements": movements,
    }


@router.post("/adjust")
def adjust_stock(
    adj: StockAdjustment,
    db: sqlite3.Connection = Depends(get_db)
):
    cursor = db.cursor()

    # Try parsing numeric product_id
    pid = adj.product_id
    try:
        pid = int(adj.product_id)
    except (ValueError, TypeError):
        pass

    cursor.execute("SELECT current_qty, reserved_qty FROM inventory WHERE product_id = ? OR product_id = ?;", (pid, str(pid)))
    inv = cursor.fetchone()

    if not inv:
        curr_qty = 100 + adj.change_qty
        res_qty = 0
        avail_qty = curr_qty
        cursor.execute("""
            INSERT INTO inventory (product_id, current_qty, reserved_qty, available_qty, min_stock_level)
            VALUES (?, ?, ?, ?, 10);
        """, (pid, curr_qty, res_qty, avail_qty))
    else:
        curr_qty = inv[0] + adj.change_qty
        res_qty = inv[1] or 0
        avail_qty = curr_qty - res_qty
        cursor.execute("""
            UPDATE inventory
            SET current_qty = ?, available_qty = ?
            WHERE product_id = ? OR product_id = ?;
        """, (curr_qty, avail_qty, pid, str(pid)))

    # Record movement log safely and prune table to keep ONLY latest 10 records
    try:
        cursor.execute("""
            INSERT INTO inventory_movements (product_id, change_qty, movement_type, notes)
            VALUES (?, ?, ?, ?);
        """, (pid if isinstance(pid, int) else 1, adj.change_qty, adj.movement_type or 'adjustment', adj.notes or "Manual adjustment"))

        # Prune older movements keeping ONLY the top 10 latest
        cursor.execute("""
            DELETE FROM inventory_movements
            WHERE movement_id NOT IN (
                SELECT movement_id FROM inventory_movements
                ORDER BY movement_id DESC
                LIMIT 10
            );
        """)
    except Exception:
        pass

    db.commit()


    return {
        "success": True,
        "message": f"Stock adjusted by {adj.change_qty} units.",
        "product_id": pid,
        "new_current_qty": curr_qty,
        "new_available_qty": avail_qty
    }

