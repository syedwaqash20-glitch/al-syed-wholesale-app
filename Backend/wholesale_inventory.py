import sqlite3
from database import create_connection

DATABASE_NAME = "wholesale_app.db"


def initialize_database():
    conn = create_connection()
    cursor = conn.cursor()


    # Enable foreign key constraints
    cursor.execute("PRAGMA foreign_keys = ON;")

    print("Creating tables...")

    # ============================================================
    # 1. BRANDS TABLE
    # ============================================================
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS brands (
            brand_id INTEGER PRIMARY KEY AUTOINCREMENT,
            brand_name TEXT NOT NULL UNIQUE
        );
    """)

    # ============================================================
    # 2. CATEGORIES TABLE
    # ============================================================
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS categories (
            category_id INTEGER PRIMARY KEY AUTOINCREMENT,
            category_name TEXT NOT NULL UNIQUE
        );
    """)

    # ============================================================
    # 3. PRODUCTS TABLE
    # ============================================================
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS products (
            product_id INTEGER PRIMARY KEY AUTOINCREMENT,
            brand_id INTEGER NOT NULL,
            category_id INTEGER NOT NULL,
            product_name TEXT NOT NULL,
            base_price REAL NOT NULL DEFAULT 0.00,
            unit_type TEXT NOT NULL DEFAULT 'bundle',
            packet_conversion_qty INTEGER NOT NULL DEFAULT 6,
            packet_price REAL NOT NULL DEFAULT 0.00,
            bundle_price REAL NOT NULL DEFAULT 0.00,
            is_arshad_foods INTEGER NOT NULL DEFAULT 0,

            FOREIGN KEY (brand_id)
                REFERENCES brands(brand_id)
                ON DELETE RESTRICT,

            FOREIGN KEY (category_id)
                REFERENCES categories(category_id)
                ON DELETE RESTRICT,

            UNIQUE(brand_id, product_name)
        );
    """)

    # ============================================================
    # 4. ROUTES TABLE
    # ============================================================
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS routes (
            route_id INTEGER PRIMARY KEY AUTOINCREMENT,
            route_name TEXT NOT NULL,
            assigned_day TEXT NOT NULL
                CHECK (
                    assigned_day IN (
                        'Monday',
                        'Tuesday',
                        'Wednesday',
                        'Thursday',
                        'Friday',
                        'Saturday',
                        'Sunday'
                    )
                ),
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

            UNIQUE(route_name, assigned_day)
        );
    """)

    # ============================================================
    # 5. AREAS TABLE
    # ============================================================
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS areas (
            area_id INTEGER PRIMARY KEY AUTOINCREMENT,
            route_id INTEGER NOT NULL,
            area_name TEXT NOT NULL,

            FOREIGN KEY (route_id)
                REFERENCES routes(route_id)
                ON DELETE CASCADE,

            UNIQUE(route_id, area_name)
        );
    """)

    # ============================================================
    # 6. CLIENTS TABLE
    # ============================================================
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS clients (
            client_id INTEGER PRIMARY KEY AUTOINCREMENT,
            area_id INTEGER NOT NULL,
            client_name TEXT NOT NULL,
            shop_name TEXT NOT NULL DEFAULT '',
            address TEXT NOT NULL,
            phone_number TEXT,
            shop_picture_url TEXT,
            previous_balance REAL DEFAULT 0.0,
            route_sequence INTEGER DEFAULT 0,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

            FOREIGN KEY (area_id)
                REFERENCES areas(area_id)
                ON DELETE CASCADE
        );
    """)

    # ============================================================
    # 7. ORDERS TABLE
    # ============================================================
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS orders (
            order_id INTEGER PRIMARY KEY AUTOINCREMENT,
            client_id INTEGER NOT NULL,
            order_date TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            gross_amount REAL NOT NULL DEFAULT 0.0,
            discount REAL DEFAULT 0.0,
            net_total REAL NOT NULL DEFAULT 0.0,
            payment_amount REAL NOT NULL DEFAULT 0.0,
            payment_status TEXT NOT NULL DEFAULT 'pending',
            delivery_status TEXT NOT NULL DEFAULT 'pending',
            outsourced_flag INTEGER NOT NULL DEFAULT 0,
            previous_balance_at_order REAL NOT NULL DEFAULT 0.0,
            new_balance_after_order REAL NOT NULL DEFAULT 0.0,

            FOREIGN KEY (client_id)
                REFERENCES clients(client_id)
                ON DELETE CASCADE
        );
    """)

    # ============================================================
    # 8. ORDER ITEMS TABLE
    # ============================================================
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS order_items (
            item_id INTEGER PRIMARY KEY AUTOINCREMENT,
            order_id INTEGER NOT NULL,
            product_id INTEGER NOT NULL,
            quantity INTEGER NOT NULL CHECK (quantity > 0),
            unit_price REAL NOT NULL,
            unit_type TEXT NOT NULL DEFAULT 'bundle',
            procurement_status TEXT NOT NULL DEFAULT 'internal',
            bundle_mix_details TEXT,

            FOREIGN KEY (order_id)
                REFERENCES orders(order_id)
                ON DELETE CASCADE,

            FOREIGN KEY (product_id)
                REFERENCES products(product_id)
                ON DELETE RESTRICT
        );
    """)

    # ============================================================
    # 9. INVENTORY TABLE
    # ============================================================
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS inventory (
            product_id INTEGER PRIMARY KEY,
            current_qty INTEGER NOT NULL DEFAULT 50,
            reserved_qty INTEGER NOT NULL DEFAULT 0,
            available_qty INTEGER NOT NULL DEFAULT 50,
            min_stock_level INTEGER NOT NULL DEFAULT 10,

            FOREIGN KEY (product_id)
                REFERENCES products(product_id)
                ON DELETE CASCADE
        );
    """)

    # ============================================================
    # 10. INVENTORY MOVEMENTS TABLE
    # ============================================================
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS inventory_movements (
            movement_id INTEGER PRIMARY KEY AUTOINCREMENT,
            product_id INTEGER NOT NULL,
            change_qty INTEGER NOT NULL,
            movement_type TEXT NOT NULL,
            reference_id INTEGER,
            notes TEXT,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

            FOREIGN KEY (product_id)
                REFERENCES products(product_id)
                ON DELETE CASCADE
        );
    """)

    # ============================================================
    # 11. BILL EDIT LOGS TABLE
    # ============================================================
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS bill_edit_logs (
            log_id INTEGER PRIMARY KEY AUTOINCREMENT,
            order_id INTEGER NOT NULL,
            edited_by TEXT NOT NULL DEFAULT 'Admin',
            previous_data TEXT NOT NULL,
            new_data TEXT NOT NULL,
            timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

            FOREIGN KEY (order_id)
                REFERENCES orders(order_id)
                ON DELETE CASCADE
        );
    """)

    # Dynamic Column Migration Helper
    def ensure_column(table_name, column_name, column_def):
        cursor.execute(f"PRAGMA table_info({table_name});")
        cols = [row[1] for row in cursor.fetchall()]
        if column_name not in cols:
            print(f"Migrating {table_name}: adding {column_name}")
            cursor.execute(f"ALTER TABLE {table_name} ADD COLUMN {column_name} {column_def};")

    ensure_column("products", "unit_type", "TEXT NOT NULL DEFAULT 'bundle'")
    ensure_column("products", "packet_conversion_qty", "INTEGER NOT NULL DEFAULT 6")
    ensure_column("products", "packet_price", "REAL NOT NULL DEFAULT 0.00")
    ensure_column("products", "bundle_price", "REAL NOT NULL DEFAULT 0.00")
    ensure_column("products", "is_arshad_foods", "INTEGER NOT NULL DEFAULT 0")

    ensure_column("clients", "shop_name", "TEXT NOT NULL DEFAULT ''")
    ensure_column("clients", "route_sequence", "INTEGER DEFAULT 0")

    ensure_column("orders", "payment_amount", "REAL NOT NULL DEFAULT 0.0")
    ensure_column("orders", "payment_status", "TEXT NOT NULL DEFAULT 'pending'")
    ensure_column("orders", "delivery_status", "TEXT NOT NULL DEFAULT 'pending'")
    ensure_column("orders", "outsourced_flag", "INTEGER NOT NULL DEFAULT 0")
    ensure_column("orders", "previous_balance_at_order", "REAL NOT NULL DEFAULT 0.0")
    ensure_column("orders", "new_balance_after_order", "REAL NOT NULL DEFAULT 0.0")
    ensure_column("orders", "route_id", "INTEGER REFERENCES routes(route_id) ON DELETE SET NULL")
    ensure_column("orders", "idempotency_key", "TEXT")

    # Create unique index on idempotency_key (ignore if already exists)
    cursor.execute("""
        CREATE UNIQUE INDEX IF NOT EXISTS idx_orders_idempotency
        ON orders(idempotency_key)
        WHERE idempotency_key IS NOT NULL;
    """)

    ensure_column("order_items", "unit_type", "TEXT NOT NULL DEFAULT 'bundle'")
    ensure_column("order_items", "procurement_status", "TEXT NOT NULL DEFAULT 'internal'")
    ensure_column("order_items", "bundle_mix_details", "TEXT")

    # Production starts with an empty database. Data must be created through
    # the application/API, never inserted during initialization.
    conn.commit()
    conn.close()
    return

    # ============================================================
    # SEED BRANDS
    # ============================================================
    brands = [
        ("Mani Foods",),
        ("Green Foods",),
        ("UB Foods",),
        ("Chipslay Foods",),
        ("Master Foods",),
        ("Arshad Foods",),
        ("Suppari",),
        ("Other Foods",)
    ]

    cursor.executemany("""
        INSERT OR IGNORE INTO brands (brand_name)
        VALUES (?);
    """, brands)

    # ============================================================
    # SEED CATEGORIES
    # ============================================================
    categories = [
        ("Snacks",),
        ("Nimko",),
        ("Pops",),
        ("Suppari",),
        ("General Foods",)
    ]

    cursor.executemany("""
        INSERT OR IGNORE INTO categories (category_name)
        VALUES (?);
    """, categories)

    # ============================================================
    # BRAND LOOKUP
    #
    # Creates:
    # {
    #     "Mani Foods": 1,
    #     "Green Foods": 2,
    #     ...
    # }
    # ============================================================
    cursor.execute("""
        SELECT brand_name, brand_id
        FROM brands;
    """)

    brand_map = dict(cursor.fetchall())

    # ============================================================
    # CATEGORY LOOKUP
    #
    # Creates:
    # {
    #     "Snacks": 1,
    #     "Nimko": 2,
    #     ...
    # }
    # ============================================================
    cursor.execute("""
        SELECT category_name, category_id
        FROM categories;
    """)

    category_map = dict(cursor.fetchall())

    # ============================================================
    # SEED PRODUCTS
    # ============================================================
    products = [

        # --------------------------------------------------------
        # MANI FOODS
        # --------------------------------------------------------
        (
            brand_map["Mani Foods"],
            category_map["Snacks"],
            "Pk",
            580.00
        ),
        (
            brand_map["Mani Foods"],
            category_map["Snacks"],
            "Ringo",
            580.00
        ),
        (
            brand_map["Mani Foods"],
            category_map["Snacks"],
            "Imli",
            580.00
        ),
        (
            brand_map["Mani Foods"],
            category_map["Snacks"],
            "Short Cut",
            580.00
        ),
        (
            brand_map["Mani Foods"],
            category_map["Snacks"],
            "Tamatar",
            580.00
        ),
        (
            brand_map["Mani Foods"],
            category_map["Snacks"],
            "Baba",
            580.00
        ),
        (
            brand_map["Mani Foods"],
            category_map["Nimko"],
            "Mani Mix Pkt",
            100.00
        ),
        (
            brand_map["Mani Foods"],
            category_map["Nimko"],
            "Mirch Masala",
            570.00
        ),
        (
            brand_map["Mani Foods"],
            category_map["Nimko"],
            "Soghat",
            55.00
        ),
        (
            brand_map["Mani Foods"],
            category_map["Pops"],
            "Moji",
            580.00
        ),

        # --------------------------------------------------------
        # GREEN FOODS
        # --------------------------------------------------------
        (
            brand_map["Green Foods"],
            category_map["Snacks"],
            "Kainat",
            580.00
        ),
        (
            brand_map["Green Foods"],
            category_map["Snacks"],
            "Makhan",
            580.00
        ),
        (
            brand_map["Green Foods"],
            category_map["Snacks"],
            "Sina",
            580.00
        ),

        # --------------------------------------------------------
        # UB FOODS
        # --------------------------------------------------------
        (
            brand_map["UB Foods"],
            category_map["Snacks"],
            "Tota",
            560.00
        ),
        (
            brand_map["UB Foods"],
            category_map["Snacks"],
            "Shartalo",
            560.00
        ),
        (
            brand_map["UB Foods"],
            category_map["Snacks"],
            "Pappu",
            560.00
        ),

        # --------------------------------------------------------
        # CHIPSLAY FOODS
        # --------------------------------------------------------
        (
            brand_map["Chipslay Foods"],
            category_map["Snacks"],
            "Good Biryani",
            580.00
        ),
        (
            brand_map["Chipslay Foods"],
            category_map["Snacks"],
            "Arro",
            580.00
        ),
        (
            brand_map["Chipslay Foods"],
            category_map["Snacks"],
            "Piyaz",
            580.00
        ),
        (
            brand_map["Chipslay Foods"],
            category_map["Snacks"],
            "Malamal",
            580.00
        ),

        # --------------------------------------------------------
        # MASTER FOODS
        # --------------------------------------------------------
        (
            brand_map["Master Foods"],
            category_map["Snacks"],
            "Shahi Biryani",
            580.00
        ),
        (
            brand_map["Master Foods"],
            category_map["Snacks"],
            "Shaidu Chaska",
            580.00
        ),
        (
            brand_map["Master Foods"],
            category_map["Snacks"],
            "Masti Chaska",
            580.00
        ),

        # --------------------------------------------------------
        # ARSHAD FOODS
        # --------------------------------------------------------
        (
            brand_map["Arshad Foods"],
            category_map["Snacks"],
            "Shahi Chicken",
            600.00
        ),
        (
            brand_map["Arshad Foods"],
            category_map["Snacks"],
            "Shahi Chicken (20 Rs)",
            600.00
        ),
        (
            brand_map["Arshad Foods"],
            category_map["Snacks"],
            "Shahi Ketchup",
            600.00
        ),

        # --------------------------------------------------------
        # SUPPARI
        # --------------------------------------------------------
        (
            brand_map["Suppari"],
            category_map["Suppari"],
            "Tulsi Suppari",
            0.00
        ),
        (
            brand_map["Suppari"],
            category_map["Suppari"],
            "Devi Gold Suppari",
            0.00
        ),

        # --------------------------------------------------------
        # OTHER FOODS
        # --------------------------------------------------------
        (
            brand_map["Other Foods"],
            category_map["General Foods"],
            "Dakar Chat Masala Pkt",
            270.00
        )
    ]

    # ============================================================
    # INSERT PRODUCTS
    #
    # Because products have:
    # UNIQUE(brand_id, product_name)
    #
    # the same product name can exist under different brands.
    # ============================================================
    cursor.executemany("""
        INSERT OR IGNORE INTO products (
            brand_id,
            category_id,
            product_name,
            base_price
        )
        VALUES (?, ?, ?, ?);
    """, products)

    # ============================================================
    # SEED ROUTES
    #
    # "Shakar Darra" spelling standardized everywhere.
    # ============================================================
    routes = [
        (
            "Awan Sharif → Saddar → Iqra School",
            "Monday"
        ),
        (
            "3 Meela → Aslam Colony → People Colony → Farooq e Azam → New Town → Bihar Colony",
            "Saturday"
        ),
        (
            "Shakar Darra → Sheen Bagh",
            "Wednesday"
        )
    ]

    for route_name, assigned_day in routes:

        cursor.execute("""
            INSERT OR IGNORE INTO routes (
                route_name,
                assigned_day
            )
            VALUES (?, ?);
        """, (
            route_name,
            assigned_day
        ))

    # ============================================================
    # ROUTE LOOKUP
    #
    # IMPORTANT:
    # SELECT route_name FIRST, route_id SECOND
    #
    # So:
    # route_map["Awan Sharif → Saddar → Iqra School"]
    # returns the correct route_id.
    # ============================================================
    cursor.execute("""
        SELECT route_name, route_id
        FROM routes;
    """)

    route_map = dict(cursor.fetchall())

    # ============================================================
    # SEED AREAS
    # ============================================================
    areas = [

        # --------------------------------------------------------
        # MONDAY ROUTE
        # --------------------------------------------------------
        (
            route_map["Awan Sharif → Saddar → Iqra School"],
            "Awan Sharif"
        ),
        (
            route_map["Awan Sharif → Saddar → Iqra School"],
            "Saddar"
        ),
        (
            route_map["Awan Sharif → Saddar → Iqra School"],
            "Iqra School"
        ),

        # --------------------------------------------------------
        # SATURDAY ROUTE
        # --------------------------------------------------------
        (
            route_map[
                "3 Meela → Aslam Colony → People Colony → Farooq e Azam → New Town → Bihar Colony"
            ],
            "3 Meela"
        ),
        (
            route_map[
                "3 Meela → Aslam Colony → People Colony → Farooq e Azam → New Town → Bihar Colony"
            ],
            "Aslam Colony"
        ),
        (
            route_map[
                "3 Meela → Aslam Colony → People Colony → Farooq e Azam → New Town → Bihar Colony"
            ],
            "People Colony"
        ),
        (
            route_map[
                "3 Meela → Aslam Colony → People Colony → Farooq e Azam → New Town → Bihar Colony"
            ],
            "Farooq e Azam"
        ),
        (
            route_map[
                "3 Meela → Aslam Colony → People Colony → Farooq e Azam → New Town → Bihar Colony"
            ],
            "New Town"
        ),
        (
            route_map[
                "3 Meela → Aslam Colony → People Colony → Farooq e Azam → New Town → Bihar Colony"
            ],
            "Bihar Colony"
        ),

        # --------------------------------------------------------
        # WEDNESDAY ROUTE
        # --------------------------------------------------------
        (
            route_map["Shakar Darra → Sheen Bagh"],
            "Shakar Darra"
        ),
        (
            route_map["Shakar Darra → Sheen Bagh"],
            "Sheen Bagh"
        )
    ]

    # ============================================================
    # INSERT AREAS
    # ============================================================
    cursor.executemany("""
        INSERT OR IGNORE INTO areas (
            route_id,
            area_name
        )
        VALUES (?, ?);
    """, areas)

    # ============================================================
    # AREA LOOKUP
    # ============================================================
    cursor.execute("""
        SELECT area_name, area_id
        FROM areas;
    """)

    area_map = dict(cursor.fetchall())

    # ============================================================
    # SEED CLIENTS
    # ============================================================
    clients = [
        (
            area_map["Awan Sharif"],
            "ABC Traders (Awan Sharif)",
            "Main Bazar Awan Sharif",
            "0300-1234567",
            "uploads/shops/awan_abc.jpg",
            1250.00
        ),
        (
            area_map["People Colony"],
            "ABC Cash & Carry (People Colony)",
            "Street 4 People Colony",
            "0312-9876543",
            "uploads/shops/people_abc.jpg",
            0.00
        ),
        (
            area_map["Shakar Darra"],
            "ABC General Store (Shakar Darra)",
            "Near Bus Stand Shakar Darra",
            "0333-5554433",
            "uploads/shops/shakar_abc.jpg",
            4500.00
        )
    ]

    # ============================================================
    # CLIENT LOOKUP
    # ============================================================
    client_map = {}

    for (
        area_id,
        client_name,
        address,
        phone_number,
        shop_picture_url,
        previous_balance
    ) in clients:

        cursor.execute("""
            SELECT client_id
            FROM clients
            WHERE area_id = ?
              AND client_name = ?;
        """, (
            area_id,
            client_name
        ))

        existing_client = cursor.fetchone()

        if existing_client:
            client_id = existing_client[0]

        else:
            cursor.execute("""
                INSERT INTO clients (
                    area_id,
                    client_name,
                    address,
                    phone_number,
                    shop_picture_url,
                    previous_balance
                )
                VALUES (?, ?, ?, ?, ?, ?);
            """, (
                area_id,
                client_name,
                address,
                phone_number,
                shop_picture_url,
                previous_balance
            ))

            client_id = cursor.lastrowid

        client_map[client_name] = client_id

    # ============================================================
    # PRODUCT COMPOUND LOOKUP
    #
    # IMPORTANT FIX:
    #
    # Product lookup now uses:
    #
    #     (brand_id, product_name)
    #
    # instead of only:
    #
    #     product_name
    #
    # This prevents ambiguity if two brands have the same product
    # name.
    # ============================================================
    cursor.execute("""
        SELECT brand_id, product_name, product_id
        FROM products;
    """)

    product_map = {
        (row[0], row[1]): row[2]
        for row in cursor.fetchall()
    }

    # Update is_arshad_foods flag for products under Arshad Foods brand
    cursor.execute("""
        UPDATE products
        SET is_arshad_foods = 1
        WHERE brand_id = (SELECT brand_id FROM brands WHERE brand_name = 'Arshad Foods');
    """)

    # Seed inventory for all products if not already present
    cursor.execute("SELECT product_id FROM products;")
    all_pids = cursor.fetchall()
    for (pid,) in all_pids:
        cursor.execute("""
            INSERT OR IGNORE INTO inventory (product_id, current_qty, reserved_qty, available_qty, min_stock_level)
            VALUES (?, 100, 0, 100, 10);
        """, (pid,))

    # ============================================================
    # COMMIT
    # ============================================================
    conn.commit()

    # ============================================================
    # CLOSE DATABASE CONNECTION
    # ============================================================
    conn.close()

    print()
    print("=" * 60)
    print("DATABASE INITIALIZATION COMPLETE")
    print("=" * 60)
    print(f"Database: {DATABASE_NAME}")
    print("Tables created successfully.")
    print("Seed data inserted successfully.")
    print("=" * 60)


# ================================================================
# RUN DATABASE INITIALIZATION
# ================================================================
if __name__ == "__main__":
    initialize_database()