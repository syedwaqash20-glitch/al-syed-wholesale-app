import React, { useState, useEffect, useCallback } from 'react';
import Navbar            from './components/Navbar';
import StartScreen       from './components/StartScreen';
import OrderWorkflow     from './components/OrderWorkflow';
import DeliveryWorkflow  from './components/DeliveryWorkflow';
import InventoryWorkflow from './components/InventoryWorkflow';
import DashboardReports  from './components/DashboardReports';
import ClientHistory     from './components/ClientHistory';
import RouteClientManagement from './components/RouteClientManagement';
import ProductCatalog    from './components/ProductCatalog';
import WhatsAppSimulator from './components/WhatsAppSimulator';
import Toast             from './components/Toast';
import SplashScreen      from './components/SplashScreen';
import { api }           from './api';
import { offlineDb, STORAGE_KEYS } from './offlineDb';


// ─── Global Error Boundary to prevent blank white screens ───────────────────
class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }
  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }
  componentDidCatch(error, errorInfo) {
    console.error('App Error Boundary caught:', error, errorInfo);
  }
  render() {
    if (this.state.hasError) {
      return (
        <div style={{ padding: 24, textAlign: 'center', marginTop: 40 }}>
          <div className="card" style={{ padding: 24, maxWidth: 360, margin: '0 auto', background: '#FEF2F2', border: '1px solid #FECACA' }}>
            <div style={{ fontSize: '2.5rem', marginBottom: 8 }}>📱</div>
            <div className="text-lg fw-900" style={{ color: '#DC2626' }}>View Temporarily Interrupted</div>
            <div className="text-sm text-muted" style={{ marginTop: 6, marginBottom: 16 }}>
              {this.state.error?.message || 'A temporary screen error occurred.'}
            </div>
            <button
              className="btn-primary"
              onClick={() => {
                this.setState({ hasError: false, error: null });
                if (this.props.onReset) this.props.onReset();
                else window.location.reload();
              }}
            >
              🔄 Back to Home
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

// ─── Tiny UUID generator (no dependency needed) ──────────────────────────────
function generateUUID() {

  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
    const r = (Math.random() * 16) | 0;
    return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16);
  });
}

const SCREEN_TITLES = {
  start:    'Al Syed Distribution',
  orders:   'Going for Orders',
  delivery: 'Delivery Queue',
  inventory:'Inventory',
  reports:  'Reports & Analytics',
  history:  'Client History',
  manage:   'Route & Client Setup',
  catalog:  'Product Catalog',
};


export default function App() {
  const [showSplash, setShowSplash] = useState(true);
  const [screen, setScreen]         = useState('start');
  const [prevScreen, setPrevScreen] = useState('start');
  const [orderStep, setOrderStep]   = useState(1);
  const [isOnline, setIsOnline]     = useState(navigator.onLine);
  const [offlineActions, setOfflineActions] = useState(offlineDb.getOfflineActions());
  const [syncing, setSyncing]       = useState(false);
  const [updateBanner, setUpdateBanner] = useState(null); // null | 'optional' | 'mandatory'
  const [orderIdempKey, setOrderIdempKey] = useState(generateUUID());

  // Toast notification state
  const [toast, setToast] = useState({ message: '', type: 'info' });
  const showToast = (message, type = 'info') => setToast({ message, type });

  // ─── Data ───────────────────────────────────────────────────────────────
  const [routes, setRoutes]             = useState([]);
  const [areas, setAreas]               = useState([]);
  const [todayRoute, setTodayRoute]     = useState(null);
  const [routeClients, setRouteClients] = useState([]);
  const [allClients, setAllClients]     = useState([]);
  const [products, setProducts]         = useState([]);
  const [brands, setBrands]             = useState([]);
  const [inventory, setInventory]       = useState([]);
  const [movements, setMovements]       = useState([]);
  const [orders, setOrders]             = useState([]);
  const [stats, setStats]               = useState(null);
  const [arshad, setArshad]             = useState(null);
  const dataLoadVersion = React.useRef(0);

  // Client History state
  const [historyClient, setHistoryClient] = useState(null);

  // WhatsApp sim
  const [showWA, setShowWA] = useState(false);

  // ─── Connectivity listeners ──────────────────────────────────────────────
  useEffect(() => {
    const goOnline = () => {
      setIsOnline(true);
      showToast('⚡ Internet connected. Background sync started…', 'success');
      syncQueue();
    };
    const goOffline = () => {
      setIsOnline(false);
      showToast('📱 Offline Mode — All actions saved locally.', 'warning');
    };
    window.addEventListener('online', goOnline);
    window.addEventListener('offline', goOffline);
    return () => {
      window.removeEventListener('online', goOnline);
      window.removeEventListener('offline', goOffline);
    };
  }, []);

  // ─── Initial Load ────────────────────────────────────────────────────────
  const loadAll = useCallback(async () => {
    const loadVersion = ++dataLoadVersion.current;
    const results = await Promise.allSettled([
      api.getTodayRoute(),
      api.getClients(),
      api.getRoutes(),
      api.getAreas(),
      api.getProducts(),
      api.getBrands(),
      api.getOrders(),
      api.getInventory(),
      api.getMovements(),
      api.getSalesSummary(),
      api.getArshadBreakdown(),
      api.getAppVersion(),
    ]);

    const [routeRes, clientsRes, routesRes, areasRes, prodRes, brandRes, ordersRes, invRes, movRes, salesRes, arshadRes, versionRes] = results;
  if (loadVersion !== dataLoadVersion.current) return;

    // Today's route — only read live route data when the backend provides a valid route ID.
    if (routeRes.status === 'fulfilled') {
      const route = routeRes.value?.route;
      const validRouteId = route && route.route_id !== undefined && route.route_id !== null && route.route_id !== 'undefined';

      if (validRouteId) {
        setTodayRoute(route);
        const rcRes = await api.getRouteClients(route.route_id).catch(() => null);
        if (rcRes?.clients) setRouteClients(rcRes.clients);
      } else {
        setTodayRoute(null);
        setRouteClients([]);
      }
    }

    if (clientsRes.status === 'fulfilled') setAllClients(clientsRes.value?.clients || []);
    if (routesRes.status  === 'fulfilled') setRoutes(routesRes.value?.routes || []);
    if (areasRes.status   === 'fulfilled') setAreas(areasRes.value?.areas || []);
    if (prodRes.status   === 'fulfilled') setProducts(prodRes.value?.products || []);
    if (brandRes.status  === 'fulfilled') setBrands(brandRes.value?.brands || []);
    if (ordersRes.status === 'fulfilled') setOrders(ordersRes.value?.orders || []);
    if (invRes.status    === 'fulfilled') setInventory(invRes.value?.inventory || []);
    if (movRes.status    === 'fulfilled') setMovements(movRes.value?.movements || []);
    if (salesRes.status  === 'fulfilled') setStats(salesRes.value || null);
    if (arshadRes.status === 'fulfilled') setArshad(arshadRes.value || null);

    // Version check
    if (versionRes.status === 'fulfilled') {
      const v = versionRes.value;
      const APP_VERSION = '1.0.0';
      if (v?.mandatory_update && v.min_supported_version > APP_VERSION) {
        setUpdateBanner('mandatory');
      } else if (v?.latest_version > APP_VERSION) {
        setUpdateBanner('optional');
      }
    }
  }, []);

  useEffect(() => { loadAll(); }, [loadAll]);

  // ─── Comprehensive Background Sync Engine ─────────────────────────────────
  const syncQueue = useCallback(async () => {
    const queue = offlineDb.getOfflineActions();
    if (!queue.length) return;
    setSyncing(true);
    let syncedCount = 0;

    for (const action of queue) {
      try {
        const { action_type, payload } = action;
        if (action_type === 'CREATE_ROUTE') {
          await api.createRoute(payload);
        } else if (action_type === 'UPDATE_ROUTE') {
          await api.updateRoute(payload.route_id, payload.data);
        } else if (action_type === 'DELETE_ROUTE') {
          await api.deleteRoute(payload.route_id);
        } else if (action_type === 'CREATE_AREA') {
          await api.createArea(payload);
        } else if (action_type === 'UPDATE_AREA') {
          await api.updateArea(payload.area_id, payload.data);
        } else if (action_type === 'DELETE_AREA') {
          await api.deleteArea(payload.area_id);
        } else if (action_type === 'CREATE_CLIENT') {
          await api.createClient(payload);
        } else if (action_type === 'UPDATE_CLIENT') {
          await api.updateClient(payload.client_id, payload.data);
        } else if (action_type === 'DELETE_CLIENT') {
          await api.deleteClient(payload.client_id);
        } else if (action_type === 'UPDATE_PRODUCT') {
          await api.updateProduct(payload.product_id, payload.data);
        } else if (action_type === 'DELETE_ORDER') {
          await api.deleteOrder(payload.order_id);
        } else if (action_type === 'DELETE_BRAND') {
          // Brand deletion synced via product updates; no direct endpoint needed
        } else if (action_type === 'ADJUST_STOCK') {
          await api.adjustStock(payload);
        } else if (action_type === 'UPDATE_DELIVERY_STATUS') {
          await api.updateDeliveryStatus(payload.order_id, payload.status_val, payload.payment_amount, payload.discount_amount);
        } else if (action_type === 'UPDATE_REMAINING_BALANCE') {
          await api.updateRemainingBalance(payload.order_id, payload.remaining_balance);
        } else if (action_type === 'RECORD_DELIVERY_PAYMENT') {
          await api.recordDeliveryPayment(payload.order_id, payload.payment_today);
        } else if (action_type === 'CREATE_ORDER') {
          const res = await api.createOrder(payload.orderPayload);
          if (res?.order) {
            for (const item of payload.itemsList) {
              await api.createOrderItem({ order_id: res.order.order_id, ...item });
            }
            // Offline delivery/payment actions may still reference the queue
            // action ID returned before the order had a database ID.
            for (const queuedAction of queue) {
              if (queuedAction !== action && queuedAction.payload?.order_id === action.action_id) {
                queuedAction.payload.order_id = res.order.order_id;
              }
            }
            localStorage.setItem(STORAGE_KEYS.OFFLINE_ACTIONS, JSON.stringify(queue));
          }
        }
        offlineDb.removeOfflineAction(action.action_id);
        syncedCount++;
      } catch (err) {
        console.warn('Sync action deferred:', action.action_type, err.message);
      }
    }

    setOfflineActions(offlineDb.getOfflineActions());
    setSyncing(false);
    if (syncedCount > 0) {
      loadAll();
    }
  }, [loadAll]);

  // ─── Native Mobile Pull-to-Refresh Engine ────────────────────────────────
  const [pullDistance, setPullDistance] = useState(0);
  const [isPulling, setIsPulling] = useState(false);
  const [isPullRefreshing, setIsPullRefreshing] = useState(false);
  const touchStartYRef = React.useRef(0);

  useEffect(() => {
    const handleTouchStart = (e) => {
      if (window.scrollY <= 5 && e.touches.length === 1) {
        touchStartYRef.current = e.touches[0].clientY;
        setIsPulling(true);
      }
    };

    const handleTouchMove = (e) => {
      if (!isPulling || isPullRefreshing) return;
      const currentY = e.touches[0].clientY;
      const diff = currentY - touchStartYRef.current;
      if (diff > 0 && window.scrollY <= 5) {
        const dist = Math.min(Math.pow(diff, 0.82), 85);
        setPullDistance(dist);
      } else {
        setPullDistance(0);
      }
    };

    const handleTouchEnd = async () => {
      if (pullDistance > 55 && !isPullRefreshing) {
        setIsPullRefreshing(true);
        setPullDistance(55);
        try {
          await syncQueue();
          await loadAll();
        } catch (err) {
          console.warn('Pull refresh error:', err);
        } finally {
          setTimeout(() => {
            setIsPullRefreshing(false);
            setPullDistance(0);
            setIsPulling(false);
          }, 600);
        }
      } else {
        setPullDistance(0);
        setIsPulling(false);
      }
    };

    window.addEventListener('touchstart', handleTouchStart, { passive: true });
    window.addEventListener('touchmove', handleTouchMove, { passive: true });
    window.addEventListener('touchend', handleTouchEnd);

    return () => {
      window.removeEventListener('touchstart', handleTouchStart);
      window.removeEventListener('touchmove', handleTouchMove);
      window.removeEventListener('touchend', handleTouchEnd);
    };
  }, [isPulling, isPullRefreshing, pullDistance, loadAll, syncQueue]);

  // ─── Native Mobile Hardware Back Button Interaction ───────────────────────

  useEffect(() => {
    window.history.replaceState({ screen: 'start', orderStep: 1 }, '');

    const handlePopState = () => {
      if (screen !== 'start') {
        if (screen === 'orders' && orderStep > 1) {
          setOrderStep(prev => prev - 1);
        } else {
          setScreen('start');
          setOrderStep(1);
        }
      }
    };

    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, [screen, orderStep]);

  // ─── Navigation helpers ──────────────────────────────────────────────────
  const navigate = (to) => {
    setPrevScreen(screen);
    setScreen(to);
    if (to === 'orders') setOrderIdempKey(generateUUID());
    if (to !== 'orders') setOrderStep(1);
    try {
      window.history.pushState({ screen: to, orderStep: 1 }, '');
    } catch (e) {}
  };

  const goBack = () => {
    if (screen === 'orders' && orderStep > 1) {
      setOrderStep(prev => prev - 1);
    } else {
      setScreen(prevScreen === screen ? 'start' : prevScreen);
      setOrderStep(1);
    }
  };


  // ─── Order complete handler ──────────────────────────────────────────────
  const handleOrderComplete = async (payload, items) => {
    const orderPayload = { ...payload, idempotency_key: orderIdempKey, route_id: todayRoute?.route_id || null };

    // Deduct local cache stock immediately for smooth UX
    const currentInv = offlineDb.getCachedData(STORAGE_KEYS.INVENTORY);
    const updatedInv = currentInv.map(invItem => {
      const match = items.find(i => String(i.product_id) === String(invItem.product_id));
      if (match) {
        const qtyToDeduct = Number(match.quantity || 0);
        return {
          ...invItem,
          current_qty: (invItem.current_qty || 0) - qtyToDeduct,
          available_qty: (invItem.available_qty || 0) - qtyToDeduct
        };

      }
      return invItem;
    });
    offlineDb.cacheMasterData(STORAGE_KEYS.INVENTORY, updatedInv);

    if (!navigator.onLine) {
      const saved = offlineDb.saveOfflineOrder(orderPayload, items);
      setOfflineActions(offlineDb.getOfflineActions());
      showToast('📱 Saved offline — stock deducted locally & receipt ready!', 'warning');
      return { order: { order_id: saved.action_id } };
    }
    try {
      const res = await api.createOrder(orderPayload);
      if (!res?.order) throw new Error('No order returned from server');
      for (const item of items) {
        await api.createOrderItem({ order_id: res.order.order_id, ...item });
      }
      await loadAll();
      setOrderIdempKey(generateUUID());
      showToast('✅ Order finalized & stock updated in database!', 'success');
      return res;
    } catch (e) {
      const saved = offlineDb.saveOfflineOrder(orderPayload, items);
      setOfflineActions(offlineDb.getOfflineActions());
      showToast('📱 Network issue — saved offline.', 'warning');
      return { order: { order_id: saved.action_id } };
    }
  };


  const handleDeliveryStatus = async (id, statusVal, paymentAmount, discountAmount, orderSnapshot) => {
    try {
      const res = await api.updateDeliveryStatus(id, statusVal, paymentAmount, discountAmount, orderSnapshot);
      
      // Surgically update the exact order and client in React state from the backend's source of truth
      if (res && res.order) {
        setOrders(prev => {
          const returnedId = res.order.order_id;
          const updated = prev.map(o => String(o.order_id) === String(id) || String(o.order_id) === String(returnedId)
            ? { ...o, ...res.order }
            : o);
          offlineDb.cacheMasterData('alsyed_cache_orders', updated);
          return updated;
        });
      }
      if (res && res.client_previous_balance !== undefined) {
        setAllClients(prev => prev.map(c => 
          String(c.client_id) === String(res.order?.client_id) ? { ...c, previous_balance: res.client_previous_balance } : c
        ));
      }

      showToast(`✅ Delivery updated — database synced!`, 'success');
      await loadAll();
      if (res?.order) {
        setOrders(prev => {
          const returnedId = res.order.order_id;
          const updated = prev.map(order => String(order.order_id) === String(id) || String(order.order_id) === String(returnedId)
            ? { ...order, ...res.order }
            : order);
          offlineDb.cacheMasterData('alsyed_cache_orders', updated);
          return updated;
        });
      }
      return res;
    } catch (err) {
      showToast('📱 Status updated locally — will sync when online.', 'warning');
      throw err;
    }
  };

  const handleRemainingBalance = async (id, remainingBalance) => {
    const res = await api.updateRemainingBalance(id, remainingBalance);
    if (res?.order) {
      setOrders(prev => {
        const updated = prev.map(order => String(order.order_id) === String(id) ? { ...order, ...res.order } : order);
        offlineDb.cacheMasterData('alsyed_cache_orders', updated);
        return updated;
      });
    }
    if (res?.client_id !== undefined && res?.client_previous_balance !== undefined) {
      setAllClients(prev => prev.map(client => String(client.client_id) === String(res.client_id)
        ? { ...client, previous_balance: res.client_previous_balance }
        : client));
    }
    await loadAll();
    if (res?.order) {
      setOrders(prev => {
        const updated = prev.map(order => String(order.order_id) === String(id) ? { ...order, ...res.order } : order);
        offlineDb.cacheMasterData('alsyed_cache_orders', updated);
        return updated;
      });
    }
    return res;
  };

  const handleDeliveryPayment = async (id, paymentToday) => {
    const res = await api.recordDeliveryPayment(id, paymentToday);
    if (res?.order) {
      setOrders(prev => {
        const updated = prev.map(order => String(order.order_id) === String(id) ? { ...order, ...res.order } : order);
        offlineDb.cacheMasterData('alsyed_cache_orders', updated);
        return updated;
      });
    }
    if (res?.client_id !== undefined && res?.client_previous_balance !== undefined) {
      setAllClients(prev => prev.map(client => String(client.client_id) === String(res.client_id)
        ? { ...client, previous_balance: res.client_previous_balance }
        : client));
    }
    await loadAll();
    return res;
  };



  const handleStockAdjust = async (d) => {
    // 1. Immediately update React inventory state for instant UI feedback everywhere
    const change = Number(d.change_qty || 0);
    setInventory(prev => prev.map(i => {
      if (String(i.product_id) === String(d.product_id)) {
        const newCurr = (i.current_qty || 0) + change;
        const newAvail = newCurr - (i.reserved_qty || 0);
        return { ...i, current_qty: newCurr, available_qty: newAvail };
      }
      return i;
    }));

    // 2. Update database and local cache, then reload from DB to confirm truth
    try {
      await api.adjustStock(d);
      showToast('✅ Stock adjusted & saved to database!', 'success');
    } catch (err) {
      showToast('⚠️ Saved offline — will sync when online.', 'warning');
    }

    // 3. Reload from DB to confirm final state
    await loadAll();
  };

  const handleWA = async (p) => {
    const r = await api.sendWhatsAppIntent(p);
    await loadAll();
    return r;
  };

  const openClientHistory = (client) => {
    setHistoryClient(client);
    navigate('history');
  };

  return (
    <div>
      {showSplash && <SplashScreen onComplete={() => setShowSplash(false)} />}

      {/* ── Toast Notifications System ─────────────────────────────────── */}
      <Toast
        message={toast.message}
        type={toast.type}
        onClose={() => setToast({ message: '', type: 'info' })}
      />

      {/* ── Mandatory Update Banner ────────────────────────────────────── */}
      {updateBanner === 'mandatory' && (
        <div style={{
          position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.92)',
          zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24
        }}>
          <div className="card" style={{ padding: 24, textAlign: 'center', maxWidth: 340 }}>
            <div style={{ fontSize: '2rem', marginBottom: 10 }}>🔄</div>
            <div className="text-lg fw-900" style={{ marginBottom: 8 }}>Update Required</div>
            <div className="text-sm text-muted" style={{ marginBottom: 20 }}>
              A new mandatory version of Al Syed Distribution App is available. Please update to continue.
            </div>
            <a href="https://play.google.com/store" target="_blank" rel="noreferrer">
              <button className="btn-primary">Update Now</button>
            </a>
          </div>
        </div>
      )}

      {/* ── Top Header ────────────────────────────────────────────────── */}
      <Navbar
        activeScreen={screen}
        title={SCREEN_TITLES[screen]}
        onBack={goBack}
        isOnline={isOnline}
        step={orderStep}
        totalSteps={3}
        todayRoute={todayRoute}
        onSync={syncQueue}
        isSyncing={syncing}
        pendingSyncCount={offlineActions.length}
      />

      {/* ── Native Pull to Refresh Circular Indicator ── */}

      <div
        style={{
          position: 'fixed',
          top: 55 + (pullDistance > 0 ? pullDistance : 0),
          left: '50%',
          transform: 'translateX(-50%)',
          zIndex: 9999,
          width: 38,
          height: 38,
          borderRadius: '50%',
          background: '#FFFFFF',
          boxShadow: '0 4px 14px rgba(0,0,0,0.2)',
          border: '1px solid #CBD5E1',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          opacity: pullDistance > 10 || isPullRefreshing ? 1 : 0,
          transition: isPullRefreshing || pullDistance === 0 ? 'top 0.25s cubic-bezier(.16,1,.3,1), opacity 0.2s ease' : 'none',
          pointerEvents: 'none'
        }}
      >
        <span
          style={{
            fontSize: '1.1rem',
            display: 'inline-block',
            transform: `rotate(${isPullRefreshing ? 0 : pullDistance * 4.5}deg)`,
            animation: isPullRefreshing ? 'spin 0.8s linear infinite' : 'none',
            lineHeight: 1
          }}
        >
          🔄
        </span>
      </div>



      {/* ── Optional Update Banner ─────────────────────────────────────── */}
      {updateBanner === 'optional' && (
        <div style={{
          background: '#DBEAFE', borderBottom: '1px solid #BFDBFE',
          padding: '8px 16px', display: 'flex', alignItems: 'center', justifyContent: 'space-between'
        }}>
          <span style={{ fontSize: '0.78rem', fontWeight: 700, color: '#1E40AF' }}>
            🔄 A new version is available
          </span>
          <button onClick={() => setUpdateBanner(null)} style={{
            background: 'none', border: 'none', color: '#1E40AF',
            fontSize: '0.72rem', fontWeight: 700, cursor: 'pointer'
          }}>Dismiss</button>
        </div>
      )}

      {/* ── Screens ───────────────────────────────────────────────────── */}
      <ErrorBoundary key={screen} onReset={() => navigate('start')}>
        {screen === 'start' && (
          <StartScreen
            onNavigate={navigate}
            stats={stats}
            todayRoute={todayRoute}
            routeClients={routeClients}
            orders={orders}
            onOpenWhatsAppSim={() => setShowWA(true)}
          />
        )}
        {screen === 'orders' && (
          <OrderWorkflow
            clients={allClients}
            routeClients={routeClients}
            todayRoute={todayRoute}
            routes={routes}
            areas={areas}
            products={products}
            brands={brands}
            inventory={inventory}
            idempotencyKey={orderIdempKey}
            onOrderComplete={handleOrderComplete}
            onCancel={() => navigate('start')}
            onStepChange={setOrderStep}
            onOpenClientHistory={openClientHistory}
            onRefreshData={loadAll}
            showToast={showToast}
          />
        )}
        {screen === 'delivery' && (
          <DeliveryWorkflow
            orders={orders}
            todayRoute={todayRoute}
            routes={routes}
            onUpdateStatus={handleDeliveryStatus}
            onUpdateRemainingBalance={handleRemainingBalance}
            onRecordPayment={handleDeliveryPayment}
            onRefresh={loadAll}
            showToast={showToast}
          />
        )}

        {screen === 'inventory' && (
          <InventoryWorkflow
            inventory={inventory}
            movements={movements}
            arshadData={arshad}
            onAdjustStock={handleStockAdjust}
            onRefresh={loadAll}
            showToast={showToast}
          />
        )}
        {screen === 'reports' && (
          <DashboardReports
            stats={stats}
            arshadData={arshad}
            todayRoute={todayRoute}
            orders={orders}
          />
        )}
        {screen === 'history' && (
          <ClientHistory
            client={historyClient}
            allClients={allClients}
            allOrders={orders}
            routes={routes}
            onBack={goBack}
          />
        )}

        {screen === 'manage' && (
          <RouteClientManagement
            routes={routes}
            clients={allClients}
            areas={areas}
            todayRoute={todayRoute}
            orders={orders}
            onRefresh={loadAll}
            onBack={goBack}
            showToast={showToast}
          />
        )}

        {screen === 'catalog' && (
          <ProductCatalog
            products={products}
            brands={brands}
            categories={[]}
            inventory={inventory}
          />
        )}
      </ErrorBoundary>



      {/* ── WhatsApp Simulator ─────────────────────────────────────────── */}
      {showWA && (
        <WhatsAppSimulator onClose={() => setShowWA(false)} onSendIntent={handleWA} />
      )}

      {/* ── Persistent Bottom Navigation ────────────────────────────── */}
      <nav className="bottom-nav">
        {[
          { key: 'start',     icon: '🏠', label: 'Home'      },
          { key: 'orders',    icon: '🛍️', label: 'Orders'    },
          { key: 'delivery',  icon: '🚚', label: 'Delivery'  },
          { key: 'inventory', icon: '📦', label: 'Inventory' },
          { key: 'reports',   icon: '📊', label: 'Reports'   },
        ].map(t => (
          <button
            key={t.key}
            className={`nav-tab ${screen === t.key ? 'active' : ''}`}
            onClick={() => navigate(t.key)}
          >
            <span className="nav-icon">{t.icon}</span>
            {t.label}
          </button>
        ))}
      </nav>
    </div>
  );
}
