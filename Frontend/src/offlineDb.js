const STORAGE_KEYS = {
  CLIENTS: 'alsyed_cache_clients',
  PRODUCTS: 'alsyed_cache_products',
  BRANDS: 'alsyed_cache_brands',
  ROUTES: 'alsyed_cache_routes',
  AREAS: 'alsyed_cache_areas',
  INVENTORY: 'alsyed_cache_inventory',
  MOVEMENTS: 'alsyed_cache_movements',
  SALES_SUMMARY: 'alsyed_cache_sales_summary',
  ARSHAD_BREAKDOWN: 'alsyed_cache_arshad_breakdown',
  OFFLINE_ORDERS: 'alsyed_offline_orders_queue',
  OFFLINE_ACTIONS: 'alsyed_offline_action_queue'
    ,ORDER_SYNC_JOURNAL: 'alsyed_order_sync_journal'
};

export const offlineDb = {
  // ─── Master data caching ──────────────────────────────────────────────────
  cacheMasterData: (key, data) => {
    try {
      if (data && Array.isArray(data)) {
        localStorage.setItem(key, JSON.stringify(data));
      }
    } catch (e) {
      console.warn('Local cache save note:', e);
    }
  },
  
  getOrderSyncJournal: () => offlineDb.getCachedValue(STORAGE_KEYS.ORDER_SYNC_JOURNAL, {}),

  saveOrderSync: (orderId, order) => {
    const journal = offlineDb.getOrderSyncJournal();
    journal[String(orderId)] = order;
    offlineDb.cacheValue(STORAGE_KEYS.ORDER_SYNC_JOURNAL, journal);
  },

  saveDeletedOrderSync: (orderId) => {
    const journal = offlineDb.getOrderSyncJournal();
    journal[String(orderId)] = { deleted: true };
    offlineDb.cacheValue(STORAGE_KEYS.ORDER_SYNC_JOURNAL, journal);
  },

  clearOrderSync: (orderId) => {
    const journal = offlineDb.getOrderSyncJournal();
    delete journal[String(orderId)];
    offlineDb.cacheValue(STORAGE_KEYS.ORDER_SYNC_JOURNAL, journal);
  },

  applyOrderSyncJournal: (orders) => {
    const journal = offlineDb.getOrderSyncJournal();
    const serverIds = new Set(orders.map(order => String(order.order_id)));
    const merged = orders.filter(order => !journal[String(order.order_id)]?.deleted).map(order => {
      const override = journal[String(order.order_id)];
      return override && !override.deleted ? { ...order, ...override } : order;
    });
    Object.keys(journal).forEach(orderId => {
      if (!serverIds.has(orderId) || journal[orderId]?.deleted) return;
      if (journal[orderId]?.order_id && merged.some(order => String(order.order_id) === orderId)) {
        // Keep the override until the server returns the same order state.
        const serverOrder = orders.find(order => String(order.order_id) === orderId);
        const override = journal[orderId];
        if (serverOrder && override.delivery_status === serverOrder.delivery_status &&
          Number(override.new_balance_after_order || 0) === Number(serverOrder.new_balance_after_order || 0) &&
          Number(override.payment_amount || 0) === Number(serverOrder.payment_amount || 0)) {
          delete journal[orderId];
        }
      }
    });
    offlineDb.cacheValue(STORAGE_KEYS.ORDER_SYNC_JOURNAL, journal);
    return merged;
  },

  getCachedData: (key, fallback = []) => {
    try {
      const data = localStorage.getItem(key);
      return data ? JSON.parse(data) : fallback;
    } catch {
      return fallback;
    }
  },

  cacheValue: (key, value) => {
    try {
      if (value === undefined || value === null) localStorage.removeItem(key);
      else localStorage.setItem(key, JSON.stringify(value));
    } catch (e) {
      console.warn('Local value cache save note:', e);
    }
  },

  getCachedValue: (key, fallback = null) => {
    try {
      const data = localStorage.getItem(key);
      return data ? JSON.parse(data) : fallback;
    } catch {
      return fallback;
    }
  },

  // ─── Offline Unified Action Queue ─────────────────────────────────────────
  getOfflineActions: () => {
    try {
      const data = localStorage.getItem(STORAGE_KEYS.OFFLINE_ACTIONS);
      return data ? JSON.parse(data) : [];
    } catch {
      return [];
    }
  },

  saveOfflineAction: (actionType, payload) => {
    try {
      const queue = offlineDb.getOfflineActions();
      const action = {
        action_id: `OFFLINE-ACT-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
        action_type: actionType,
        payload,
        created_at: new Date().toISOString()
      };
      queue.push(action);
      localStorage.setItem(STORAGE_KEYS.OFFLINE_ACTIONS, JSON.stringify(queue));
      return action;
    } catch (e) {
      console.error('Failed to save offline action:', e);
      throw e;
    }
  },

  removeOfflineAction: (actionId) => {
    try {
      const queue = offlineDb.getOfflineActions();
      const updated = queue.filter(a => a.action_id !== actionId);
      localStorage.setItem(STORAGE_KEYS.OFFLINE_ACTIONS, JSON.stringify(updated));
    } catch (e) {
      console.warn('Failed to remove offline action:', e);
    }
  },

  clearOfflineActions: () => {
    localStorage.removeItem(STORAGE_KEYS.OFFLINE_ACTIONS);
  },

  // ─── Local Mutations (Instant UI update when offline) ────────────────────
  addLocalRoute: (route) => {
    const list = offlineDb.getCachedData(STORAGE_KEYS.ROUTES);
    list.unshift(route);
    offlineDb.cacheMasterData(STORAGE_KEYS.ROUTES, list);
  },

  updateLocalRoute: (routeId, data) => {
    const list = offlineDb.getCachedData(STORAGE_KEYS.ROUTES);
    const updated = list.map(r => r.route_id === routeId ? { ...r, ...data } : r);
    offlineDb.cacheMasterData(STORAGE_KEYS.ROUTES, updated);
  },

  deleteLocalRoute: (routeId) => {
    const list = offlineDb.getCachedData(STORAGE_KEYS.ROUTES);
    const updated = list.filter(r => r.route_id !== routeId);
    offlineDb.cacheMasterData(STORAGE_KEYS.ROUTES, updated);
  },

  addLocalArea: (area) => {
    const list = offlineDb.getCachedData(STORAGE_KEYS.AREAS);
    list.unshift(area);
    offlineDb.cacheMasterData(STORAGE_KEYS.AREAS, list);
  },

  updateLocalArea: (areaId, data) => {
    const list = offlineDb.getCachedData(STORAGE_KEYS.AREAS);
    const updated = list.map(a => a.area_id === areaId ? { ...a, ...data } : a);
    offlineDb.cacheMasterData(STORAGE_KEYS.AREAS, updated);
  },

  deleteLocalArea: (areaId) => {
    const list = offlineDb.getCachedData(STORAGE_KEYS.AREAS);
    const updated = list.filter(a => a.area_id !== areaId);
    offlineDb.cacheMasterData(STORAGE_KEYS.AREAS, updated);
  },

  addLocalClient: (client) => {
    const list = offlineDb.getCachedData(STORAGE_KEYS.CLIENTS);
    list.unshift(client);
    offlineDb.cacheMasterData(STORAGE_KEYS.CLIENTS, list);
  },

  updateLocalClient: (clientId, data) => {
    const list = offlineDb.getCachedData(STORAGE_KEYS.CLIENTS);
    const updated = list.map(c => c.client_id === clientId ? { ...c, ...data } : c);
    offlineDb.cacheMasterData(STORAGE_KEYS.CLIENTS, updated);
  },

  updateLocalClientBalance: (clientId, balance) => {
    const clients = offlineDb.getCachedData(STORAGE_KEYS.CLIENTS);
    offlineDb.cacheMasterData(
      STORAGE_KEYS.CLIENTS,
      clients.map(client => String(client.client_id) === String(clientId)
        ? { ...client, previous_balance: balance }
        : client)
    );
  },

  updateLocalOrder: (orderId, data) => {
    const orders = offlineDb.getCachedData('alsyed_cache_orders', []);
    offlineDb.cacheMasterData(
      'alsyed_cache_orders',
      orders.map(order => String(order.order_id) === String(orderId) ? { ...order, ...data } : order)
    );
  },

  deleteLocalClient: (clientId) => {
    const list = offlineDb.getCachedData(STORAGE_KEYS.CLIENTS);
    const updated = list.filter(c => c.client_id !== clientId);
    offlineDb.cacheMasterData(STORAGE_KEYS.CLIENTS, updated);
  },

  addLocalProduct: (product) => {
    const prods = offlineDb.getCachedData(STORAGE_KEYS.PRODUCTS);
    prods.unshift(product);
    offlineDb.cacheMasterData(STORAGE_KEYS.PRODUCTS, prods);

    const inv = offlineDb.getCachedData(STORAGE_KEYS.INVENTORY);
    const initStock = product.initial_stock || product.current_qty || 100;
    inv.unshift({
      product_id: product.product_id,
      product_name: product.product_name,
      brand_name: product.brand_name || 'General',
      category_name: product.category_name || 'General',
      base_price: product.base_price || 580,
      bundle_price: product.bundle_price || product.base_price || 580,
      packet_price: product.packet_price || Math.round((product.base_price || 580) / 6),
      current_qty: initStock,
      reserved_qty: 0,
      available_qty: initStock,
      min_stock_level: 5,
      is_arshad_foods: product.is_arshad_foods || false
    });
    offlineDb.cacheMasterData(STORAGE_KEYS.INVENTORY, inv);
  },

  updateLocalProduct: (productId, data) => {
    const prods = offlineDb.getCachedData(STORAGE_KEYS.PRODUCTS);
    const updatedProds = prods.map(p => String(p.product_id) === String(productId) ? { ...p, ...data } : p);
    offlineDb.cacheMasterData(STORAGE_KEYS.PRODUCTS, updatedProds);

    const inv = offlineDb.getCachedData(STORAGE_KEYS.INVENTORY);
    const updatedInv = inv.map(i => String(i.product_id) === String(productId) ? { ...i, ...data } : i);
    offlineDb.cacheMasterData(STORAGE_KEYS.INVENTORY, updatedInv);
  },

  deleteLocalProduct: (productId) => {
    const prods = offlineDb.getCachedData(STORAGE_KEYS.PRODUCTS);
    const updatedProds = prods.filter(p => String(p.product_id) !== String(productId));
    offlineDb.cacheMasterData(STORAGE_KEYS.PRODUCTS, updatedProds);

    const inv = offlineDb.getCachedData(STORAGE_KEYS.INVENTORY);
    const updatedInv = inv.filter(i => String(i.product_id) !== String(productId));
    offlineDb.cacheMasterData(STORAGE_KEYS.INVENTORY, updatedInv);
  },



  // Legacy offline order methods
  saveOfflineOrder: (orderPayload, itemsList) => {
    return offlineDb.saveOfflineAction('CREATE_ORDER', { orderPayload, itemsList });
  },

  getOfflineOrders: () => {
    return offlineDb.getOfflineActions().filter(a => a.action_type === 'CREATE_ORDER');
  },

  removeOfflineOrder: (actionId) => {
    offlineDb.removeOfflineAction(actionId);
  }
};

export { STORAGE_KEYS };
