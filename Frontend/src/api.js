import { offlineDb, STORAGE_KEYS } from './offlineDb';

const DEPLOYED_API_URL = 'https://al-syed-wholesale-app.fastapicloud.dev';
const API_BASE_URL = (import.meta.env.VITE_API_URL || DEPLOYED_API_URL).replace(/\/$/, '');
const API_KEY = import.meta.env.VITE_API_KEY || '';

let _syncInProgress = false;

const isDeviceOffline = () => {
  return typeof navigator !== 'undefined' && !navigator.onLine;
};

// ─── Auto-sync: replay offline queue when connectivity is restored ────────────
async function syncOfflineQueue() {
  if (_syncInProgress) return;
  const queue = offlineDb.getOfflineActions();
  if (!queue.length) return;

  _syncInProgress = true;
  console.log(`[Sync] Replaying ${queue.length} offline action(s)…`);

  for (const action of queue) {
    try {
      const { action_type, payload } = action;
      let synced = false;

      if (action_type === 'CREATE_ROUTE') {
        await rawRequest('/routes/routes', { method: 'POST', body: JSON.stringify(payload) });
        synced = true;
      } else if (action_type === 'UPDATE_ROUTE') {
        await rawRequest(`/routes/routes/${payload.route_id}`, { method: 'PUT', body: JSON.stringify(payload.data) });
        synced = true;
      } else if (action_type === 'DELETE_ROUTE') {
        await rawRequest(`/routes/routes/${payload.route_id}`, { method: 'DELETE' });
        synced = true;
      } else if (action_type === 'CREATE_AREA') {
        await rawRequest('/areas/areas', { method: 'POST', body: JSON.stringify(payload) });
        synced = true;
      } else if (action_type === 'UPDATE_AREA') {
        await rawRequest(`/areas/areas/${payload.area_id}`, { method: 'PUT', body: JSON.stringify(payload.data) });
        synced = true;
      } else if (action_type === 'DELETE_AREA') {
        await rawRequest(`/areas/areas/${payload.area_id}`, { method: 'DELETE' });
        synced = true;
      } else if (action_type === 'CREATE_CLIENT') {
        await rawRequest('/clients/clients', { method: 'POST', body: JSON.stringify(payload) });
        synced = true;
      } else if (action_type === 'UPDATE_CLIENT') {
        await rawRequest(`/clients/clients/${payload.client_id}`, { method: 'PUT', body: JSON.stringify(payload.data) });
        synced = true;
      } else if (action_type === 'DELETE_CLIENT') {
        await rawRequest(`/clients/clients/${payload.client_id}`, { method: 'DELETE' });
        synced = true;
      } else if (action_type === 'CREATE_PRODUCT') {
        await rawRequest('/products/products', { method: 'POST', body: JSON.stringify(payload) });
        synced = true;
      } else if (action_type === 'UPDATE_PRODUCT') {
        await rawRequest(`/products/products/${payload.product_id}`, { method: 'PUT', body: JSON.stringify(payload.data) });
        synced = true;
      } else if (action_type === 'DELETE_PRODUCT') {
        await rawRequest(`/products/products/${payload.product_id}`, { method: 'DELETE' });
        synced = true;
      } else if (action_type === 'CREATE_ORDER') {
        const res = await rawRequest('/orders/orders', { method: 'POST', body: JSON.stringify(payload.orderPayload) });
        if (res?.order_id && payload.itemsList?.length) {
          for (const item of payload.itemsList) {
            await rawRequest('/order-items/order-items', { method: 'POST', body: JSON.stringify({ ...item, order_id: res.order_id }) }).catch(() => {});
          }
        }
        synced = true;
      } else if (action_type === 'UPDATE_ORDER') {
        await rawRequest(`/orders/orders/${payload.order_id}`, { method: 'PUT', body: JSON.stringify(payload.data) });
        synced = true;
      } else if (action_type === 'DELETE_ORDER') {
        await rawRequest(`/orders/orders/${payload.order_id}`, { method: 'DELETE' });
        synced = true;
      } else if (action_type === 'UPDATE_DELIVERY_STATUS') {
        const pq = `?status_val=${encodeURIComponent(payload.status_val)}` +
          (payload.payment_amount !== undefined ? `&payment_amount=${encodeURIComponent(payload.payment_amount)}` : '') +
          (payload.discount_amount !== undefined ? `&discount_amount=${encodeURIComponent(payload.discount_amount)}` : '');
        await rawRequest(`/orders/orders/${payload.order_id}/delivery-status${pq}`, { method: 'PUT' });
        synced = true;
      } else if (action_type === 'UPDATE_REMAINING_BALANCE') {
        await rawRequest(`/orders/orders/${payload.order_id}/remaining-balance?remaining_balance=${encodeURIComponent(payload.remaining_balance)}`, { method: 'PUT' });
        synced = true;
      } else if (action_type === 'RECORD_DELIVERY_PAYMENT') {
        await rawRequest(`/orders/orders/${payload.order_id}/record-payment?payment_today=${encodeURIComponent(payload.payment_today)}`, { method: 'PUT' });
        synced = true;
      } else if (action_type === 'ADJUST_STOCK') {
        await rawRequest('/inventory/adjust', { method: 'POST', body: JSON.stringify(payload) });
        synced = true;
      } else if (action_type === 'CREATE_BRAND') {
        await rawRequest('/brands/', { method: 'POST', body: JSON.stringify(payload) });
        synced = true;
      }

      if (synced) {
        offlineDb.removeOfflineAction(action.action_id);
        console.log(`[Sync] ✓ ${action_type} synced`);
      }
    } catch (err) {
      console.warn(`[Sync] ✗ ${action.action_type} failed, will retry later:`, err.message);
      // Stop on first failure to preserve order, retry next time online
      break;
    }
  }
  _syncInProgress = false;
}

window.addEventListener('online', syncOfflineQueue);

const headers = {
  'Content-Type': 'application/json',
  'X-API-Key': API_KEY,
};

// Raw request (used internally by sync engine, never falls back offline)
async function rawRequest(endpoint, options = {}) {
  const url = `${API_BASE_URL}${endpoint}`;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15000);
  try {
    const response = await fetch(url, { ...options, headers: { ...headers, ...options.headers }, signal: controller.signal });
    clearTimeout(timeout);
    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      const error = new Error(errorData.detail || `HTTP Error ${response.status}`);
      error.status = response.status;
      throw error;
    }
    return await response.json();
  } catch (err) {
    clearTimeout(timeout);
    throw err;
  }
}

async function request(endpoint, options = {}) {
  const url = `${API_BASE_URL}${endpoint}`;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15000); // 15s timeout
  const config = {
    ...options,
    headers: { ...headers, ...options.headers },
    signal: controller.signal
  };
  try {
    const response = await fetch(url, config);
    clearTimeout(timeout);
    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      const error = new Error(errorData.detail || `HTTP Error ${response.status}`);
      error.status = response.status;
      throw error;
    }
    return await response.json();
  } catch (err) {
    clearTimeout(timeout);
    if (err.name === 'AbortError') {
      throw new Error('Request timed out — server unreachable');
    }
    console.warn(`[API] ${endpoint} failed:`, err.message);
    throw err;
  }
}


export const api = {
  // ─── Routes ──────────────────────────────────────────────────────────────
  getRoutes: async () => {
    try {
      const res = await request('/routes/routes');
      if (res?.routes) offlineDb.cacheMasterData(STORAGE_KEYS.ROUTES, res.routes);
      return res;
    } catch {
      if (!isDeviceOffline()) throw new Error('Unable to connect to the backend. Please try again.');
      return { success: true, routes: offlineDb.getCachedData(STORAGE_KEYS.ROUTES) };
    }
  },

  createRoute: async (data) => {
    try {
      const res = await request('/routes/routes', { method: 'POST', body: JSON.stringify(data) });
      if (res?.route) offlineDb.addLocalRoute(res.route);
      return res;
    } catch (err) {
      if (isDeviceOffline()) {
        const tempRoute = {
          route_id: `temp_route_${Date.now()}`,
          route_name: data.route_name,
          assigned_day: data.assigned_day || 'Monday',
          created_at: new Date().toISOString()
        };
        offlineDb.addLocalRoute(tempRoute);
        offlineDb.saveOfflineAction('CREATE_ROUTE', data);
        return { success: true, route: tempRoute, message: 'Saved offline' };
      }
      throw err;
    }
  },

  updateRoute: async (id, data) => {
    try {
      const res = await request(`/routes/routes/${id}`, { method: 'PUT', body: JSON.stringify(data) });
      if (res?.route) offlineDb.updateLocalRoute(id, res.route);
      return res;
    } catch (err) {
      if (!isDeviceOffline()) throw err;
      offlineDb.updateLocalRoute(id, data);
      offlineDb.saveOfflineAction('UPDATE_ROUTE', { route_id: id, data });
      return { success: true, message: 'Updated offline' };
    }
  },

  deleteRoute: async (id) => {
    try {
      const res = await request(`/routes/routes/${id}`, { method: 'DELETE' });
      offlineDb.deleteLocalRoute(id);
      return res;
    } catch (err) {
      if (!isDeviceOffline()) throw err;
      offlineDb.deleteLocalRoute(id);
      offlineDb.saveOfflineAction('DELETE_ROUTE', { route_id: id });
      return { success: true, message: 'Deleted offline' };
    }
  },

  getTodayRoute: async () => {
    try {
      const res = await request('/routes/today');
      if (res && Object.prototype.hasOwnProperty.call(res, 'route')) {
        offlineDb.cacheValue('today_route', res.route);
      }
      return res;
    } catch {
      const cached = offlineDb.getCachedValue('today_route');
      if (!isDeviceOffline() && !cached) throw new Error('Unable to connect to the backend. Please try again.');
      return { success: true, route: cached || null, message: 'Offline' };
    }
  },

  getRouteClients: async (routeId) => {
    try {
      const res = await request(`/routes/${routeId}/clients`);
      if (res?.clients) offlineDb.cacheMasterData(`route_clients_${routeId}`, res.clients);
      return res;
    } catch {
      const cached = offlineDb.getCachedData(`route_clients_${routeId}`);
      if (!isDeviceOffline() && !cached.length) throw new Error('Unable to connect to the backend. Please try again.');
      return { success: true, clients: cached || [], count: (cached || []).length };
    }
  },

  getRouteDeliveryQueue: async (routeId) => {
    try {
      const res = await request(`/routes/${routeId}/delivery-queue`);
      if (res?.queue) offlineDb.cacheMasterData(`route_queue_${routeId}`, res.queue);
      return res;
    } catch {
      const cached = offlineDb.getCachedData(`route_queue_${routeId}`, []);
      const orders = cached.length ? cached : offlineDb.getCachedData('alsyed_cache_orders', []);
      const queue = orders.filter(o => String(o.route_id) === String(routeId));
      if (!isDeviceOffline() && !cached.length) throw new Error('Unable to connect to the backend. Please try again.');
      return { success: true, queue, count: queue.length, message: 'Offline' };
    }
  },

  // ─── Areas ───────────────────────────────────────────────────────────────
  getAreas: async () => {
    try {
      const res = await request('/areas/areas');
      if (res?.areas) offlineDb.cacheMasterData(STORAGE_KEYS.AREAS, res.areas);
      return res;
    } catch {
      if (!isDeviceOffline()) throw new Error('Unable to connect to the backend. Please try again.');
      return { success: true, areas: offlineDb.getCachedData(STORAGE_KEYS.AREAS) };
    }
  },

  createArea: async (data) => {
    try {
      const res = await request('/areas/areas', { method: 'POST', body: JSON.stringify(data) });
      if (res?.area) offlineDb.addLocalArea(res.area);
      return res;
    } catch (err) {
      if (!isDeviceOffline()) throw err;
      const tempArea = {
        area_id: `temp_area_${Date.now()}`,
        route_id: data.route_id,
        area_name: data.area_name
      };
      offlineDb.addLocalArea(tempArea);
      offlineDb.saveOfflineAction('CREATE_AREA', data);
      return { success: true, area: tempArea, message: 'Saved offline' };
    }
  },

  updateArea: async (id, data) => {
    try {
      const res = await request(`/areas/areas/${id}`, { method: 'PUT', body: JSON.stringify(data) });
      if (res?.area) offlineDb.updateLocalArea(id, res.area);
      return res;
    } catch (err) {
      if (!isDeviceOffline()) throw err;
      offlineDb.updateLocalArea(id, data);
      offlineDb.saveOfflineAction('UPDATE_AREA', { area_id: id, data });
      return { success: true, message: 'Updated offline' };
    }
  },

  deleteArea: async (id) => {
    try {
      const res = await request(`/areas/areas/${id}`, { method: 'DELETE' });
      offlineDb.deleteLocalArea(id);
      return res;
    } catch (err) {
      if (!isDeviceOffline()) throw err;
      offlineDb.deleteLocalArea(id);
      offlineDb.saveOfflineAction('DELETE_AREA', { area_id: id });
      return { success: true, message: 'Deleted offline' };
    }
  },

  // ─── Clients ─────────────────────────────────────────────────────────────
  getClients: async () => {
    try {
      const res = await request('/clients/clients');
      if (res?.clients) offlineDb.cacheMasterData(STORAGE_KEYS.CLIENTS, res.clients);
      return res;
    } catch {
      if (!isDeviceOffline()) throw new Error('Unable to connect to the backend. Please try again.');
      return { success: true, clients: offlineDb.getCachedData(STORAGE_KEYS.CLIENTS) };
    }
  },

  getClient: (id) => request(`/clients/clients/${id}`),

  createClient: async (data) => {
    try {
      const res = await request('/clients/clients', { method: 'POST', body: JSON.stringify(data) });
      if (res?.client) offlineDb.addLocalClient(res.client);
      return res;
    } catch (err) {
      if (!isDeviceOffline()) throw err;
      const areas = offlineDb.getCachedData(STORAGE_KEYS.AREAS);
      const routes = offlineDb.getCachedData(STORAGE_KEYS.ROUTES);
      const area = areas.find(a => a.area_id === data.area_id);
      const route = area ? routes.find(r => r.route_id === area.route_id) : null;

      const tempClient = {
        client_id: `temp_client_${Date.now()}`,
        area_id: data.area_id,
        area_name: area?.area_name || 'General Area',
        client_name: data.client_name,
        shop_name: data.shop_name || data.client_name,
        address: data.address || '',
        phone_number: data.phone_number || null,
        previous_balance: data.previous_balance || 0,
        route_sequence: data.route_sequence || 0,
        route_name: route?.route_name || 'Default Route',
        assigned_day: route?.assigned_day || 'Monday',
        created_at: new Date().toISOString()
      };
      offlineDb.addLocalClient(tempClient);
      offlineDb.saveOfflineAction('CREATE_CLIENT', data);
      return { success: true, client: tempClient, message: 'Saved offline' };
    }
  },

  updateClient: async (id, data) => {
    try {
      const res = await request(`/clients/clients/${id}`, { method: 'PUT', body: JSON.stringify(data) });
      if (res?.client) offlineDb.updateLocalClient(id, res.client);
      return res;
    } catch (err) {
      if (!isDeviceOffline()) throw err;
      offlineDb.updateLocalClient(id, data);
      offlineDb.saveOfflineAction('UPDATE_CLIENT', { client_id: id, data });
      return { success: true, message: 'Updated offline' };
    }
  },

  deleteClient: async (id) => {
    try {
      const res = await request(`/clients/clients/${id}`, { method: 'DELETE' });
      offlineDb.deleteLocalClient(id);
      return res;
    } catch (err) {
      if (!isDeviceOffline()) throw err;
      offlineDb.deleteLocalClient(id);
      offlineDb.saveOfflineAction('DELETE_CLIENT', { client_id: id });
      return { success: true, message: 'Deleted offline' };
    }
  },

  getClientOrders: async (clientId) => {
    try {
      const res = await request(`/clients/clients/${clientId}/orders`);
      if (res?.orders) offlineDb.cacheValue(`client_orders_${clientId}`, res);
      return res;
    } catch {
      const cached = offlineDb.getCachedValue(`client_orders_${clientId}`);
      if (!isDeviceOffline() && !cached) throw new Error('Unable to connect to the backend. Please try again.');
      return cached || { success: true, orders: [], count: 0 };
    }
  },

  // ─── Products & Brands ────────────────────────────────────────────────────
  getProducts: async () => {
    try {
      const res = await request('/products/products');
      if (res?.products) offlineDb.cacheMasterData(STORAGE_KEYS.PRODUCTS, res.products);
      return res;
    } catch {
      if (!isDeviceOffline()) throw new Error('Unable to connect to the backend. Please try again.');
      return { success: true, products: offlineDb.getCachedData(STORAGE_KEYS.PRODUCTS) };
    }
  },

  createProduct: async (data) => {
    try {
      const res = await request('/products/products', { method: 'POST', body: JSON.stringify(data) });
      if (res?.product) {
        offlineDb.addLocalProduct(res.product);
      }
      return res;
    } catch (err) {
      if (!isDeviceOffline()) throw err;
      const tempProd = {
        product_id: `temp_prod_${Date.now()}`,
        product_name: data.product_name,
        brand_name: data.brand_name || 'General',
        category_name: data.category_name || 'General',
        base_price: data.base_price || 580,
        bundle_price: data.bundle_price || data.base_price || 580,
        packet_price: data.packet_price || Math.round((data.base_price || 580) / 6),
        packet_conversion_qty: 6,
        is_arshad_foods: data.is_arshad_foods || false,
        initial_stock: data.initial_stock || 100,
        created_at: new Date().toISOString()
      };
      offlineDb.addLocalProduct(tempProd);
      offlineDb.saveOfflineAction('CREATE_PRODUCT', data);
      return { success: true, product: tempProd, message: 'Saved offline' };
    }
  },


  updateProduct: async (id, data) => {
    try {
      const res = await request(`/products/products/${id}`, { method: 'PUT', body: JSON.stringify(data) });
      if (res?.product) offlineDb.updateLocalProduct(id, res.product);
      return res;
    } catch (err) {
      if (!isDeviceOffline()) throw err;
      offlineDb.updateLocalProduct(id, data);
      offlineDb.saveOfflineAction('UPDATE_PRODUCT', { product_id: id, data });
      return { success: true, message: 'Updated offline' };
    }
  },

  deleteProduct: async (id) => {
    try {
      const res = await request(`/products/products/${id}`, { method: 'DELETE' });
      offlineDb.deleteLocalProduct(id);
      return res;
    } catch (err) {
      if (!isDeviceOffline()) throw err;
      offlineDb.deleteLocalProduct(id);
      offlineDb.saveOfflineAction('DELETE_PRODUCT', { product_id: id });
      return { success: true, message: 'Deleted offline' };
    }
  },



  getBrands: async () => {
    try {
      const res = await request('/brands/');
      if (res?.brands) offlineDb.cacheMasterData(STORAGE_KEYS.BRANDS, res.brands);
      return res;
    } catch {
      if (!isDeviceOffline()) throw new Error('Unable to connect to the backend. Please try again.');
      return { success: true, brands: offlineDb.getCachedData(STORAGE_KEYS.BRANDS) };
    }
  },

  createBrand: async (data) => {
    try {
      const res = await request('/brands/', { method: 'POST', body: JSON.stringify(data) });
      const brands = offlineDb.getCachedData(STORAGE_KEYS.BRANDS);
      const newBrand = res?.brand || { brand_id: Date.now(), brand_name: data.brand_name };
      brands.push(newBrand);
      offlineDb.cacheMasterData(STORAGE_KEYS.BRANDS, brands);
      return { success: true, brand: newBrand };
    } catch (err) {
      if (!isDeviceOffline()) throw err;
      const brands = offlineDb.getCachedData(STORAGE_KEYS.BRANDS);
      const newBrand = { brand_id: `temp_b_${Date.now()}`, brand_name: data.brand_name };
      brands.push(newBrand);
      offlineDb.cacheMasterData(STORAGE_KEYS.BRANDS, brands);
      offlineDb.saveOfflineAction('CREATE_BRAND', data);
      return { success: true, brand: newBrand, message: 'Brand created offline' };
    }
  },

  updateBrand: async (oldName, newName) => {
    const prods = offlineDb.getCachedData(STORAGE_KEYS.PRODUCTS);
    const updatedProds = prods.map(p => p.brand_name === oldName ? { ...p, brand_name: newName } : p);
    offlineDb.cacheMasterData(STORAGE_KEYS.PRODUCTS, updatedProds);

    const brands = offlineDb.getCachedData(STORAGE_KEYS.BRANDS);
    const updatedBrands = brands.map(b => b.brand_name === oldName ? { ...b, brand_name: newName } : b);
    offlineDb.cacheMasterData(STORAGE_KEYS.BRANDS, updatedBrands);

    offlineDb.saveOfflineAction('UPDATE_BRAND', { oldName, newName });
    return { success: true, message: 'Brand updated' };
  },

  deleteBrand: async (brandName) => {
    const brands = offlineDb.getCachedData(STORAGE_KEYS.BRANDS);
    const updatedBrands = brands.filter(b => b.brand_name !== brandName);
    offlineDb.cacheMasterData(STORAGE_KEYS.BRANDS, updatedBrands);

    const prods = offlineDb.getCachedData(STORAGE_KEYS.PRODUCTS);
    const updatedProds = prods.map(p => p.brand_name === brandName ? { ...p, brand_name: 'General' } : p);
    offlineDb.cacheMasterData(STORAGE_KEYS.PRODUCTS, updatedProds);

    offlineDb.saveOfflineAction('DELETE_BRAND', { brandName });
    return { success: true, message: 'Brand deleted' };
  },

  getCategories: () => request('/categories/'),


  // ─── Orders & Delivery ────────────────────────────────────────────────────
  getOrders: async () => {
    try {
      const res = await request('/orders/orders');
      if (res?.orders) {
        const orders = offlineDb.applyOrderSyncJournal(res.orders);
        offlineDb.cacheMasterData('alsyed_cache_orders', orders);
        return { ...res, orders };
      }
    } catch {
      if (!isDeviceOffline()) throw new Error('Unable to connect to the backend. Please try again.');
      return { success: true, orders: offlineDb.getCachedData('alsyed_cache_orders', []) };
    }
  },

  getOrder: (id) => request(`/orders/orders/${id}`),

  createOrder: async (orderData, itemsList = []) => {
    try {
      return await request('/orders/orders', { method: 'POST', body: JSON.stringify(orderData) });
    } catch (err) {
      if (!isDeviceOffline()) throw err;
      const tempOrder = {
        order_id: `temp_order_${Date.now()}`,
        ...orderData,
        delivery_status: 'pending',
        payment_status: 'pending',
        payment_amount: 0,
        created_at: new Date().toISOString()
      };
      const orders = offlineDb.getCachedData('alsyed_cache_orders', []);
      orders.unshift(tempOrder);
      offlineDb.cacheMasterData('alsyed_cache_orders', orders);
      offlineDb.saveOfflineAction('CREATE_ORDER', { orderPayload: orderData, itemsList });
      return { success: true, order_id: tempOrder.order_id, order: tempOrder, message: 'Order saved offline' };
    }
  },

  updateOrder: async (id, data) => {
    try {
      return await request(`/orders/orders/${id}`, { method: 'PUT', body: JSON.stringify(data) });
    } catch (err) {
      if (!isDeviceOffline()) throw err;
      offlineDb.updateLocalOrder(id, data);
      offlineDb.saveOfflineAction('UPDATE_ORDER', { order_id: id, data });
      return { success: true, message: 'Order updated offline' };
    }
  },

  updateDeliveryStatus: async (id, statusVal, paymentAmount, discountAmount, orderSnapshot) => {
    try {
      const paymentQuery = paymentAmount === undefined ? '' : `&payment_amount=${encodeURIComponent(paymentAmount)}`;
      const discountQuery = discountAmount === undefined ? '' : `&discount_amount=${encodeURIComponent(discountAmount)}`;
      const res = await request(`/orders/orders/${id}/delivery-status?status_val=${encodeURIComponent(statusVal)}${paymentQuery}${discountQuery}`, { method: 'PUT' });
      let normalizedRes = res;
      if (!res?.order && res?.order_id) {
        const detail = await request(`/orders/orders/${res.order_id}`).catch(() => null);
        normalizedRes = detail?.order
          ? { ...res, ...detail }
          : {
              ...res,
              order: orderSnapshot
                ? { ...orderSnapshot, order_id: res.order_id, delivery_status: res.delivery_status || statusVal }
                : null
            };
      }
      if (normalizedRes?.order) {
        offlineDb.updateLocalOrder(id, normalizedRes.order);
        offlineDb.saveOrderSync(normalizedRes.order.order_id, normalizedRes.order);
      }
      return normalizedRes;
    } catch (err) {
      if (err.status === 404 && !isDeviceOffline() && orderSnapshot?.idempotency_key) {
        const latest = await request('/orders/orders');
        const match = latest?.orders?.find(order => order.idempotency_key === orderSnapshot.idempotency_key);
        if (match && String(match.order_id) !== String(id)) {
          return await api.updateDeliveryStatus(match.order_id, statusVal, paymentAmount, discountAmount, match);
        }
      }
      if (err.status === 404 && !isDeviceOffline() && orderSnapshot?.client_id) {
        const latest = await request('/orders/orders');
        const candidates = latest?.orders?.filter(order =>
          String(order.client_id) === String(orderSnapshot.client_id) &&
          Number(order.gross_amount || 0) === Number(orderSnapshot.gross_amount || 0) &&
          Number(order.discount || 0) === Number(orderSnapshot.discount || 0) &&
          Number(order.net_total || 0) === Number(orderSnapshot.net_total || 0)
        ) || [];
        if (candidates.length === 1 && String(candidates[0].order_id) !== String(id)) {
          return await api.updateDeliveryStatus(candidates[0].order_id, statusVal, paymentAmount, discountAmount, candidates[0]);
        }
      }
      if (!isDeviceOffline()) throw err;
      const orders = offlineDb.getCachedData('alsyed_cache_orders', []);
      const existing = orders.find(order => String(order.order_id) === String(id));
      if (!existing) {
        offlineDb.saveOfflineAction('UPDATE_DELIVERY_STATUS', { order_id: id, status_val: statusVal, payment_amount: paymentAmount, discount_amount: discountAmount });
        return { success: true, message: 'Status updated offline' };
      }

      const oldPayment = Number(existing.payment_amount || 0);
      const updatedPayment = paymentAmount === undefined ? oldPayment : Number(paymentAmount || 0);
      const oldDiscount = Number(existing.discount || 0);
      const updatedDiscount = discountAmount === undefined ? oldDiscount : Number(discountAmount || 0);
      const oldNetTotal = Number(existing.net_total || 0);
      const updatedNetTotal = discountAmount === undefined ? oldNetTotal : Number(existing.gross_amount || 0) - updatedDiscount;

      let updatedBalance;
      if (existing.delivery_status !== 'delivered' && statusVal === 'delivered') {
        // First time marking as delivered
        updatedBalance = Number(existing.previous_balance_at_order || 0) + updatedNetTotal - updatedPayment;
      } else {
        // Already delivered, updating payment/discount
        updatedBalance = Number(existing.new_balance_after_order || 0) + oldPayment - updatedPayment - oldNetTotal + updatedNetTotal;
      }

      const updatedOrder = {
        ...existing,
        delivery_status: statusVal,
        payment_amount: updatedPayment,
        discount: updatedDiscount,
        net_total: updatedNetTotal,
        new_balance_after_order: updatedBalance
      };

      offlineDb.updateLocalOrder(id, updatedOrder);
      if (statusVal === 'delivered' && existing.client_id) {
        offlineDb.updateLocalClientBalance(existing.client_id, updatedBalance);
      }
      offlineDb.saveOfflineAction('UPDATE_DELIVERY_STATUS', { order_id: id, status_val: statusVal, payment_amount: paymentAmount, discount_amount: discountAmount });
      
      return { 
        success: true, 
        message: 'Status updated offline',
        order: updatedOrder,
        client_previous_balance: updatedBalance
      };
    }
  },

  updateRemainingBalance: async (id, remainingBalance) => {
    try {
      const res = await request(`/orders/orders/${id}/remaining-balance?remaining_balance=${encodeURIComponent(remainingBalance)}`, { method: 'PUT' });
      if (res?.order) {
        offlineDb.updateLocalOrder(id, res.order);
        offlineDb.saveOrderSync(res.order.order_id, res.order);
      }
      return res;
    } catch (err) {
      // Older deployed backends may not have the dedicated endpoint yet.
      // Fall back to the existing delivery endpoint with cumulative payment.
      if (err.status === 404 && !isDeviceOffline()) {
        const orders = offlineDb.getCachedData('alsyed_cache_orders', []);
        const existing = orders.find(order => String(order.order_id) === String(id));
        if (existing) {
          const currentRemaining = Number(existing.new_balance_after_order || 0);
          const cumulativePayment = Number(existing.payment_amount || 0) + currentRemaining - Number(remainingBalance || 0);
          return await api.updateDeliveryStatus(id, 'delivered', cumulativePayment, Number(existing.discount || 0));
        }
      }
      if (!isDeviceOffline()) throw err;
      const orders = offlineDb.getCachedData('alsyed_cache_orders', []);
      const existing = orders.find(order => String(order.order_id) === String(id));
      if (!existing) throw err;
      const oldRemaining = Number(existing.new_balance_after_order || 0);
      const nextRemaining = Math.max(0, Number(remainingBalance) || 0);
      const updatedPayment = Number(existing.payment_amount || 0) + oldRemaining - nextRemaining;
      const updatedOrder = {
        ...existing,
        payment_amount: updatedPayment,
        payment_status: nextRemaining === 0 ? 'paid' : updatedPayment > 0 ? 'partial' : 'pending',
        new_balance_after_order: nextRemaining
      };
      offlineDb.updateLocalOrder(id, updatedOrder);
      if (existing.client_id) {
        const clients = offlineDb.getCachedData(STORAGE_KEYS.CLIENTS, []);
        const client = clients.find(item => String(item.client_id) === String(existing.client_id));
        if (client) {
          offlineDb.updateLocalClientBalance(
            existing.client_id,
            Number(client.previous_balance || 0) - oldRemaining + nextRemaining
          );
        }
      }
      offlineDb.saveOfflineAction('UPDATE_REMAINING_BALANCE', { order_id: id, remaining_balance: nextRemaining });
      return { success: true, order: updatedOrder, client_id: existing.client_id, client_previous_balance: nextRemaining, message: 'Remaining balance saved offline' };
    }
  },

  recordDeliveryPayment: async (id, paymentToday) => {
    try {
      const res = await request(`/orders/orders/${id}/record-payment?payment_today=${encodeURIComponent(paymentToday)}`, { method: 'PUT' });
      if (res?.order) {
        offlineDb.updateLocalOrder(id, res.order);
        offlineDb.saveOrderSync(res.order.order_id, res.order);
      }
      return res;
    } catch (err) {
      if (err.status === 404 && !isDeviceOffline()) {
        const orders = offlineDb.getCachedData('alsyed_cache_orders', []);
        const existing = orders.find(order => String(order.order_id) === String(id));
        if (existing) {
          const remaining = Math.max(0, Number(existing.new_balance_after_order || 0) - Math.max(0, Number(paymentToday) || 0));
          return await api.updateRemainingBalance(id, remaining);
        }
      }
      if (!isDeviceOffline()) throw err;
      const orders = offlineDb.getCachedData('alsyed_cache_orders', []);
      const existing = orders.find(order => String(order.order_id) === String(id));
      if (!existing) throw err;
      const databaseRemaining = Math.max(0, Number(existing.new_balance_after_order || 0));
      const appliedPayment = Math.min(Math.max(0, Number(paymentToday) || 0), databaseRemaining);
      const newRemaining = databaseRemaining - appliedPayment;
      const updatedOrder = {
        ...existing,
        payment_amount: Number(existing.payment_amount || 0) + appliedPayment,
        payment_status: newRemaining === 0 ? 'paid' : 'partial',
        new_balance_after_order: newRemaining
      };
      offlineDb.updateLocalOrder(id, updatedOrder);
      if (existing.client_id) {
        const clients = offlineDb.getCachedData(STORAGE_KEYS.CLIENTS, []);
        const client = clients.find(item => String(item.client_id) === String(existing.client_id));
        if (client) offlineDb.updateLocalClientBalance(existing.client_id, Math.max(0, Number(client.previous_balance || 0) - appliedPayment));
      }
      offlineDb.saveOfflineAction('RECORD_DELIVERY_PAYMENT', { order_id: id, payment_today: appliedPayment });
      return { success: true, order: updatedOrder, client_id: existing.client_id, client_previous_balance: newRemaining, message: 'Payment saved offline' };
    }
  },

  deleteOrder: async (id) => {
    try {
      const res = await request(`/orders/orders/${id}`, { method: 'DELETE' });
      const orders = offlineDb.getCachedData('alsyed_cache_orders', []);
      const updated = orders.filter(o => String(o.order_id) !== String(id));
      offlineDb.cacheMasterData('alsyed_cache_orders', updated);
      offlineDb.saveDeletedOrderSync(id);
      return res;
    } catch (err) {
      if (!isDeviceOffline()) throw err;
      const orders = offlineDb.getCachedData('alsyed_cache_orders', []);
      const existing = orders.find(o => String(o.order_id) === String(id));
      
      if (existing && existing.delivery_status === 'delivered' && existing.client_id) {
          const clients = offlineDb.getCachedData(STORAGE_KEYS.CLIENTS, []);
          const client = clients.find(c => String(c.client_id) === String(existing.client_id));
          if (client) {
             const revertedBal = Number(client.previous_balance || 0) - Number(existing.net_total || 0) + Number(existing.payment_amount || 0);
             offlineDb.updateLocalClientBalance(existing.client_id, revertedBal);
          }
      }

      const updated = orders.filter(o => String(o.order_id) !== String(id));
      offlineDb.cacheMasterData('alsyed_cache_orders', updated);
      offlineDb.saveDeletedOrderSync(id);
      offlineDb.saveOfflineAction('DELETE_ORDER', { order_id: id });
      return { success: true, message: 'Order deleted offline' };
    }
  },

  createOrderItem: (itemData) => request('/order-items/order-items', { method: 'POST', body: JSON.stringify(itemData) }),


  // ─── Inventory ────────────────────────────────────────────────────────────
  getInventory: async () => {
    try {
      const res = await request('/inventory/');
      if (res?.inventory) offlineDb.cacheMasterData(STORAGE_KEYS.INVENTORY, res.inventory);
      return res;
    } catch {
      if (!isDeviceOffline()) throw new Error('Unable to connect to the backend. Please try again.');
      return { success: true, inventory: offlineDb.getCachedData(STORAGE_KEYS.INVENTORY) };
    }
  },

  getMovements: async () => {
    try {
      const res = await request('/inventory/movements');
      if (res?.movements) offlineDb.cacheMasterData(STORAGE_KEYS.MOVEMENTS, res.movements);
      return res;
    } catch {
      const cached = offlineDb.getCachedData(STORAGE_KEYS.MOVEMENTS);
      if (!isDeviceOffline() && !cached.length) throw new Error('Unable to connect to the backend. Please try again.');
      return { success: true, movements: cached, message: 'Offline' };
    }
  },

  adjustStock: async (data) => {
    const inv = offlineDb.getCachedData(STORAGE_KEYS.INVENTORY);
    const updatedInv = inv.map(i => {
      if (String(i.product_id) === String(data.product_id)) {
        const change = Number(data.change_qty || 0);
        const newCurr = (i.current_qty || 0) + change;
        const newAvail = newCurr - (i.reserved_qty || 0);
        return { ...i, current_qty: newCurr, available_qty: newAvail };
      }
      return i;
    });
    offlineDb.cacheMasterData(STORAGE_KEYS.INVENTORY, updatedInv);

    try {
      return await request('/inventory/adjust', { method: 'POST', body: JSON.stringify(data) });
    } catch (err) {
      if (!isDeviceOffline()) throw err;
      offlineDb.saveOfflineAction('ADJUST_STOCK', data);
      return { success: true, message: 'Stock adjustment saved offline' };
    }
  },


  // ─── Sales & WhatsApp ─────────────────────────────────────────────────────
  getSalesSummary: async () => {
    try {
      const res = await request('/sales/summary');
      if (res) offlineDb.cacheValue(STORAGE_KEYS.SALES_SUMMARY, res);
      return res;
    } catch {
      const cached = offlineDb.getCachedValue(STORAGE_KEYS.SALES_SUMMARY);
      if (!isDeviceOffline() && !cached) throw new Error('Unable to connect to the backend. Please try again.');
      return cached || null;
    }
  },
  getArshadBreakdown: async () => {
    try {
      const res = await request('/sales/arshad-breakdown');
      if (res) offlineDb.cacheValue(STORAGE_KEYS.ARSHAD_BREAKDOWN, res);
      return res;
    } catch {
      const cached = offlineDb.getCachedValue(STORAGE_KEYS.ARSHAD_BREAKDOWN);
      if (!isDeviceOffline() && !cached) throw new Error('Unable to connect to the backend. Please try again.');
      return cached || null;
    }
  },
  sendWhatsAppIntent: (intentData) => request('/whatsapp/intent', { method: 'POST', body: JSON.stringify(intentData) }),
  getAppVersion: () => request('/app/version'),
  getThermalReceipt: (orderId) => request(`/app/thermal-receipt/${orderId}`),
};
