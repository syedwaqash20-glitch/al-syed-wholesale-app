import React, { useState, useMemo } from 'react';
import { api } from '../api';

const WEEKDAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];

export default function RouteClientManagement({
  routes, clients, areas, todayRoute, orders = [], onRefresh, onBack, showToast
}) {
  const [activeTab, setActiveTab] = useState('routes'); // 'routes' | 'clients' | 'route_history'
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedRouteId, setSelectedRouteId] = useState(todayRoute?.route_id || (routes[0]?.route_id || null));

  // Modals
  const [showRouteModal, setShowRouteModal] = useState(false);
  const [editingRoute, setEditingRoute] = useState(null);

  const [showClientModal, setShowClientModal] = useState(false);
  const [editingClient, setEditingClient] = useState(null);

  const [showAreaModal, setShowAreaModal] = useState(false);
  const [editingArea, setEditingArea] = useState(null);
  const [newAreaName, setNewAreaName] = useState('');
  const [areaRouteId, setAreaRouteId] = useState(routes[0]?.route_id || '');

  // Form states - Route
  const [routeNameInput, setRouteNameInput] = useState('');
  const [assignedDayInput, setAssignedDayInput] = useState('Monday');

  // Form states - Client
  const [clientNameInput, setClientNameInput] = useState('');
  const [shopNameInput, setShopNameInput] = useState('');
  const [addressInput, setAddressInput] = useState('');
  const [phoneInput, setPhoneInput] = useState('');
  const [prevBalInput, setPrevBalInput] = useState('0');
  const [routeIdInput, setRouteIdInput] = useState(routes[0]?.route_id || '');
  const [areaIdInput, setAreaIdInput] = useState('');
  const [routeSeqInput, setRouteSeqInput] = useState('0');

  // Today's formatted date string
  const todayFormatted = useMemo(() => {
    return new Date().toLocaleDateString('en-US', {
      weekday: 'long',
      year: 'numeric',
      month: 'short',
      day: 'numeric'
    });
  }, []);

  // Filter available areas for currently selected route in client modal
  const availableAreas = useMemo(() => {
    if (!routeIdInput) return areas;
    return areas.filter(a => String(a.route_id) === String(routeIdInput));
  }, [areas, routeIdInput]);

  const selectedRouteObjInModal = useMemo(() => {
    return routes.find(r => String(r.route_id) === String(routeIdInput));
  }, [routes, routeIdInput]);

  // Filter clients by search query & selected route
  const filteredClients = useMemo(() => {
    let list = clients;
    if (activeTab === 'routes' && selectedRouteId) {
      list = list.filter(c => {
        const area = areas.find(a => a.area_id === c.area_id);
        return area ? area.route_id === selectedRouteId : false;
      });
    }
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      list = list.filter(c =>
        [c.client_name, c.shop_name, c.area_name, c.route_name, c.address, c.phone_number]
          .some(field => (field || '').toLowerCase().includes(q))
      );
    }
    return [...list].sort((a, b) => (a.route_sequence || 0) - (b.route_sequence || 0));
  }, [clients, areas, selectedRouteId, searchQuery, activeTab]);

  // Filter historical bills for selected route
  const routeOrdersHistory = useMemo(() => {
    if (!selectedRouteId) return orders;
    return orders.filter(o => o.route_id === selectedRouteId);
  }, [orders, selectedRouteId]);

  // ─── Route Handlers ────────────────────────────────────────────────────────
  const openNewRouteModal = () => {
    setEditingRoute(null);
    setRouteNameInput('');
    setAssignedDayInput('Monday');
    setShowRouteModal(true);
  };

  const openEditRouteModal = (r) => {
    setEditingRoute(r);
    setRouteNameInput(r.route_name);
    setAssignedDayInput(r.assigned_day || 'Monday');
    setShowRouteModal(true);
  };

  const handleSaveRoute = async (e) => {
    e.preventDefault();
    if (!routeNameInput.trim()) {
      showToast?.('Route name is required.', 'warning');
      return;
    }
    try {
      if (editingRoute) {
        await api.updateRoute(editingRoute.route_id, {
          route_name: routeNameInput.trim(),
          assigned_day: assignedDayInput
        });
        showToast?.('Route updated successfully!', 'success');
      } else {
        await api.createRoute({
          route_name: routeNameInput.trim(),
          assigned_day: assignedDayInput
        });
        showToast?.('Route created successfully!', 'success');
      }
      setShowRouteModal(false);
      onRefresh?.();
    } catch (err) {
      showToast?.('Error saving route: ' + err.message, 'error');
    }
  };

  const handleDeleteRoute = async (routeId) => {
    if (!window.confirm('Delete this route? Linked areas and clients will need reassignment.')) return;
    try {
      await api.deleteRoute(routeId);
      showToast?.('Route deleted.', 'info');
      onRefresh?.();
    } catch (err) {
      showToast?.('Cannot delete route: ' + err.message, 'error');
    }
  };

  // ─── Area Handlers ─────────────────────────────────────────────────────────
  const openNewAreaModal = (routeId) => {
    setEditingArea(null);
    setNewAreaName('');
    setAreaRouteId(routeId || routes[0]?.route_id || '');
    setShowAreaModal(true);
  };

  const handleSaveArea = async (e) => {
    e.preventDefault();
    if (!newAreaName.trim()) {
      showToast?.('Area name is required.', 'warning');
      return;
    }
    if (!areaRouteId) {
      showToast?.('Route selection is required.', 'warning');
      return;
    }
    try {
      if (editingArea) {
        await api.updateArea(editingArea.area_id, {
          route_id: Number(areaRouteId),
          area_name: newAreaName.trim()
        });
        showToast?.('Area updated!', 'success');
      } else {
        await api.createArea({
          route_id: Number(areaRouteId),
          area_name: newAreaName.trim()
        });
        showToast?.('Area created!', 'success');
      }
      setShowAreaModal(false);
      setNewAreaName('');
      onRefresh?.();
    } catch (err) {
      showToast?.('Error saving area: ' + err.message, 'error');
    }
  };

  const handleDeleteArea = async (areaId) => {
    if (!window.confirm('Delete this area?')) return;
    try {
      await api.deleteArea(areaId);
      showToast?.('Area deleted.', 'info');
      onRefresh?.();
    } catch (err) {
      showToast?.('Cannot delete area: ' + err.message, 'error');
    }
  };

  // ─── Client Handlers ───────────────────────────────────────────────────────
  const openNewClientModal = () => {
    if (routes.length === 0) {
      showToast?.('No routes available! Create a route first.', 'warning');
      openNewRouteModal();
      return;
    }
    setEditingClient(null);
    setClientNameInput('');
    setShopNameInput('');
    setAddressInput('');
    setPhoneInput('');
    setPrevBalInput('0');
    const firstRouteId = routes[0]?.route_id || '';
    setRouteIdInput(firstRouteId);
    const firstArea = areas.find(a => String(a.route_id) === String(firstRouteId));
    setAreaIdInput(firstArea?.area_id || '');
    setRouteSeqInput('0');
    setShowClientModal(true);
  };

  const openEditClientModal = (c) => {
    setEditingClient(c);
    setClientNameInput(c.client_name || '');
    setShopNameInput(c.shop_name || '');
    setAddressInput(c.address || '');
    setPhoneInput(c.phone_number || '');
    setPrevBalInput(String(c.previous_balance || 0));

    const curArea = areas.find(a => a.area_id === c.area_id);
    setRouteIdInput(curArea?.route_id || routes[0]?.route_id || '');
    setAreaIdInput(String(c.area_id || ''));
    setRouteSeqInput(String(c.route_sequence || 0));
    setShowClientModal(true);
  };

  const handleSaveClient = async (e) => {
    e.preventDefault();
    if (!clientNameInput.trim()) {
      showToast?.('Client name is required.', 'warning');
      return;
    }
    if (!routeIdInput) {
      showToast?.('Please select a Route first.', 'warning');
      return;
    }

    let finalAreaId = Number(areaIdInput);

    // If Area is left blank/unselected, use default area for this route (or create one named after the route)
    if (!finalAreaId) {
      const defaultArea = availableAreas[0];
      if (defaultArea) {
        finalAreaId = defaultArea.area_id;
      } else {
        const routeName = selectedRouteObjInModal?.route_name || 'Route Area';
        try {
          const res = await api.createArea({ route_id: Number(routeIdInput), area_name: routeName });
          finalAreaId = res?.area?.area_id;
        } catch (err) {
          showToast?.('Could not assign default area: ' + err.message, 'error');
          return;
        }
      }
    }

    const payload = {
      area_id: finalAreaId,
      client_name: clientNameInput.trim(),
      shop_name: shopNameInput.trim() || clientNameInput.trim(),
      address: addressInput.trim() || 'N/A',
      phone_number: phoneInput.trim() || null,
      previous_balance: Number(prevBalInput) || 0,
      route_sequence: Number(routeSeqInput) || 0,
    };

    try {
      if (editingClient) {
        await api.updateClient(editingClient.client_id, payload);
        showToast?.('Client details updated!', 'success');
      } else {
        await api.createClient(payload);
        showToast?.('New client created!', 'success');
      }
      setShowClientModal(false);
      onRefresh?.();
    } catch (err) {
      showToast?.('Error saving client: ' + err.message, 'error');
    }
  };

  const handleDeleteClient = async (clientId) => {
    if (!window.confirm('Delete this client record?')) return;
    try {
      await api.deleteClient(clientId);
      showToast?.('Client deleted.', 'info');
      onRefresh?.();
    } catch (err) {
      showToast?.('Error deleting client: ' + err.message, 'error');
    }
  };

  const handleShiftSequence = async (client, delta) => {
    const newSeq = Math.max(0, (client.route_sequence || 0) + delta);
    try {
      await api.updateClient(client.client_id, { route_sequence: newSeq });
      onRefresh?.();
    } catch (err) {
      console.warn('Sequence update error:', err);
    }
  };

  const activeRouteObj = routes.find(r => r.route_id === selectedRouteId);

  return (
    <div className="page anim-fade" style={{ paddingBottom: 90 }}>

      {/* ── Date & Delivery Header ──────────────────────────────────────── */}
      <div className="card" style={{ padding: '14px 16px', background: 'linear-gradient(135deg, #0F172A 0%, #1E293B 100%)', color: '#fff' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <div className="text-xs fw-700 uppercase" style={{ color: '#94A3B8' }}>Today's Date &amp; Schedule</div>
            <div className="text-base fw-900" style={{ color: '#F8FAFC', marginTop: 2 }}>{todayFormatted}</div>
          </div>
          <span className="badge" style={{ background: '#2563EB', color: '#fff' }}>
            {todayRoute ? `Active: ${todayRoute.assigned_day}` : 'No Active Route'}
          </span>
        </div>
      </div>

      {/* ── Main Tab Navigation ────────────────────────────────────────── */}
      <div style={{ display: 'flex', gap: 6 }}>
        <button
          onClick={() => setActiveTab('routes')}
          style={{
            flex: 1, padding: '9px 0', borderRadius: 10, border: 'none',
            background: activeTab === 'routes' ? '#1E40AF' : '#F1F5F9',
            color: activeTab === 'routes' ? '#fff' : '#64748B',
            fontFamily: 'inherit', fontSize: '0.75rem', fontWeight: 700, cursor: 'pointer'
          }}
        >
          🗺️ Routes ({routes.length})
        </button>
        <button
          onClick={() => setActiveTab('route_history')}
          style={{
            flex: 1, padding: '9px 0', borderRadius: 10, border: 'none',
            background: activeTab === 'route_history' ? '#1E40AF' : '#F1F5F9',
            color: activeTab === 'route_history' ? '#fff' : '#64748B',
            fontFamily: 'inherit', fontSize: '0.75rem', fontWeight: 700, cursor: 'pointer'
          }}
        >
          📜 Route Bills History
        </button>
        <button
          onClick={() => setActiveTab('clients')}
          style={{
            flex: 1, padding: '9px 0', borderRadius: 10, border: 'none',
            background: activeTab === 'clients' ? '#1E40AF' : '#F1F5F9',
            color: activeTab === 'clients' ? '#fff' : '#64748B',
            fontFamily: 'inherit', fontSize: '0.75rem', fontWeight: 700, cursor: 'pointer'
          }}
        >
          🏪 All Clients ({clients.length})
        </button>
      </div>

      {/* ── SEARCH BAR & QUICK ACTIONS ─────────────────────────────────── */}
      <div style={{ display: 'flex', gap: 8 }}>
        <input
          className="input"
          style={{ flex: 1 }}
          placeholder="Search client, shop, area, or route…"
          value={searchQuery}
          onChange={e => setSearchQuery(e.target.value)}
        />
        <button
          onClick={openNewClientModal}
          style={{
            background: '#10B981', color: '#fff', border: 'none', borderRadius: 10,
            padding: '0 14px', fontSize: '0.75rem', fontWeight: 800, cursor: 'pointer',
            whiteSpace: 'nowrap'
          }}
        >
          + New Client
        </button>
      </div>

      {/* ══════════════════════════════════════════════════════════════════
          TAB 1: ROUTES & DELIVERY SCHEDULE
      ══════════════════════════════════════════════════════════════════ */}
      {activeTab === 'routes' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>

          {/* Route selector chips */}
          <div className="h-scroll" style={{ gap: 8, paddingBottom: 4 }}>
            {routes.map(r => (
              <button
                key={r.route_id}
                onClick={() => setSelectedRouteId(r.route_id)}
                style={{
                  padding: '7px 14px', borderRadius: 20, border: 'none', flexShrink: 0,
                  background: selectedRouteId === r.route_id ? '#1E40AF' : '#F1F5F9',
                  color: selectedRouteId === r.route_id ? '#fff' : '#475569',
                  fontFamily: 'inherit', fontSize: '0.75rem', fontWeight: 700, cursor: 'pointer',
                  display: 'flex', alignItems: 'center', gap: 6,
                  maxWidth: 280, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap'
                }}
              >
                <span>{r.assigned_day}: {r.route_name}</span>
              </button>
            ))}
            <button
              onClick={openNewRouteModal}
              style={{
                padding: '7px 14px', borderRadius: 20, border: '1px dashed #2563EB', flexShrink: 0,
                background: '#EFF6FF', color: '#2563EB', fontFamily: 'inherit',
                fontSize: '0.75rem', fontWeight: 800, cursor: 'pointer'
              }}
            >
              + Add Route
            </button>
          </div>

          {/* Active Route Detail Card */}
          {activeRouteObj ? (
            <div className="card" style={{ padding: '14px 16px', background: '#F8FAFC', border: '1px solid #E2E8F0' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 10 }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <span className="badge badge-blue">{activeRouteObj.assigned_day} Route</span>
                  <div className="text-base fw-900 text-wrap-break" style={{ marginTop: 4 }}>{activeRouteObj.route_name}</div>
                  <div className="text-xs text-muted" style={{ marginTop: 2 }}>
                    {filteredClients.length} clients assigned in delivery sequence
                  </div>
                </div>


                <div style={{ display: 'flex', gap: 6 }}>
                  <button
                    onClick={() => openEditRouteModal(activeRouteObj)}
                    style={{
                      padding: '4px 10px', borderRadius: 8, border: '1px solid #CBD5E1',
                      background: '#fff', fontSize: '0.72rem', fontWeight: 700, cursor: 'pointer'
                    }}
                  >
                    Edit Route
                  </button>
                  <button
                    onClick={() => handleDeleteRoute(activeRouteObj.route_id)}
                    style={{
                      padding: '4px 10px', borderRadius: 8, border: '1px solid #FCA5A5',
                      background: '#FEE2E2', color: '#DC2626', fontSize: '0.72rem', fontWeight: 700, cursor: 'pointer'
                    }}
                  >
                    Delete
                  </button>
                </div>
              </div>

              <div style={{ marginTop: 10, display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
                <span className="text-xs fw-700 text-lighter">Areas on route:</span>
                {areas.filter(a => a.route_id === activeRouteObj.route_id).map(a => (
                  <span key={a.area_id} className="badge badge-purple" style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                    {a.area_name}
                    <button
                      onClick={() => handleDeleteArea(a.area_id)}
                      style={{ background: 'none', border: 'none', color: '#DC2626', cursor: 'pointer', fontSize: '0.65rem' }}
                    >✕</button>
                  </span>
                ))}
                <button
                  onClick={() => openNewAreaModal(activeRouteObj.route_id)}
                  style={{ background: 'none', border: 'none', color: '#2563EB', fontSize: '0.72rem', fontWeight: 700, cursor: 'pointer' }}
                >
                  + Add Area
                </button>
              </div>
            </div>
          ) : (
            <div className="card" style={{ padding: 24, textAlign: 'center', background: '#FFFBEB', border: '1px solid #FDE68A' }}>
              <div className="text-sm fw-800 text-amber">No Delivery Routes Created Yet</div>
              <button className="btn-primary btn-sm" style={{ width: 'auto', margin: '10px auto 0' }} onClick={openNewRouteModal}>
                + Create First Route Now
              </button>
            </div>
          )}

          {/* Route Client Sequence List */}
          <div className="text-xs fw-700 uppercase text-lighter" style={{ paddingLeft: 4 }}>
            Route Sequence ({filteredClients.length} Shops)
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {filteredClients.length === 0 && (
              <div className="card" style={{ padding: 24, textAlign: 'center' }}>
                <div className="text-sm text-muted">No shops assigned to this route yet.</div>
                <button className="btn-primary btn-sm" style={{ width: 'auto', margin: '10px auto 0' }} onClick={openNewClientModal}>
                  + Add Client to Route
                </button>
              </div>
            )}

            {filteredClients.map((c, idx) => (
              <div key={c.client_id} className="card" style={{ padding: '12px 14px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10 }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <span className="badge badge-blue" style={{ minWidth: 26, textAlign: 'center' }}>#{idx + 1}</span>
                      <span className="text-base fw-800" style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {c.shop_name || c.client_name}
                      </span>
                    </div>
                    <div className="text-xs text-muted" style={{ paddingLeft: 34, marginTop: 2 }}>
                      {c.client_name} {c.area_name ? `· Area: <strong>${c.area_name}</strong>` : ''} {c.route_name || activeRouteObj?.route_name ? `· Route: <strong className="text-blue">${c.route_name || activeRouteObj?.route_name}</strong>` : ''}
                    </div>
                    <div className="text-xs text-muted" style={{ marginTop: 4 }}>
                      Phone: {c.phone_number || ''} · Bal: <strong style={{ color: c.previous_balance > 0 ? '#DC2626' : '#059669' }}>Rs. {(c.previous_balance || 0).toLocaleString()}</strong>
                    </div>

                  </div>

                  <div style={{ display: 'flex', flexDirection: 'column', gap: 4, alignItems: 'flex-end' }}>
                    <div style={{ display: 'flex', gap: 4 }}>
                      <button
                        onClick={() => handleShiftSequence(c, -1)}
                        title="Move Up in Sequence"
                        style={{ padding: '2px 8px', borderRadius: 6, border: '1px solid #CBD5E1', background: '#F8FAFC', cursor: 'pointer', fontSize: '0.72rem' }}
                      >▲</button>
                      <button
                        onClick={() => handleShiftSequence(c, 1)}
                        title="Move Down in Sequence"
                        style={{ padding: '2px 8px', borderRadius: 6, border: '1px solid #CBD5E1', background: '#F8FAFC', cursor: 'pointer', fontSize: '0.72rem' }}
                      >▼</button>
                    </div>

                    <div style={{ display: 'flex', gap: 6, marginTop: 4 }}>
                      <button
                        onClick={() => openEditClientModal(c)}
                        style={{ background: 'none', border: 'none', color: '#2563EB', fontSize: '0.72rem', fontWeight: 700, cursor: 'pointer' }}
                      >Edit</button>
                      <button
                        onClick={() => handleDeleteClient(c.client_id)}
                        style={{ background: 'none', border: 'none', color: '#DC2626', fontSize: '0.72rem', fontWeight: 700, cursor: 'pointer' }}
                      >Delete</button>
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ══════════════════════════════════════════════════════════════════
          TAB 2: ROUTE BILLS HISTORY
      ══════════════════════════════════════════════════════════════════ */}
      {activeTab === 'route_history' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <div className="card" style={{ padding: '12px 14px', background: '#F8FAFC' }}>
            <div className="text-xs fw-700 uppercase text-lighter">Route Selection for History</div>
            <select
              className="input"
              style={{ marginTop: 4, fontWeight: 700, color: '#1E40AF' }}
              value={selectedRouteId || ''}
              onChange={e => setSelectedRouteId(Number(e.target.value))}
            >
              {routes.map(r => (
                <option key={r.route_id} value={r.route_id}>
                  {r.assigned_day}: {r.route_name}
                </option>
              ))}
            </select>
          </div>

          <div className="text-xs fw-700 uppercase text-lighter" style={{ paddingLeft: 4 }}>
            Historical Generated Bills ({routeOrdersHistory.length})
          </div>

          {routeOrdersHistory.length === 0 && (
            <div className="card" style={{ padding: 28, textAlign: 'center' }}>
              <div className="text-sm text-muted">No generated bills found for this route yet.</div>
            </div>
          )}

          {routeOrdersHistory.map(o => (
            <div key={o.order_id} className="card" style={{ padding: 14 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span className="text-sm fw-800">Bill #{o.order_id}</span>
                    <span className={`badge ${o.delivery_status === 'delivered' ? 'badge-green' : 'badge-amber'}`}>
                      {o.delivery_status}
                    </span>
                  </div>
                  <div className="text-xs text-muted" style={{ marginTop: 2 }}>
                    Shop: <strong>{o.shop_name || o.client_name}</strong> · Date: {o.order_date}
                  </div>
                </div>

                <div style={{ textAlign: 'right' }}>
                  <div className="text-base fw-900 text-blue">Rs. {(o.net_total || 0).toLocaleString()}</div>
                  <div className="text-xs text-muted">Payment: Rs. {(o.payment_amount || 0).toLocaleString()}</div>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* ══════════════════════════════════════════════════════════════════
          TAB 3: ALL CLIENTS DIRECTORY
      ══════════════════════════════════════════════════════════════════ */}
      {activeTab === 'clients' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <div className="text-xs fw-700 uppercase text-lighter" style={{ paddingLeft: 4 }}>
            All System Clients ({filteredClients.length})
          </div>

          {filteredClients.length === 0 && (
            <div className="card" style={{ padding: 24, textAlign: 'center' }}>
              <div className="text-sm text-muted">No clients matching search query.</div>
            </div>
          )}

          {filteredClients.map(c => (
            <div key={c.client_id} className="card" style={{ padding: '13px 14px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 10 }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div className="text-base fw-800 text-wrap-break">{c.shop_name || c.client_name}</div>
                  <div className="text-xs text-muted text-wrap-break" style={{ marginTop: 2 }}>
                    Client: {c.client_name} {c.area_name ? `· Area: ${c.area_name}` : ''}
                  </div>
                  <div className="text-xs text-muted text-wrap-break">
                    {c.route_name || ''} {c.assigned_day ? `(${c.assigned_day})` : ''}
                  </div>
                  <div style={{ display: 'flex', gap: 6, marginTop: 6, flexWrap: 'wrap', alignItems: 'center' }}>
                    <span className={`badge ${c.previous_balance > 0 ? 'badge-red' : 'badge-green'}`} style={{ whiteSpace: 'nowrap' }}>
                      Bal: Rs. {(c.previous_balance || 0).toLocaleString()}
                    </span>
                  </div>
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: 6, alignItems: 'flex-end', flexShrink: 0 }}>
                  <button
                    onClick={() => openEditClientModal(c)}
                    style={{
                      padding: '5px 12px', borderRadius: 8, border: '1px solid #CBD5E1',
                      background: '#F8FAFC', color: '#1E293B', fontSize: '0.72rem', fontWeight: 800,
                      cursor: 'pointer', whiteSpace: 'nowrap'
                    }}
                  >
                    Edit
                  </button>
                  <button
                    onClick={() => handleDeleteClient(c.client_id)}
                    style={{
                      padding: '4px 10px', borderRadius: 8, border: '1px solid #FECACA',
                      background: '#FEE2E2', color: '#DC2626', fontSize: '0.72rem', fontWeight: 800,
                      cursor: 'pointer', whiteSpace: 'nowrap'
                    }}
                  >
                    Delete
                  </button>
                </div>
              </div>
            </div>
          ))}

        </div>
      )}

      {/* ══════════════════════════════════════════════════════════════════
          MODAL 1: CREATE / EDIT ROUTE
      ══════════════════════════════════════════════════════════════════ */}
      {showRouteModal && (
        <div className="overlay" onClick={() => setShowRouteModal(false)}>
          <div className="sheet" onClick={e => e.stopPropagation()}>
            <div className="sheet-handle" />
            <div className="text-lg fw-900" style={{ marginBottom: 12 }}>
              {editingRoute ? 'Edit Route' : 'Create New Delivery Route'}
            </div>

            <form onSubmit={handleSaveRoute} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <div>
                <label className="text-xs fw-700 uppercase text-lighter">Route Name</label>
                <input
                  className="input"
                  placeholder="e.g. Saddar → Main Bazaar Route"
                  value={routeNameInput}
                  onChange={e => setRouteNameInput(e.target.value)}
                  required
                />
              </div>

              <div>
                <label className="text-xs fw-700 uppercase text-lighter">Assigned Delivery Day</label>
                <select
                  className="input"
                  value={assignedDayInput}
                  onChange={e => setAssignedDayInput(e.target.value)}
                >
                  {WEEKDAYS.map(day => (
                    <option key={day} value={day}>{day}</option>
                  ))}
                </select>
              </div>

              <button type="submit" className="btn-primary" style={{ marginTop: 8 }}>
                {editingRoute ? 'Update Route' : 'Save Route'}
              </button>
              <button type="button" className="btn-ghost" onClick={() => setShowRouteModal(false)}>
                Cancel
              </button>
            </form>
          </div>
        </div>
      )}

      {/* ══════════════════════════════════════════════════════════════════
          MODAL 2: CREATE / EDIT CLIENT (Area Name is OPTIONAL)
      ══════════════════════════════════════════════════════════════════ */}
      {showClientModal && (
        <div className="overlay" onClick={() => setShowClientModal(false)}>
          <div className="sheet" onClick={e => e.stopPropagation()} style={{ maxHeight: '85vh', overflowY: 'auto' }}>
            <div className="sheet-handle" />
            <div className="text-lg fw-900" style={{ marginBottom: 12 }}>
              {editingClient ? 'Edit Client Details' : 'Add New Client / Shop'}
            </div>

            <form onSubmit={handleSaveClient} style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              <div>
                <label className="text-xs fw-700 uppercase text-lighter">Shop Name</label>
                <input
                  className="input"
                  placeholder="e.g. Al Madina General Store"
                  value={shopNameInput}
                  onChange={e => setShopNameInput(e.target.value)}
                />
              </div>

              <div>
                <label className="text-xs fw-700 uppercase text-lighter">Client Name (Owner)</label>
                <input
                  className="input"
                  placeholder="e.g. Muhammad Ali"
                  value={clientNameInput}
                  onChange={e => setClientNameInput(e.target.value)}
                  required
                />
              </div>

              {/* MANDATORY ROUTE SELECTION */}
              <div>
                <label className="text-xs fw-700 uppercase text-lighter" style={{ color: '#1E40AF' }}>
                  1. Select Route (Mandatory)
                </label>
                <select
                  className="input"
                  style={{ fontWeight: 700, color: '#1E40AF' }}
                  value={routeIdInput}
                  onChange={e => {
                    const rId = e.target.value;
                    setRouteIdInput(rId);
                    const avail = areas.filter(a => String(a.route_id) === String(rId));
                    setAreaIdInput(avail[0]?.area_id || '');
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

              {/* AREA SELECTION IS OPTIONAL */}
              <div>
                <label className="text-xs fw-700 uppercase text-lighter">
                  2. Select Area (Optional — Defaults to Route Name)
                </label>
                <select
                  className="input"
                  value={areaIdInput}
                  onChange={e => setAreaIdInput(e.target.value)}
                >
                  <option value="">
                    Default: Use Route Name ("{selectedRouteObjInModal?.route_name || 'Route Area'}")
                  </option>
                  {availableAreas.map(a => (
                    <option key={a.area_id} value={a.area_id}>{a.area_name}</option>
                  ))}
                </select>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                <div>
                  <label className="text-xs fw-700 uppercase text-lighter">Phone Number</label>
                  <input
                    className="input"
                    placeholder="0300-1234567"
                    value={phoneInput}
                    onChange={e => setPhoneInput(e.target.value)}
                  />
                </div>
                <div>
                  <label className="text-xs fw-700 uppercase text-lighter">Route Sequence</label>
                  <input
                    type="number"
                    className="input"
                    placeholder="0"
                    value={routeSeqInput}
                    onChange={e => setRouteSeqInput(e.target.value)}
                  />
                </div>
              </div>

              <div>
                <label className="text-xs fw-700 uppercase text-lighter">Address</label>
                <input
                  className="input"
                  placeholder="e.g. Main Chowk, Street 4"
                  value={addressInput}
                  onChange={e => setAddressInput(e.target.value)}
                />
              </div>

              <div>
                <label className="text-xs fw-700 uppercase text-lighter">Previous Balance (Rs.)</label>
                <input
                  type="number"
                  className="input"
                  placeholder="0"
                  value={prevBalInput}
                  onChange={e => setPrevBalInput(e.target.value)}
                />
              </div>

              <button type="submit" className="btn-primary" style={{ marginTop: 8 }}>
                {editingClient ? 'Update Client' : 'Create Client'}
              </button>
              <button type="button" className="btn-ghost" onClick={() => setShowClientModal(false)}>
                Cancel
              </button>
            </form>
          </div>
        </div>
      )}

      {/* ══════════════════════════════════════════════════════════════════
          MODAL 3: CREATE / EDIT AREA
      ══════════════════════════════════════════════════════════════════ */}
      {showAreaModal && (
        <div className="overlay" onClick={() => setShowAreaModal(false)}>
          <div className="sheet" onClick={e => e.stopPropagation()}>
            <div className="sheet-handle" />
            <div className="text-lg fw-900" style={{ marginBottom: 12 }}>
              {editingArea ? 'Edit Area' : 'Add Area to Route'}
            </div>

            <form onSubmit={handleSaveArea} style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              <div>
                <label className="text-xs fw-700 uppercase text-lighter">Assign to Route</label>
                <select
                  className="input"
                  value={areaRouteId}
                  onChange={e => setAreaRouteId(e.target.value)}
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
                  placeholder="e.g. Saddar Sector 2"
                  value={newAreaName}
                  onChange={e => setNewAreaName(e.target.value)}
                  required
                />
              </div>

              <button type="submit" className="btn-primary" style={{ marginTop: 8 }}>
                Save Area
              </button>
              <button type="button" className="btn-ghost" onClick={() => setShowAreaModal(false)}>
                Cancel
              </button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
