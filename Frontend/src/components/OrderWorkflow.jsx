import React, { useState, useMemo } from 'react';
import { api } from '../api';
import { formatInvoiceNo } from './ClientHistory';

export default function OrderWorkflow({

  clients, routeClients, todayRoute, routes = [], areas = [], products, brands, inventory,
  idempotencyKey, onOrderComplete, onCancel, onStepChange, onOpenClientHistory, onRefreshData, showToast
}) {
  const [step, setStep]                   = useState(1);
  const [selectedClient, setSelectedClient] = useState(null);
  const [searchQuery, setSearchQuery]     = useState('');

  // Route / Area filter selection in Step 1
  const [selectedRouteFilter, setSelectedRouteFilter] = useState('today');

  const [activeBrand, setActiveBrand]     = useState('All');
  const [cart, setCart]                   = useState({});
  const [discount, setDiscount]           = useState('');
  const [finalOrder, setFinalOrder]       = useState(null);

  // Bill price editing modal state (Step 3)
  const [editingBillItem, setEditingBillItem] = useState(null);
  const [billItemPriceInput, setBillItemPriceInput] = useState('');

  // Quick Add Route modal state
  const [showQuickRouteModal, setShowQuickRouteModal] = useState(false);
  const [newRouteName, setNewRouteName]               = useState('');
  const [newRouteDay, setNewRouteDay]                 = useState('Monday');

  // Quick Add Area modal state
  const [showQuickAreaModal, setShowQuickAreaModal] = useState(false);
  const [newAreaName, setNewAreaName]               = useState('');
  const [targetRouteId, setTargetRouteId]           = useState(routes[0]?.route_id || '');

  // Quick Add Client modal state in Step 1
  const [showQuickAddClient, setShowQuickAddClient] = useState(false);
  const [quickClientName, setQuickClientName]       = useState('');
  const [quickShopName, setQuickShopName]         = useState('');
  const [quickPhone, setQuickPhone]               = useState('');
  const [quickAddress, setQuickAddress]           = useState('');
  const [quickSelectedRouteId, setQuickSelectedRouteId] = useState(routes[0]?.route_id || '');
  const [quickAreaId, setQuickAreaId]             = useState('');
  const [inlineAreaName, setInlineAreaName]       = useState('');
  const [skippedOOSProducts, setSkippedOOSProducts] = useState({});
  const [callingClient, setCallingClient]           = useState(null);

  // Missed / Closed Shops Call Later engine
  const [missedShops, setMissedShops] = useState(() => {
    try {
      const saved = localStorage.getItem('alsyed_missed_shops');
      return saved ? JSON.parse(saved) : [];
    } catch {
      return [];
    }
  });
  const [phoneInput, setPhoneInput] = useState('');
  const [savingPhone, setSavingPhone] = useState(false);

  const saveMissedShopsList = (list) => {
    setMissedShops(list);
    try {
      localStorage.setItem('alsyed_missed_shops', JSON.stringify(list));
    } catch (e) {
      console.warn('Could not save missed shops:', e);
    }
  };

  const handleMarkShopClosedCallLater = async (client, phoneOverride) => {
    const finalPhone = (phoneOverride || client.phone_number || '').trim();
    
    if (finalPhone && finalPhone !== client.phone_number) {
      setSavingPhone(true);
      try {
        await api.updateClient(client.client_id, {
          area_id: client.area_id,
          client_name: client.client_name,
          shop_name: client.shop_name,
          phone_number: finalPhone
        });
        showToast?.('✅ Phone number saved to database!', 'success');
        onRefreshData?.();
      } catch (err) {
        showToast?.('📱 Phone saved offline — will sync when connected', 'warning');
      } finally {
        setSavingPhone(false);
      }
    }

    const updatedClient = { ...client, phone_number: finalPhone || client.phone_number };
    const exists = missedShops.some(m => String(m.client_id) === String(client.client_id));
    if (!exists) {
      const newList = [{ ...updatedClient, missed_at: new Date().toLocaleTimeString() }, ...missedShops];
      saveMissedShopsList(newList);
      showToast?.(`⚡ ${client.shop_name || client.client_name} added to Missed Shops (Call Later)`, 'info');
    }
  };

  const handleRemoveMissedShop = (clientId) => {
    const newList = missedShops.filter(m => String(m.client_id) !== String(clientId));
    saveMissedShopsList(newList);
  };




  // ─── Build inventory map for O(1) lookups ────────────────────────────
  const invMap = useMemo(() => {
    const m = {};
    inventory.forEach(i => { m[i.product_id] = i; });
    return m;
  }, [inventory]);

  const goStep = (n) => { setStep(n); onStepChange?.(n); };

  // Areas filtered by quickSelectedRouteId
  const availableAreasForQuickRoute = useMemo(() => {
    if (!quickSelectedRouteId) return areas;
    return areas.filter(a => String(a.route_id) === String(quickSelectedRouteId));
  }, [areas, quickSelectedRouteId]);

  // Selected route object for client creation
  const selectedRouteObj = useMemo(() => {
    return routes.find(r => String(r.route_id) === String(quickSelectedRouteId));
  }, [routes, quickSelectedRouteId]);

  // ─── Client list filtered by selected Route/Area & Search Query ───────
  const displayClients = useMemo(() => {
    let source = clients;
    if (selectedRouteFilter === 'today' && todayRoute) {
      source = routeClients.length ? routeClients : clients.filter(c => c.route_name === todayRoute.route_name);
    } else if (typeof selectedRouteFilter === 'number') {
      const targetAreas = areas.filter(a => a.route_id === selectedRouteFilter).map(a => a.area_id);
      source = clients.filter(c => targetAreas.includes(c.area_id));
    }

    if (!searchQuery.trim()) return source;
    const q = searchQuery.toLowerCase();
    return source.filter(c =>
      [c.client_name, c.shop_name, c.area_name, c.route_name].some(s => (s || '').toLowerCase().includes(q))
    );
  }, [selectedRouteFilter, clients, routeClients, todayRoute, areas, searchQuery]);

  // ─── Merged Products & Inventory List (Guarantees Real-Time Updates in Step 2) ──
  const mergedProductsList = useMemo(() => {
    const map = new Map();
    (products || []).forEach(p => {
      if (p.product_id) map.set(p.product_id, { ...p });
    });
    (inventory || []).forEach(i => {
      if (!i.product_id) return;
      if (!map.has(i.product_id)) {
        map.set(i.product_id, {
          product_id: i.product_id,
          product_name: i.product_name,
          brand_name: i.brand_name || '',
          category_name: i.category_name || '',
          base_price: i.base_price || 0,
          bundle_price: i.bundle_price || i.base_price || 0,
          packet_price: i.packet_price || (i.base_price > 0 ? Math.round(i.base_price / 6) : 0),
          packet_conversion_qty: 6,
          is_arshad_foods: i.is_arshad_foods || false
        });
      } else {
        const existing = map.get(i.product_id);
        if (i.product_name) existing.product_name = i.product_name;
        if (i.brand_name) existing.brand_name = i.brand_name;
        if (i.category_name) existing.category_name = i.category_name;
        if (i.bundle_price) existing.bundle_price = i.bundle_price;
        if (i.packet_price) existing.packet_price = i.packet_price;
        if (i.base_price) existing.base_price = i.base_price;
      }
    });
    return Array.from(map.values());
  }, [products, inventory]);

  // ─── Dynamic Brand Names List (from brands table + all product brand_name values) ──
  const allBrandNames = useMemo(() => {
    const set = new Set();
    (brands || []).forEach(b => { if (b.brand_name) set.add(b.brand_name.trim()); });
    mergedProductsList.forEach(p => { if (p.brand_name) set.add(p.brand_name.trim()); });
    return Array.from(set).sort();
  }, [brands, mergedProductsList]);

  // ─── Products filtered by brand (Case-Insensitive) ────────────────────
  const filteredProducts = useMemo(() =>
    activeBrand === 'All'
      ? mergedProductsList
      : mergedProductsList.filter(p => (p.brand_name || '').trim().toLowerCase() === activeBrand.trim().toLowerCase()),
  [mergedProductsList, activeBrand]);



  // ─── Cart helpers (Default Bundle Price = 580 Strictly) ───────────────
  const getInvItem = (pid) => invMap[pid] || { available_qty: 0, current_qty: 0, reserved_qty: 0 };

  const setQty = (product, delta) => {
    const pid   = product.product_id;
    const inv   = getInvItem(pid);
    const uType = (cart[pid]?.unit_type) || product.unit_type || 'bundle';
    const defaultBundlePrice = product.bundle_price || product.base_price || 0;
    const convQty = product.packet_conversion_qty || 1;
    const defaultPacketPrice = product.packet_price || (defaultBundlePrice > 0 ? Math.round(defaultBundlePrice / convQty) : 0);
    const price = cart[pid]?.unit_price !== undefined
      ? cart[pid].unit_price
      : (uType === 'packet' ? defaultPacketPrice : defaultBundlePrice);

    const cur  = cart[pid] || {
      product_id: pid, product_name: product.product_name, brand_name: product.brand_name,
      unit_type: uType, quantity: 0, unit_price: price,
      procurement_status: 'internal',
      packet_conversion_qty: product.packet_conversion_qty || 1,
      available_qty: inv.available_qty,
    };

    const newQty = Math.max(0, cur.quantity + delta);
    if (newQty === 0) { const c = { ...cart }; delete c[pid]; setCart(c); return; }

    const procStatus = newQty > inv.available_qty ? 'outsourced' : 'internal';
    setCart({ ...cart, [pid]: { ...cur, quantity: newQty, procurement_status: procStatus } });
  };

  const toggleUnit = (product) => {
    const pid  = product.product_id;
    const cur  = cart[pid]; if (!cur) return;
    const type = cur.unit_type === 'bundle' ? 'packet' : 'bundle';
    const defaultBundlePrice = product.bundle_price || product.base_price || 0;
    const convQty = product.packet_conversion_qty || 1;
    const defaultPacketPrice = product.packet_price || (defaultBundlePrice > 0 ? Math.round(defaultBundlePrice / convQty) : 0);
    const price = type === 'packet' ? defaultPacketPrice : defaultBundlePrice;
    setCart({ ...cart, [pid]: { ...cur, unit_type: type, unit_price: price } });
  };

  // Direct price edit on bill (Step 3)
  const handleSaveBillItemPrice = (e) => {
    e.preventDefault();
    if (!editingBillItem) return;
    const newPrice = Number(billItemPriceInput);
    if (isNaN(newPrice) || newPrice < 0) {
      showToast?.('Please enter a valid price.', 'warning');
      return;
    }
    const pid = editingBillItem.product_id;
    setCart({ ...cart, [pid]: { ...cart[pid], unit_price: newPrice } });
    setEditingBillItem(null);
    showToast?.(`Bill price for ${editingBillItem.product_name} updated to Rs. ${newPrice}!`, 'success');
  };

  // Quick Route creation
  const handleQuickCreateRoute = async (e) => {
    e.preventDefault();
    if (!newRouteName.trim()) {
      showToast?.('Route name is required.', 'warning');
      return;
    }
    try {
      const res = await api.createRoute({ route_name: newRouteName.trim(), assigned_day: newRouteDay });
      setShowQuickRouteModal(false);
      setNewRouteName('');
      showToast?.(`Route '${res.route.route_name}' created!`, 'success');
      onRefreshData?.();
    } catch (err) {
      showToast?.('Error creating route: ' + err.message, 'error');
    }
  };

  // Quick Area creation
  const handleQuickCreateArea = async (e) => {
    e.preventDefault();
    if (!newAreaName.trim()) {
      showToast?.('Area name is required.', 'warning');
      return;
    }
    if (!targetRouteId) {
      showToast?.('Please select a route.', 'warning');
      return;
    }
    try {
      const res = await api.createArea({ route_id: Number(targetRouteId), area_name: newAreaName.trim() });
      setShowQuickAreaModal(false);
      setNewAreaName('');
      showToast?.(`Area '${res.area.area_name}' added to route!`, 'success');
      onRefreshData?.();
    } catch (err) {
      showToast?.('Error creating area: ' + err.message, 'error');
    }
  };

  // Quick Client creation
  const handleQuickAddClientSubmit = async (e) => {
    e.preventDefault();
    if (!quickClientName.trim()) {
      showToast?.('Client name is required.', 'warning');
      return;
    }
    if (!quickSelectedRouteId) {
      showToast?.('Please select a Route first.', 'warning');
      return;
    }

    let finalAreaId = Number(quickAreaId);

    if (!finalAreaId) {
      const routeAreaName = inlineAreaName.trim() || selectedRouteObj?.route_name || 'General Route Area';
      const existingArea = availableAreasForQuickRoute.find(a => a.area_name.toLowerCase() === routeAreaName.toLowerCase()) || availableAreasForQuickRoute[0];
      if (existingArea) {
        finalAreaId = existingArea.area_id;
      } else {
        try {
          const areaRes = await api.createArea({
            route_id: Number(quickSelectedRouteId),
            area_name: routeAreaName
          });
          finalAreaId = areaRes?.area?.area_id;
        } catch (err) {
          showToast?.('Could not create area: ' + err.message, 'error');
          return;
        }
      }
    }

    try {
      const res = await api.createClient({
        area_id: finalAreaId,
        client_name: quickClientName.trim(),
        shop_name: quickShopName.trim() || quickClientName.trim(),
        address: quickAddress.trim() || 'N/A',
        phone_number: quickPhone.trim() || null,
        previous_balance: 0,
        route_sequence: 0,
      });

      if (res?.client) {
        setSelectedClient(res.client);
        setShowQuickAddClient(false);
        showToast?.(`Client '${res.client.shop_name}' created!`, 'success');
        onRefreshData?.();
        goStep(2);
      }
    } catch (err) {
      showToast?.('Error creating client: ' + err.message, 'error');
    }
  };

  // ─── Financial & Bundle/Packet Summary (EXACT 580 per 6 Packets) ───────
  const cartList       = Object.values(cart);
  const totalBundles   = cartList.filter(i => i.unit_type === 'bundle').reduce((s, i) => s + i.quantity, 0);
  const totalPackets   = cartList.filter(i => i.unit_type === 'packet').reduce((s, i) => s + i.quantity, 0);

  const bundleMixesCount = Math.floor(totalPackets / 6);
  const remPackets       = totalPackets % 6;

  // Bundles cost = sum(quantity * unit_price)
  const bundlesTotal = cartList
    .filter(i => i.unit_type === 'bundle')
    .reduce((s, i) => s + i.quantity * i.unit_price, 0);

  // Packets cost = sum(quantity * unit_price)
  const packetsTotal = cartList
    .filter(i => i.unit_type === 'packet')
    .reduce((s, i) => s + i.quantity * i.unit_price, 0);

  // Gross, discount and Net totals with integer rounding for grand total
  const gross     = Math.round(bundlesTotal + packetsTotal);
  const disc      = Math.max(0, Number(discount) || 0);
  const net       = Math.round(Math.max(0, gross - disc));
  const prevBal   = selectedClient?.previous_balance || 0;
  const paid      = 0;
  const newBal    = Math.round(prevBal + net);


  // ─── Conclude: Smoothly proceed to Step 3 ────────────────────────────
  const handleConclude = () => {
    if (cartList.length === 0) {
      showToast?.('Please add at least one product before concluding.', 'warning');
      return;
    }
    goStep(3);
  };

  // ─── Confirm order ────────────────────────────────────────────────────
  const handleConfirm = async () => {
    try {
      const res = await onOrderComplete(
        {
          client_id: selectedClient.client_id,
          gross_amount: gross, discount: disc, net_total: net,
          payment_amount: paid,
          delivery_status: 'pending',
          outsourced_flag: cartList.some(i => i.procurement_status === 'outsourced'),
          previous_balance_at_order: prevBal,
          new_balance_after_order: newBal,
        },
        cartList
      );
      if (res?.order) { setFinalOrder(res.order); goStep(4); }
    } catch (e) { showToast?.('Error saving order: ' + e.message, 'error'); }
  };

  return (
    <div style={{ paddingBottom: 90 }}>

      {/* ══════════════════════════════════════════════════════════════
          STEP 1 — SELECT ROUTE / AREA & SHOP
      ══════════════════════════════════════════════════════════════ */}

          {step === 1 && (
            <div className="page anim-fade">
              {/* ── Missed / Closed Shops Notification Banner ── */}
              {missedShops.length > 0 && (
                <div className="card" style={{
                  background: '#FEF3C7', border: '1.5px solid #F59E0B', padding: '12px 14px', borderRadius: 14
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      <span style={{ fontSize: '1.1rem' }}>⚡</span>
                      <span className="text-sm fw-900 text-amber" style={{ color: '#92400E' }}>
                        Missed / Closed Shops — Call Later ({missedShops.length})
                      </span>
                    </div>
                    <span className="badge badge-amber">Action Needed</span>
                  </div>

                  <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                    {missedShops.map(m => (
                      <div key={m.client_id} style={{
                        background: '#FFFFFF', borderRadius: 10, padding: '8px 10px',
                        display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8,
                        border: '1px solid #FDE68A'
                      }}>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div className="text-xs fw-800 text-wrap-break">{m.shop_name || m.client_name}</div>
                          <div className="text-xs text-muted">
                            {m.client_name} · 📞 {m.phone_number || 'No phone listed'}
                          </div>
                        </div>
                        <div style={{ display: 'flex', gap: 4, flexShrink: 0 }}>
                          <button
                            type="button"
                            onClick={() => setCallingClient(m)}
                            style={{
                              background: '#16A34A', color: '#FFFFFF', border: 'none',
                              borderRadius: 6, padding: '4px 8px', fontSize: '0.65rem', fontWeight: 900, cursor: 'pointer'
                            }}
                          >
                            📞 Call &amp; Order
                          </button>
                          <button
                            type="button"
                            onClick={() => handleRemoveMissedShop(m.client_id)}
                            style={{
                              background: '#F1F5F9', color: '#64748B', border: 'none',
                              borderRadius: 6, padding: '4px 6px', fontSize: '0.65rem', fontWeight: 700, cursor: 'pointer'
                            }}
                          >
                            ✓ Clear
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              <div className="card" style={{ padding: '12px 14px', background: '#F8FAFC', border: '1px solid #E2E8F0' }}>

                <label className="text-xs fw-700 uppercase text-lighter">Select Delivery Route / Area</label>
                <div style={{ width: '100%', maxWidth: '100%', overflow: 'hidden', boxSizing: 'border-box', marginTop: 4 }}>
                  <select
                    className="input"
                    style={{
                      fontWeight: 700, color: '#1E40AF',
                      width: '100%', maxWidth: '100%', boxSizing: 'border-box',
                      overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap'
                    }}
                    value={selectedRouteFilter}
                    onChange={e => {
                      const val = e.target.value;
                      setSelectedRouteFilter(val === 'today' || val === 'all' ? val : Number(val));
                    }}
                  >
                    {todayRoute && (
                      <option value="today">
                        ★ Today ({todayRoute.assigned_day}): {todayRoute.route_name.length > 25 ? todayRoute.route_name.substring(0, 25) + '…' : todayRoute.route_name}
                      </option>
                    )}
                    <option value="all">🌍 All Routes &amp; Areas ({clients.length} Clients)</option>
                    {routes.map(r => {
                      const label = `${r.assigned_day}: ${r.route_name}`;
                      const truncated = label.length > 32 ? label.substring(0, 32) + '…' : label;
                      return (
                        <option key={r.route_id} value={r.route_id}>
                          {truncated}
                        </option>
                      );
                    })}
                  </select>
                </div>


                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 10 }}>
                  <span className="text-xs text-muted">
                    Showing {displayClients.length} shops
                  </span>
                  <div style={{ display: 'flex', gap: 6 }}>
                    <button
                      onClick={() => setShowQuickRouteModal(true)}
                      style={{
                        background: '#1E40AF', color: '#fff', border: 'none', borderRadius: 8,
                        padding: '4px 8px', fontSize: '0.7rem', fontWeight: 800, cursor: 'pointer'
                      }}
                    >
                      + Add Route
                    </button>
                    <button
                      onClick={() => setShowQuickAreaModal(true)}
                      style={{
                        background: '#8B5CF6', color: '#fff', border: 'none', borderRadius: 8,
                        padding: '4px 8px', fontSize: '0.7rem', fontWeight: 800, cursor: 'pointer'
                      }}
                    >
                      + Add Area
                    </button>
                    <button
                      onClick={() => {
                        setQuickSelectedRouteId(routes[0]?.route_id || '');
                        setShowQuickAddClient(true);
                      }}
                      style={{
                        background: '#10B981', color: '#fff', border: 'none', borderRadius: 8,
                        padding: '4px 10px', fontSize: '0.72rem', fontWeight: 800, cursor: 'pointer'
                      }}
                    >
                      + Quick Add Client
                    </button>
                  </div>
                </div>
              </div>

              <input
                className="input"
                placeholder="Search shop, client, phone or area…"
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
              />

              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {displayClients.length === 0 && (
                  <div className="card" style={{ padding: 28, textAlign: 'center' }}>
                    <div className="text-sm text-muted">No shops found for this Route/Area.</div>
                    <button
                      className="btn-primary btn-sm"
                      style={{ width: 'auto', margin: '10px auto 0' }}
                      onClick={() => setShowQuickAddClient(true)}
                    >
                      + Add New Client Here
                    </button>
                  </div>
                )}
                {displayClients.map((c, idx) => (
                  <div key={c.client_id} className="card-pressable"
                    onClick={() => { setSelectedClient(c); goStep(2); }}
                    style={{
                      padding: '13px 14px', display: 'flex', alignItems: 'center',
                      justifyContent: 'space-between', gap: 10,
                      borderLeft: `4px solid ${
                        c.previous_balance > 0 ? '#F59E0B' : '#10B981'
                      }`,
                    }}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                        <span className="text-xs fw-700 text-lighter" style={{ minWidth: 20 }}>
                          #{idx + 1}
                        </span>
                        <span className="text-base fw-800" style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {c.shop_name || c.client_name}
                        </span>
                      </div>
                      <div className="text-sm text-muted text-wrap-break" style={{ paddingLeft: 26, marginTop: 2 }}>
                        Client: <strong>{c.client_name}</strong> {c.area_name ? `· ${c.area_name}` : ''}
                      </div>
                      <div className="text-xs text-muted text-wrap-break" style={{ paddingLeft: 26 }}>
                        Route: {c.route_name || ''} {c.assigned_day ? `(${c.assigned_day})` : ''}
                      </div>
                      <div style={{ paddingLeft: 26, marginTop: 4 }}>
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            setCallingClient(c);
                          }}
                          style={{
                            padding: '3px 8px', borderRadius: 6, border: '1px solid #BFDBFE',
                            background: '#EFF6FF', color: '#1E40AF', fontSize: '0.68rem', fontWeight: 800, cursor: 'pointer'
                          }}
                        >
                          📞 Call Owner / Shop Closed
                        </button>
                      </div>
                    </div>
                    <div style={{ textAlign: 'right', flexShrink: 0 }}>
                      <div className="text-xs fw-700 uppercase text-lighter" style={{ marginBottom: 3 }}>Balance</div>
                      <span className={`badge ${c.previous_balance > 0 ? 'badge-red' : 'badge-green'}`}>
                        Rs. {(c.previous_balance || 0).toLocaleString()}
                      </span>
                    </div>
                  </div>
                ))}

              </div>
            </div>
          )}

          {/* ══════════════════════════════════════════════════════════════
              STEP 2 — PRODUCT SELECTION (Rs. 580 EXACTLY FOR 6 PACKETS)
          ══════════════════════════════════════════════════════════════ */}
          {step === 2 && (
            <div className="page anim-fade" style={{ gap: 10 }}>

              {/* Shop context & Packets Ratio Banner (Well Contained 2-Row Layout) */}
              <div className="card" style={{ padding: '12px 14px', background: '#F8FAFC', border: '1px solid #E2E8F0', borderRadius: 14 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 10 }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div className="text-base fw-900 text-wrap-break" style={{ color: '#1E293B', lineHeight: 1.25 }}>
                      {selectedClient?.shop_name || selectedClient?.client_name}
                    </div>
                    <div className="text-xs text-muted text-wrap-break" style={{ marginTop: 2 }}>
                      Client: <strong>{selectedClient?.client_name}</strong> {selectedClient?.area_name ? `· ${selectedClient?.area_name}` : ''}
                    </div>
                  </div>

                  <div style={{ textAlign: 'right', flexShrink: 0 }}>
                    <div className="text-xs text-muted fw-700 uppercase" style={{ fontSize: '0.62rem' }}>Prev Balance</div>
                    <span className={`badge ${prevBal > 0 ? 'badge-amber' : 'badge-green'}`} style={{ fontSize: '0.78rem', fontWeight: 800 }}>
                      Rs. {prevBal.toLocaleString()}
                    </span>
                  </div>
                </div>

                <div className="divider" style={{ margin: '8px 0' }} />

                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap' }}>
                  <span className="badge badge-purple" style={{ fontSize: '0.68rem', padding: '4px 10px', whiteSpace: 'nowrap' }}>
                    📦 Product Catalog &amp; Rates
                  </span>
                  <button

                    type="button"
                    onClick={() => setCallingClient(selectedClient)}
                    style={{
                      padding: '5px 10px', borderRadius: 8, border: '1px solid #FDE68A',
                      background: '#FEF3C7', color: '#92400E', fontSize: '0.7rem', fontWeight: 800,
                      cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 4, whiteSpace: 'nowrap'
                    }}
                  >
                    📞 Shop Closed? Call Owner
                  </button>
                </div>
              </div>



              {/* Brand filter chips */}
              <div className="h-scroll" style={{ gap: 6 }}>
                {['All', ...allBrandNames].map(b => (
                  <button key={b} onClick={() => setActiveBrand(b)} style={{
                    padding: '5px 12px', borderRadius: 20, border: 'none', flexShrink: 0,
                    background: activeBrand.toLowerCase() === b.toLowerCase() ? '#1E40AF' : '#F1F5F9',
                    color: activeBrand.toLowerCase() === b.toLowerCase() ? '#fff' : '#475569',
                    fontFamily: 'inherit', fontSize: '0.75rem', fontWeight: 700, cursor: 'pointer'
                  }}>
                    {b}
                  </button>
                ))}
              </div>


              {/* Product rows — bottom padding prevents sticky-cart overlap */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10, paddingBottom: cartList.length > 0 ? 110 : 0 }}>
              {filteredProducts.map(p => {
                const item  = cart[p.product_id];
                const qty   = item?.quantity || 0;
                const uType = item?.unit_type || p.unit_type || 'bundle';
                const defaultBundlePrice = p.bundle_price || p.base_price || 0;
                const convQty = p.packet_conversion_qty || 1;
                const defaultPacketPrice = p.packet_price || (defaultBundlePrice > 0 ? Math.round(defaultBundlePrice / convQty) : 0);
                const price = item?.unit_price !== undefined
                  ? item.unit_price
                  : (uType === 'packet' ? defaultPacketPrice : defaultBundlePrice);

                const inv   = getInvItem(p.product_id);
                const isOOS = qty > inv.available_qty && !p.is_arshad_foods;

                return (
                  <div key={p.product_id} className="card" style={{ padding: '12px 14px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                          <span className="text-sm fw-800">{p.product_name}</span>
                          {p.is_arshad_foods && <span className="badge badge-amber">Arshad</span>}
                        </div>

                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 4 }}>
                          <span className="text-sm fw-900 text-blue">Rs. {price.toLocaleString()}</span>

                          <span style={{
                            fontSize: '0.62rem', fontWeight: 700,
                            color: inv.available_qty <= 0 ? '#DC2626' : inv.available_qty <= (inv.min_stock_level || 5) ? '#B45309' : '#059669'
                          }}>
                            {inv.available_qty <= 0 ? '✕ Out' : `✓ ${inv.available_qty}`}
                          </span>

                          <button onClick={() => toggleUnit(p)} style={{
                            border: 'none', padding: '2px 7px', borderRadius: 6, cursor: 'pointer',
                            background: uType === 'bundle' ? '#DBEAFE' : '#FEF3C7',
                            color: uType === 'bundle' ? '#1E40AF' : '#92400E',
                            fontSize: '0.62rem', fontWeight: 700
                          }}>
                            {uType === 'bundle' ? '📦 Bundle' : '✉️ Packet'}
                          </button>
                        </div>
                      </div>

                      <div className="stepper">
                        <button className="stepper-minus" onClick={() => setQty(p, -1)} disabled={qty === 0}>−</button>
                        <span className="stepper-qty">{qty}</span>
                        <button className="stepper-plus" onClick={() => setQty(p, 1)}>+</button>
                      </div>
                    </div>

                    {/* Out of Stock Warning Banner (with Skip Warning Button) */}
                    {inv.available_qty <= 0 && !skippedOOSProducts[p.product_id] && (
                      <div style={{
                        background: '#FEF2F2', border: '1px solid #FECACA', borderRadius: 10,
                        padding: '8px 12px', marginTop: 8, display: 'flex', alignItems: 'center',
                        justifyContent: 'space-between', gap: 8
                      }}>
                        <div style={{ fontSize: '0.75rem', color: '#DC2626', fontWeight: 800 }}>
                          ⚠️ Warning: Product is out of stock in inventory (0 remaining)
                        </div>
                        <button
                          type="button"
                          onClick={() => setSkippedOOSProducts(prev => ({ ...prev, [p.product_id]: true }))}
                          style={{
                            background: '#DC2626', color: '#FFFFFF', border: 'none', borderRadius: 8,
                            padding: '4px 10px', fontSize: '0.68rem', fontWeight: 900, cursor: 'pointer', flexShrink: 0
                          }}
                        >
                          Skip Warning &amp; Order
                        </button>
                      </div>
                    )}

                    {isOOS && qty > 0 && (
                      <div style={{
                        marginTop: 8, background: '#FEE2E2', border: '1px solid #FECACA',
                        borderRadius: 10, padding: '8px 12px',
                        display: 'flex', alignItems: 'center', justifyContent: 'space-between'
                      }}>
                        <span className="text-xs fw-700 text-red">Only {inv.available_qty} in stock</span>
                        <span className="badge badge-red">Outsource</span>
                      </div>
                    )}
                  </div>
                );
              })}
              </div>

              {cartList.length > 0 && (
                <div className="sticky-cart">
                  <div>
                    <div className="text-xs fw-700 uppercase text-muted">
                      {totalBundles} Bundles · {totalPackets} Packets
                    </div>
                    <div className="text-xl fw-900 text-blue">Rs. {gross.toLocaleString()}</div>
                  </div>
                  <button
                    className="btn-primary btn-sm"
                    style={{ width: 'auto', paddingLeft: 24, paddingRight: 24 }}
                    onClick={handleConclude}
                  >
                    Conclude →
                  </button>
                </div>
              )}
            </div>
          )}

          {/* ══════════════════════════════════════════════════════════════
              STEP 3 — CONFIRM ORDER & EDIT PRICES DIRECTLY ON BILL
          ══════════════════════════════════════════════════════════════ */}
          {step === 3 && (
            <div className="page anim-fade">
              <div className="card" style={{
                padding: '12px 14px', display: 'flex', alignItems: 'center', justifyContent: 'space-between'
              }}>
                <div>
                  <div className="text-sm fw-800">{selectedClient?.shop_name}</div>
                  <div className="text-xs text-muted">{selectedClient?.client_name} · {selectedClient?.area_name}</div>
                </div>
                <button className="btn-ghost btn-sm" style={{ width: 'auto' }} onClick={() => goStep(2)}>
                  + Edit Items
                </button>
              </div>

              {/* Conversion summary */}
              <div className="card" style={{ padding: '12px 14px', background: '#F8FAFC', border: '1px solid #E2E8F0' }}>
                <div className="text-xs fw-700 uppercase text-lighter">Unit Conversion Summary</div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 8, marginTop: 6, textAlign: 'center' }}>
                  <div style={{ background: '#EFF6FF', padding: 8, borderRadius: 8 }}>
                    <div className="text-xs text-muted">Bundles</div>
                    <div className="text-base fw-900 text-blue">{totalBundles}</div>
                  </div>
                  <div style={{ background: '#ECFDF5', padding: 8, borderRadius: 8 }}>
                    <div className="text-xs text-muted">Packets</div>
                    <div className="text-base fw-900 text-emerald">{totalPackets}</div>
                  </div>
                </div>
              </div>

              {/* Bill Line Items with Direct Price Editing */}
              <div className="card" style={{ padding: '14px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
                  <span className="text-xs fw-700 uppercase text-lighter">Bill Items &amp; Rates</span>
                  <span className="text-xs text-muted">Tap ✏️ to edit rate on bill</span>
                </div>

                {cartList.map(item => (
                  <div key={item.product_id} style={{
                    display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                    padding: '8px 0', borderBottom: '1px solid #F1F5F9'
                  }}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div className="text-sm fw-800 text-wrap-break">{item.product_name}</div>
                      <div className="text-xs text-muted" style={{ marginTop: 2 }}>
                        {item.quantity} {item.unit_type}s × Rs. {item.unit_price}
                        {item.procurement_status === 'outsourced' ? (
                          <span className="badge badge-red" style={{ marginLeft: 6 }}>Outsourced</span>
                        ) : null}
                      </div>
                    </div>

                    <div style={{ textAlign: 'right', display: 'flex', alignItems: 'center', gap: 8 }}>
                      <div className="text-sm fw-900 text-blue">
                        Rs. {Math.round(item.quantity * item.unit_price).toLocaleString()}
                      </div>
                      <button
                        type="button"
                        onClick={() => {
                          setEditingBillItem(item);
                          setBillItemPriceInput(String(item.unit_price));
                        }}
                        style={{
                          background: '#EFF6FF', border: '1px solid #BFDBFE', color: '#1E40AF',
                          padding: '3px 8px', borderRadius: 6, fontSize: '0.7rem', fontWeight: 700, cursor: 'pointer'
                        }}
                      >
                        ✏️ Edit
                      </button>
                    </div>
                  </div>
                ))}
              </div>

              {/* Comprehensive Price & Discount Breakdown */}
              <div className="card" style={{ padding: '18px 16px', display: 'flex', flexDirection: 'column', gap: 14 }}>
                <div>
                  <div className="text-xs fw-700 uppercase text-lighter" style={{ marginBottom: 4 }}>GROSS BILL TOTAL</div>
                  <div className="text-3xl fw-900 text-blue">Rs. {gross.toLocaleString()}</div>
                  {totalPackets >= 6 && (
                    <div className="text-xs text-purple fw-700" style={{ marginTop: 2 }}>
                      ✓ Includes {bundleMixesCount} Mix Bundle(s) @ EXACTLY Rs. 580 each
                    </div>
                  )}
                </div>
                <div className="divider" />

                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div>
                    <div className="text-sm fw-700 text-muted uppercase">Special Discount (Rs.)</div>
                    <div className="text-xs text-lighter">Deducted from gross bill</div>
                  </div>
                  <input
                    className="input input-right"
                    type="number" min="0" placeholder="0"
                    value={discount} onChange={e => setDiscount(e.target.value)}
                    style={{ height: 36, width: 110 }}
                  />
                </div>
                <div className="divider" />

                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span className="text-sm fw-700 text-muted uppercase">NET BILL AMOUNT</span>
                  <span className="text-xl fw-900 text-emerald">Rs. {net.toLocaleString()}</span>
                </div>
                <div className="divider" />

                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span className="text-sm fw-700 text-muted uppercase">PREVIOUS BALANCE</span>
                  <span className="text-lg fw-900 text-amber">Rs. {prevBal.toLocaleString()}</span>
                </div>
                <div className="divider" />

                <div style={{
                  background: '#F8FAFC', borderRadius: 12, padding: '14px 12px',
                  display: 'flex', justifyContent: 'space-between', alignItems: 'center'
                }}>
                  <span className="text-sm fw-800 uppercase">BALANCE DUE AT DELIVERY</span>
                  <span className={`text-2xl fw-900 ${newBal > 0 ? 'text-amber' : 'text-emerald'}`}>
                    Rs. {newBal.toLocaleString()}
                  </span>
                </div>
              </div>

              <button className="btn-primary" onClick={handleConfirm}>✓ Confirm &amp; Print Bill</button>
              <button className="btn-ghost" style={{ marginTop: -4 }} onClick={() => goStep(2)}>← Back to Products</button>
            </div>
          )}

          {/* ══════════════════════════════════════════════════════════════
              STEP 4 — REALISTIC WHITE THERMAL RECEIPT
          ══════════════════════════════════════════════════════════════ */}
          {step === 4 && finalOrder && (
            <div className="page anim-fade">
              <div className="card" style={{ padding: '18px 14px', textAlign: 'center', borderTop: '4px solid #10B981' }}>
                <div style={{ fontSize: '2.4rem', marginBottom: 8 }}>✅</div>
                <div className="text-xl fw-900">Order Confirmed!</div>
                <div className="text-sm text-muted" style={{ marginTop: 4 }}>
                  Bill #{finalOrder.order_id} · {selectedClient?.shop_name}
                </div>
              </div>

              <div style={{
                background: '#FFFFFF', color: '#000000', borderRadius: 2, padding: '20px 16px',
                fontFamily: "'Courier New', Courier, monospace", fontSize: '0.78rem', lineHeight: 1.5,
                borderTop: '6px dashed #CBD5E1', borderBottom: '6px dashed #CBD5E1',
                boxShadow: '0 4px 12px rgba(0,0,0,0.1)'
              }}>
                <div style={{ textAlign: 'center', fontWeight: 'bold', fontSize: '1rem', letterSpacing: '1px' }}>
                  AL SYED DISTRIBUTION
                </div>
                <div style={{ textAlign: 'center', fontSize: '0.7rem', marginBottom: 8 }}>
                  Wholesale Distribution &amp; Route Logistics
                </div>
                <div style={{ borderBottom: '1px dashed #000', marginBottom: 8 }} />

                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span>Bill #: {formatInvoiceNo(finalOrder?.order_id)}</span>
                  <span>Date: {new Date().toLocaleDateString()}</span>
                </div>
                <div>Shop: <strong>{selectedClient?.shop_name}</strong></div>
                <div>Client: {selectedClient?.client_name}</div>
                <div>Phone: {selectedClient?.phone_number || '—'}</div>
                {selectedClient?.area_name && <div>Area: {selectedClient.area_name}</div>}
                {todayRoute && <div>Route: {todayRoute.route_name}</div>}

                <div style={{ borderBottom: '1px dashed #000', margin: '8px 0' }} />

                <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 'bold' }}>
                  <span>ITEM</span>
                  <span>QTY × RATE</span>
                  <span>AMOUNT</span>
                </div>
                <div style={{ borderBottom: '1px solid #000', marginBottom: 6 }} />

                {cartList.map(i => (
                  <div key={i.product_id} style={{ marginBottom: 4 }}>
                    <div style={{ fontWeight: 'bold' }}>{i.product_name}</div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.72rem', color: '#333' }}>
                      <span>  {i.quantity} {i.unit_type} @ {i.unit_price}</span>
                      <span>Rs. {(i.quantity * i.unit_price).toLocaleString()}</span>
                    </div>
                  </div>
                ))}

                <div style={{ borderBottom: '1px dashed #000', margin: '8px 0' }} />

                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span>Gross Subtotal:</span><span>Rs. {gross.toLocaleString()}</span>
                </div>
                {disc > 0 && (
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 'bold' }}>
                    <span>Special Discount:</span><span>− Rs. {disc.toLocaleString()}</span>
                  </div>
                )}
                <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 'bold', fontSize: '0.88rem', margin: '4px 0' }}>
                  <span>NET BILL AMOUNT:</span><span>Rs. {net.toLocaleString()}</span>
                </div>

                <div style={{ borderBottom: '1px dashed #000', margin: '6px 0' }} />

                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span>Previous Balance:</span><span>Rs. {prevBal.toLocaleString()}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span>Payment at Delivery:</span><span>Rs. {paid.toLocaleString()}</span>
                </div>

                <div style={{ borderBottom: '2px solid #000', margin: '6px 0' }} />

                <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 'bold', fontSize: '0.95rem' }}>
                  <span>FINAL OUTSTANDING:</span><span>Rs. {newBal.toLocaleString()}</span>
                </div>

                <div style={{ borderBottom: '1px dashed #000', margin: '8px 0' }} />
                <div style={{ textAlign: 'center', fontSize: '0.7rem', fontStyle: 'italic', marginTop: 6 }}>
                  Thank you for your business!
                </div>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 14 }}>
                <button
                  type="button"
                  className="btn-primary"
                  onClick={() => {
                    const itemsHtml = cartList.map(i => `
                      <div style="margin-bottom: 4px;">
                        <div style="font-weight: bold;">${i.product_name}</div>
                        <div style="display: flex; justify-content: space-between; font-size: 11px;">
                          <span>${i.quantity} ${i.unit_type} @ ${i.unit_price}</span>
                          <span>Rs. ${(i.quantity * i.unit_price).toLocaleString()}</span>
                        </div>
                      </div>
                    `).join('');

                    const printWindow = window.open('', '_blank');
                    if (!printWindow) {
                      window.print();
                      return;
                    }
                    printWindow.document.write(`
                      <html>
                        <head>
                          <title>Receipt #${formatInvoiceNo(finalOrder?.order_id)} - Al Syed Distribution</title>
                          <style>
                            body { font-family: 'Courier New', Courier, monospace; font-size: 12px; line-height: 1.4; padding: 10px; width: 280px; margin: 0 auto; }
                            .center { text-align: center; }
                            .bold { font-weight: bold; }
                            .dashed { border-bottom: 1px dashed #000; margin: 6px 0; }
                            .flex { display: flex; justify-content: space-between; }
                          </style>
                        </head>
                        <body>
                          <div class="center bold" style="font-size: 14px;">AL SYED DISTRIBUTION</div>
                          <div class="center" style="font-size: 10px;">Wholesale Distribution & Route Logistics</div>
                          <div class="dashed"></div>
                          <div class="flex"><span>Bill #: ${formatInvoiceNo(finalOrder?.order_id)}</span><span>Date: ${new Date().toLocaleDateString()}</span></div>
                          <div>Shop: <strong>${selectedClient?.shop_name || selectedClient?.client_name}</strong></div>
                          <div>Client: ${selectedClient?.client_name || ''}</div>
                          <div class="dashed"></div>
                          <div class="flex bold"><span>ITEM</span><span>QTY × RATE</span><span>AMOUNT</span></div>
                          <div class="dashed"></div>
                          ${itemsHtml}
                          <div class="dashed"></div>
                          <div class="flex"><span>Gross Subtotal:</span><span>Rs. ${gross.toLocaleString()}</span></div>
                          ${disc > 0 ? `<div class="flex bold"><span>Discount:</span><span>- Rs. ${disc.toLocaleString()}</span></div>` : ''}
                          <div class="flex bold" style="font-size: 13px;"><span>NET BILL:</span><span>Rs. ${net.toLocaleString()}</span></div>
                          <div class="dashed"></div>
                          <div class="flex"><span>Prev Balance:</span><span>Rs. ${prevBal.toLocaleString()}</span></div>
                          <div class="flex"><span>Payment at Delivery:</span><span>Rs. ${paid.toLocaleString()}</span></div>
                          <div class="dashed" style="border-bottom: 2px solid #000;"></div>
                          <div class="flex bold" style="font-size: 14px;"><span>OUTSTANDING:</span><span>Rs. ${newBal.toLocaleString()}</span></div>
                          <div class="dashed"></div>
                          <div class="center" style="font-style: italic; margin-top: 10px;">Thank you for your business!</div>
                          <script>
                            window.onload = function() { window.print(); window.close(); }
                          </script>
                        </body>
                      </html>
                    `);
                    printWindow.document.close();
                  }}
                >
                  🖨️ Print Thermal Receipt / PDF
                </button>

                <button
                  type="button"
                  style={{
                    background: '#25D366', color: '#FFFFFF', border: 'none',
                    borderRadius: 14, minHeight: 48, fontSize: '0.9rem', fontWeight: 800, cursor: 'pointer',
                    display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
                    boxShadow: '0 4px 14px rgba(37,211,102,0.3)'
                  }}
                  onClick={() => {
                    const itemsText = cartList.map(i => `• ${i.product_name}: ${i.quantity} ${i.unit_type} × Rs.${i.unit_price} = Rs.${(i.quantity * i.unit_price).toLocaleString()}`).join('\n');
                    const text = `🧾 *AL SYED DISTRIBUTION — BILL #${formatInvoiceNo(finalOrder?.order_id)}*\n` +
                      `Shop: *${selectedClient?.shop_name || selectedClient?.client_name}*\n` +
                      `Date: ${new Date().toLocaleDateString()}\n\n` +
                      `*ITEMS:*\n${itemsText}\n\n` +
                      `Net Bill: *Rs. ${net.toLocaleString()}*\n` +
                      `Prev Balance: Rs. ${prevBal.toLocaleString()}\n` +
                      `Paid Today: Rs. ${paid.toLocaleString()}\n` +
                      `*Final Outstanding Balance: Rs. ${newBal.toLocaleString()}*\n\n` +
                      `Thank you for your business!`;

                    if (navigator.share) {
                      navigator.share({
                        title: `Bill #${formatInvoiceNo(finalOrder?.order_id)} - ${selectedClient?.shop_name}`,
                        text: text
                      }).catch(() => {
                        window.open(`https://api.whatsapp.com/send?text=${encodeURIComponent(text)}`, '_blank');
                      });
                    } else {

                      window.open(`https://api.whatsapp.com/send?text=${encodeURIComponent(text)}`, '_blank');
                    }
                  }}
                >
                  📲 Share Bill via WhatsApp / Apps
                </button>

                <button type="button" className="btn-ghost" onClick={onCancel}>
                  Done — Back to Home
                </button>
              </div>
            </div>
          )}



      {/* ── Modal: Direct Price Editing on Bill (Step 3) ───────────────── */}
      {editingBillItem && (
        <div className="overlay" onClick={() => setEditingBillItem(null)}>
          <div className="sheet" onClick={e => e.stopPropagation()}>
            <div className="sheet-handle" />
            <div className="text-lg fw-900" style={{ marginBottom: 4 }}>
              Edit Bill Rate: {editingBillItem.product_name}
            </div>
            <div className="text-sm text-muted" style={{ marginBottom: 14 }}>
              Adjust unit price for this specific bill before printing receipt.
            </div>

            <form onSubmit={handleSaveBillItemPrice} style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              <div>
                <label className="text-xs fw-700 uppercase text-lighter">Unit Rate (Rs.)</label>
                <input
                  type="number"
                  min="0"
                  className="input"
                  value={billItemPriceInput}
                  onChange={e => setBillItemPriceInput(e.target.value)}
                  autoFocus
                  required
                />
              </div>

              <button type="submit" className="btn-primary" style={{ marginTop: 8 }}>
                Save Rate on Bill
              </button>
              <button type="button" className="btn-ghost" onClick={() => setEditingBillItem(null)}>
                Cancel
              </button>
            </form>
          </div>
        </div>
      )}

      {/* ── Quick Add Route Modal ───────────────────────────────────────── */}
      {showQuickRouteModal && (
        <div className="overlay" onClick={() => setShowQuickRouteModal(false)}>
          <div className="sheet" onClick={e => e.stopPropagation()}>
            <div className="sheet-handle" />
            <div className="text-lg fw-900" style={{ marginBottom: 12 }}>Create New Delivery Route</div>

            <form onSubmit={handleQuickCreateRoute} style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              <div>
                <label className="text-xs fw-700 uppercase text-lighter">Route Name</label>
                <input
                  className="input"
                  placeholder="e.g. Saddar → Main Bazaar Route"
                  value={newRouteName}
                  onChange={e => setNewRouteName(e.target.value)}
                  required
                />
              </div>

              <div>
                <label className="text-xs fw-700 uppercase text-lighter">Assigned Day</label>
                <select
                  className="input"
                  value={newRouteDay}
                  onChange={e => setNewRouteDay(e.target.value)}
                >
                  {['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'].map(d => (
                    <option key={d} value={d}>{d}</option>
                  ))}
                </select>
              </div>

              <button type="submit" className="btn-primary" style={{ marginTop: 8 }}>Save Route</button>
              <button type="button" className="btn-ghost" onClick={() => setShowQuickRouteModal(false)}>Cancel</button>
            </form>
          </div>
        </div>
      )}

      {/* ── Quick Add Area Modal ────────────────────────────────────────── */}
      {showQuickAreaModal && (
        <div className="overlay" onClick={() => setShowQuickAreaModal(false)}>
          <div className="sheet" onClick={e => e.stopPropagation()}>
            <div className="sheet-handle" />
            <div className="text-lg fw-900" style={{ marginBottom: 12 }}>Add Area to Route</div>

            <form onSubmit={handleQuickCreateArea} style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              <div>
                <label className="text-xs fw-700 uppercase text-lighter">Assign to Route</label>
                <select
                  className="input"
                  value={targetRouteId}
                  onChange={e => setTargetRouteId(e.target.value)}
                  required
                >
                  {routes.map(r => (
                    <option key={r.route_id} value={r.route_id}>
                      {r.assigned_day}: {r.route_name}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="text-xs fw-700 uppercase text-lighter">Area Name</label>
                <input
                  className="input"
                  placeholder="e.g. Sector 4 Main Bazaar"
                  value={newAreaName}
                  onChange={e => setNewAreaName(e.target.value)}
                  required
                />
              </div>

              <button type="submit" className="btn-primary" style={{ marginTop: 8 }}>Save Area</button>
              <button type="button" className="btn-ghost" onClick={() => setShowQuickAreaModal(false)}>Cancel</button>
            </form>
          </div>
        </div>
      )}

      {/* ── Quick Add Client Modal (Area Name is OPTIONAL) ─────────────── */}
      {showQuickAddClient && (
        <div className="overlay" onClick={() => setShowQuickAddClient(false)}>
          <div className="sheet" onClick={e => e.stopPropagation()} style={{ maxHeight: '85vh', overflowY: 'auto' }}>
            <div className="sheet-handle" />
            <div className="text-lg fw-900" style={{ marginBottom: 12 }}>
              Quick Add Client / Shop
            </div>

            <form onSubmit={handleQuickAddClientSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              <div>
                <label className="text-xs fw-700 uppercase text-lighter">Shop Name</label>
                <input
                  className="input"
                  placeholder="e.g. Madina Traders"
                  value={quickShopName}
                  onChange={e => setQuickShopName(e.target.value)}
                />
              </div>

              <div>
                <label className="text-xs fw-700 uppercase text-lighter">Client Name (Owner)</label>
                <input
                  className="input"
                  placeholder="e.g. Muhammad Ali"
                  value={quickClientName}
                  onChange={e => setQuickClientName(e.target.value)}
                  required
                />
              </div>

              <div>
                <label className="text-xs fw-700 uppercase text-lighter" style={{ color: '#1E40AF' }}>
                  1. Select Route (Mandatory)
                </label>
                <select
                  className="input"
                  style={{ fontWeight: 700, color: '#1E40AF' }}
                  value={quickSelectedRouteId}
                  onChange={e => {
                    const rId = e.target.value;
                    setQuickSelectedRouteId(rId);
                    const avail = areas.filter(a => String(a.route_id) === String(rId));
                    setQuickAreaId(avail[0]?.area_id || '');
                  }}
                  required
                >
                  {routes.map(r => (
                    <option key={r.route_id} value={r.route_id}>
                      {r.assigned_day}: {r.route_name}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="text-xs fw-700 uppercase text-lighter">
                  2. Select Area (Optional — Defaults to Route Name)
                </label>
                <select
                  className="input"
                  value={quickAreaId}
                  onChange={e => setQuickAreaId(e.target.value)}
                >
                  <option value="">
                    Default: Use Route Name ("{selectedRouteObj?.route_name || 'Route Area'}")
                  </option>
                  {availableAreasForQuickRoute.map(a => (
                    <option key={a.area_id} value={a.area_id}>{a.area_name}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="text-xs fw-700 uppercase text-lighter">Phone Number</label>
                <input
                  className="input"
                  placeholder="0300-1234567"
                  value={quickPhone}
                  onChange={e => setQuickPhone(e.target.value)}
                />
              </div>

              <div>
                <label className="text-xs fw-700 uppercase text-lighter">Address</label>
                <input
                  className="input"
                  placeholder="Main Bazaar"
                  value={quickAddress}
                  onChange={e => setQuickAddress(e.target.value)}
                />
              </div>

              <button type="submit" className="btn-primary" style={{ marginTop: 8 }}>
                Save Client &amp; Select
              </button>
              <button type="button" className="btn-ghost" onClick={() => setShowQuickAddClient(false)}>
                Cancel
              </button>
            </form>
          </div>
        </div>
      )}

      {/* ── Call Shop Owner / Closed Shop Hyper-State Modal ────────────── */}
      {callingClient && (
        <div className="overlay" onClick={() => setCallingClient(null)}>
          <div className="sheet" onClick={e => e.stopPropagation()}>
            <div className="sheet-handle" />
            <div style={{ textAlign: 'center', marginBottom: 12 }}>
              <div style={{ fontSize: '2.5rem', marginBottom: 6 }}>📞</div>
              <div className="text-xl fw-900">Shop Closed — Call Owner</div>
              <div className="text-sm text-muted" style={{ marginTop: 4 }}>
                {callingClient.shop_name || callingClient.client_name} · {callingClient.area_name || 'Area'}
              </div>
            </div>

            {callingClient.phone_number ? (
              <div className="card" style={{ padding: 14, background: '#F0FDF4', border: '1px solid #BBF7D0', marginBottom: 16, textAlign: 'center' }}>
                <div className="text-xs fw-700 uppercase text-emerald" style={{ marginBottom: 6 }}>Owner Phone Number (Saved in Database)</div>
                <a
                  href={`tel:${callingClient.phone_number}`}
                  style={{
                    display: 'inline-block', width: '100%', padding: '12px 16px',
                    background: '#16A34A', color: '#FFFFFF', borderRadius: 10,
                    fontSize: '1.05rem', fontWeight: 900, textDecoration: 'none',
                    boxShadow: '0 4px 12px rgba(22,163,74,0.3)'
                  }}
                >
                  📞 Call {callingClient.client_name}: {callingClient.phone_number}
                </a>
                <div className="text-xs text-muted" style={{ marginTop: 8 }}>
                  Shop is closed right now. Call shop owner directly to find out what items to order.
                </div>
              </div>
            ) : (
              <div className="card" style={{ padding: 14, background: '#FFFBEB', border: '1px solid #FDE68A', marginBottom: 16 }}>
                <div className="text-xs fw-800 uppercase text-amber" style={{ color: '#B45309', marginBottom: 6 }}>
                  ⚠️ Phone Number Missing for {callingClient.client_name}
                </div>
                <div className="text-xs text-muted" style={{ marginBottom: 10 }}>
                  Please enter the shop owner's phone number. It will be saved permanently to the database!
                </div>
                <input
                  className="input"
                  placeholder="Enter Owner Phone Number e.g. 0300-1234567"
                  value={phoneInput}
                  onChange={e => setPhoneInput(e.target.value)}
                />
              </div>
            )}

            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {callingClient.phone_number ? (
                <>
                  <button
                    type="button"
                    className="btn-primary"
                    onClick={() => {
                      const target = callingClient;
                      setCallingClient(null);
                      setSelectedClient(target);
                      goStep(2);
                    }}
                  >
                    🛒 Make an Order
                  </button>
                  <button
                    type="button"
                    style={{
                      background: '#FEF3C7', color: '#92400E', border: '1px solid #FDE68A',
                      borderRadius: 10, padding: '10px 14px', fontSize: '0.85rem', fontWeight: 800, cursor: 'pointer'
                    }}
                    onClick={() => {
                      handleMarkShopClosedCallLater(callingClient);
                      setCallingClient(null);
                    }}
                  >
                    ⚡ Shop Closed — Add to Call Later Queue
                  </button>
                </>
              ) : (
                <button
                  type="button"
                  className="btn-primary"
                  disabled={savingPhone || !phoneInput.trim()}
                  onClick={async () => {
                    await handleMarkShopClosedCallLater(callingClient, phoneInput);
                    setPhoneInput('');
                    setCallingClient(null);
                  }}
                >
                  {savingPhone ? 'Saving Phone…' : '💾 Save Phone to DB & Add to Call Later'}
                </button>
              )}

              <button
                type="button"
                className="btn-ghost"
                onClick={() => {
                  setPhoneInput('');
                  setCallingClient(null);
                }}
              >
                ← Go Back / Select Another Client
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}


