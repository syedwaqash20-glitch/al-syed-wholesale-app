import React, { useState, useMemo } from 'react';
import { api } from '../api';
import { formatInvoiceNo } from './ClientHistory';

export default function DeliveryWorkflow({ orders, todayRoute, routes = [], onUpdateStatus, onUpdateRemainingBalance, onRecordPayment, onRefresh, showToast }) {

  const [activeTab, setActiveTab] = useState('pending');
  const [routeOrder, setRouteOrder] = useState('asc');
  const [selectedRouteFilter, setSelectedRouteFilter] = useState('today');
  const [selectedOrder, setSelectedOrder] = useState(null);
  const [orderDetails, setOrderDetails] = useState(null);
  const [loadingDetails, setLoadingDetails] = useState(false);
  const [paymentInput, setPaymentInput] = useState('');       // For pending: total payment. For remaining balance: pay today amount
  const [discountInput, setDiscountInput] = useState('');
  const [isRemainingBalanceOrder, setIsRemainingBalanceOrder] = useState(false);

  // Live preview of the new balance after delivery/payment
  const previewBalance = useMemo(() => {
    if (!selectedOrder) return 0;
    const newDiscount = Number(discountInput) || 0;
    const grossAmount = Number(selectedOrder.gross_amount || selectedOrder.net_total || 0);
    const updatedNetTotal = grossAmount - newDiscount;

    if (!isRemainingBalanceOrder) {
      // PENDING order: paymentInput = total payment for this order
      const totalPayment = Number(paymentInput) || 0;
      return Number(selectedOrder.previous_balance_at_order || 0) + updatedNetTotal - totalPayment;
    } else {
      // REMAINING BALANCE order: paymentInput = additional amount paid today
      const payToday = Number(paymentInput) || 0;
      const currentBalance = Number(selectedOrder.new_balance_after_order || 0);
      return currentBalance - payToday;
    }
  }, [selectedOrder, paymentInput, discountInput, isRemainingBalanceOrder]);

  // Filter orders by active route filter & tab
  const filteredOrders = useMemo(() => {
    let list = orders.filter(o => {
      if (activeTab === 'pending') {
        // Pending tab includes pending, delivering AND shop_closed (so shop_closed items can be retried!)
        return o.delivery_status !== 'delivered';
      } else if (activeTab === 'completed') {
        // Completed section contains delivered orders that are fully paid
        return o.delivery_status === 'delivered' && Number(o.new_balance_after_order || 0) <= 0;
      } else {
        // Outstanding / Remaining Balance tab contains delivered orders that are not fully paid
        return o.delivery_status === 'delivered' && Number(o.new_balance_after_order || 0) > 0;
      }
    });

    if (selectedRouteFilter === 'today' && todayRoute) {
      list = list.filter(o => String(o.route_id) === String(todayRoute.route_id));
    } else if (typeof selectedRouteFilter === 'number') {
      list = list.filter(o => String(o.route_id) === String(selectedRouteFilter));
    }

    return [...list].sort((a, b) => {
      const sequenceA = Number(a.route_sequence || 0);
      const sequenceB = Number(b.route_sequence || 0);
      const idA = Number(a.order_id || 0);
      const idB = Number(b.order_id || 0);
      const sequenceDifference = sequenceA - sequenceB;
      return routeOrder === 'asc'
        ? (sequenceDifference || idA - idB)
        : (sequenceDifference ? -sequenceDifference : idB - idA);
    });
  }, [orders, activeTab, routeOrder, todayRoute, selectedRouteFilter]);

  const outstandingCount = useMemo(() => {
    let list = orders.filter(o => o.delivery_status === 'delivered' && Number(o.new_balance_after_order || 0) > 0);
    if (selectedRouteFilter === 'today' && todayRoute) {
      list = list.filter(o => String(o.route_id) === String(todayRoute.route_id));
    } else if (typeof selectedRouteFilter === 'number') {
      list = list.filter(o => String(o.route_id) === String(selectedRouteFilter));
    }
    return list.length;
  }, [orders, selectedRouteFilter, todayRoute]);

  // Missing / Pending delivery count for selected route (includes shop_closed)
  const pendingCountForFilter = useMemo(() => {
    let list = orders.filter(o => o.delivery_status !== 'delivered');
    if (selectedRouteFilter === 'today' && todayRoute) {
      list = list.filter(o => String(o.route_id) === String(todayRoute.route_id));
    } else if (typeof selectedRouteFilter === 'number') {
      list = list.filter(o => String(o.route_id) === String(selectedRouteFilter));
    }
    return list.length;
  }, [orders, selectedRouteFilter, todayRoute]);

  // Custom mobile confirmation modal state
  const [confirmModal, setConfirmModal] = useState(null); // { title, message, onConfirm }

  const handleDeleteOrder = (orderId) => {
    setConfirmModal({
      title: 'Delete Order',
      message: `Are you sure you want to delete order #${formatInvoiceNo(orderId)}?`,
      confirmLabel: 'Yes, Delete',
      confirmColor: '#DC2626',
      onConfirm: async () => {
        setSelectedOrder(null);
        setOrderDetails(null);
        try {
          await api.deleteOrder(orderId);
          showToast?.(`🗑️ Order #${formatInvoiceNo(orderId)} deleted!`, 'success');
          onRefresh?.();
        } catch (err) {
          showToast?.('Error deleting order: ' + err.message, 'error');
        }
      }
    });
  };

  const handleDeleteAllStatus = (statusType) => {
    let targetOrders = [];
    let label = '';
    if (statusType === 'pending') {
      targetOrders = orders.filter(o => o.delivery_status === 'pending' || o.delivery_status === 'delivering');
      label = 'Pending Deliveries';
    } else if (statusType === 'shop_closed') {
      targetOrders = orders.filter(o => o.delivery_status === 'shop_closed');
      label = 'Shop Closed Deliveries';
    } else {
      targetOrders = orders.filter(o => o.delivery_status === 'delivered');
      label = 'Completed (Delivered) Orders';
    }

    if (targetOrders.length === 0) return;

    setConfirmModal({
      title: `Clear All ${label}`,
      message: `Are you sure you want to delete all ${targetOrders.length} ${label} from queue?`,
      confirmLabel: 'Yes, Clear All',
      confirmColor: '#DC2626',
      onConfirm: async () => {
        try {
          for (const o of targetOrders) {
            await api.deleteOrder(o.order_id);
          }
          showToast?.(`🗑️ Deleted all ${targetOrders.length} ${label}!`, 'success');
          onRefresh?.();
        } catch (err) {
          showToast?.('Error deleting orders: ' + err.message, 'error');
        }
      }
    });
  };




  const handleCardClick = async (order) => {
    setSelectedOrder(order);
    const isRemBal = order.delivery_status === 'delivered' && Number(order.new_balance_after_order || 0) > 0;
    setIsRemainingBalanceOrder(isRemBal);

    if (isRemBal) {
      // Remaining Balance: default "pay today" to the remaining balance (full payoff)
      setPaymentInput(String(Math.max(0, Number(order.new_balance_after_order || 0))));
      setDiscountInput('0');
    } else if (order.delivery_status !== 'delivered') {
      // Pending: default payment to full net_total, discount to 0
      setPaymentInput(String(order.net_total ?? 0));
      setDiscountInput('0');
    } else {
      // Completed (fully paid) — just show what was paid
      setPaymentInput(String(order.payment_amount ?? 0));
      setDiscountInput(String(order.discount ?? 0));
    }

    setLoadingDetails(true);
    try {
      const res = await api.getOrder(order.order_id);
      if (res?.order) {
        setOrderDetails(res);
      } else {
        setOrderDetails({ order, items: [] });
      }
    } catch {
      setOrderDetails({ order, items: [] });
    } finally {
      setLoadingDetails(false);
    }
  };

  const handleStatusChange = async (statusVal, paymentOverride) => {
    if (!selectedOrder) return;
    const currentOrderId = selectedOrder.order_id;
    const actionPayment = paymentOverride === undefined ? Number(paymentInput) || 0 : paymentOverride;
    
    // Close the detail sheet while keeping the user's selected tab.
    setSelectedOrder(null);
    setOrderDetails(null);
    
    try {
      let finalPayment;
      let finalDiscount;
      if (statusVal === 'delivered') {
        if (isRemainingBalanceOrder) {
          const res = await onRecordPayment(currentOrderId, actionPayment);
          setActiveTab(Number(res?.order?.new_balance_after_order || 0) > 0 ? 'outstanding' : 'completed');
          showToast?.('✅ Remaining balance updated from the database.', 'success');
          return;
        } else {
          // For pending: payment is the total payment entered
          finalPayment = Number(paymentInput) || 0;
          finalDiscount = Number(discountInput) || 0;
        }
      }
      const res = await onUpdateStatus(currentOrderId, statusVal, finalPayment, finalDiscount, selectedOrder);
      if (statusVal === 'delivered') {
        setActiveTab(Number(res?.order?.new_balance_after_order || 0) > 0 ? 'outstanding' : 'completed');
        showToast?.('✅ Delivery completed! Database & client balance updated.', 'success');
      } else if (statusVal === 'shop_closed') {
        showToast?.('🛑 Shop marked closed!', 'info');
      }
    } catch (err) {
      showToast?.('Error updating status: ' + err.message, 'error');
    }
  };


  return (
    <div className="page anim-fade" style={{ paddingBottom: 90 }}>
      {/* ── Route Filter & Order Toggle Banner ────────────────────────── */}
      <div className="card" style={{ padding: '12px 14px', background: '#F8FAFC', border: '1px solid #E2E8F0' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
          <label className="text-xs fw-700 uppercase text-lighter">Select Delivery Route</label>
          <button
            onClick={() => setRouteOrder(routeOrder === 'asc' ? 'desc' : 'asc')}
            style={{
              padding: '4px 10px', borderRadius: 8, border: '1px solid #CBD5E1',
              background: '#fff', color: '#1E293B', fontSize: '0.68rem', fontWeight: 800,
              cursor: 'pointer'
            }}
          >
            {routeOrder === 'asc' ? '1st Order First ↑' : 'Latest Order First ↓'}
          </button>
        </div>

        <div style={{ width: '100%', maxWidth: '100%', overflow: 'hidden', boxSizing: 'border-box' }}>
          <select
            className="input"
            style={{
              fontWeight: 800, color: '#1E40AF', height: 40, fontSize: '0.82rem',
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
                ★ Today's Delivery ({todayRoute.assigned_day}): {todayRoute.route_name.length > 25 ? todayRoute.route_name.substring(0, 25) + '…' : todayRoute.route_name}
              </option>
            )}
            <option value="all">🌍 All Routes &amp; Deliveries Queue</option>
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
      </div>

      {/* ── Missing Delivery Check Notification Banner ── */}
      {pendingCountForFilter > 0 ? (
        <div className="card" style={{
          background: '#FEF3C7', border: '1.5px solid #F59E0B', padding: '10px 14px', borderRadius: 14,
          display: 'flex', alignItems: 'center', justifyContent: 'space-between'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <span style={{ fontSize: '1.1rem' }}>⚡</span>
            <span className="text-xs fw-900 text-amber" style={{ color: '#92400E' }}>
              {pendingCountForFilter} Delivery(s) Missing / To Deliver on this Route
            </span>
          </div>
          <span className="badge badge-amber" style={{ fontSize: '0.62rem' }}>To Complete</span>
        </div>
      ) : (
        <div className="card" style={{
          background: '#F0FDF4', border: '1px solid #BBF7D0', padding: '10px 14px', borderRadius: 14,
          display: 'flex', alignItems: 'center', justifyContent: 'space-between'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <span style={{ fontSize: '1.1rem' }}>✅</span>
            <span className="text-xs fw-900 text-emerald" style={{ color: '#166534' }}>
              All Deliveries Completed for this Route!
            </span>
          </div>
          <span className="badge badge-green" style={{ fontSize: '0.62rem' }}>100% Done</span>
        </div>
      )}


      {/* ── Tabs ───────────────────────────────────────────────────────── */}
      <div style={{ display: 'flex', gap: 8 }}>
        <button
          onClick={() => setActiveTab('pending')}
          style={{
            flex: 1, padding: '8px 0', borderRadius: 10, border: 'none',
            background: activeTab === 'pending' ? '#1E40AF' : '#F1F5F9',
            color: activeTab === 'pending' ? '#fff' : '#64748B',
            fontFamily: 'inherit', fontSize: '0.75rem', fontWeight: 700, cursor: 'pointer'
          }}
        >
          Pending &amp; Shop Closed ({orders.filter(o => o.delivery_status !== 'delivered').length})
        </button>
        <button
          onClick={() => setActiveTab('completed')}
          style={{
            flex: 1, padding: '8px 0', borderRadius: 10, border: 'none',
            background: activeTab === 'completed' ? '#1E40AF' : '#F1F5F9',
            color: activeTab === 'completed' ? '#fff' : '#64748B',
            fontFamily: 'inherit', fontSize: '0.75rem', fontWeight: 700, cursor: 'pointer'
          }}
        >
          Completed (Fully Paid) ({orders.filter(o => o.delivery_status === 'delivered' && Number(o.new_balance_after_order || 0) <= 0).length})
        </button>
        <button
          onClick={() => setActiveTab('outstanding')}
          style={{
            flex: 1, padding: '8px 0', borderRadius: 10, border: 'none',
            background: activeTab === 'outstanding' ? '#B45309' : '#F1F5F9',
            color: activeTab === 'outstanding' ? '#fff' : '#64748B',
            fontFamily: 'inherit', fontSize: '0.75rem', fontWeight: 700, cursor: 'pointer'
          }}
        >
          Remaining Balance ({outstandingCount})
        </button>
      </div>

      {/* ── Clear / Delete Action Controls ── */}
      <div style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'flex-end', gap: 6, marginTop: 4 }}>
        {activeTab === 'pending' && orders.some(o => o.delivery_status === 'pending' || o.delivery_status === 'delivering') && (
          <button
            onClick={() => handleDeleteAllStatus('pending')}
            style={{
              background: '#FFFBEB', color: '#92400E', border: '1px solid #FDE68A',
              borderRadius: 8, padding: '5px 10px', fontSize: '0.68rem', fontWeight: 800, cursor: 'pointer'
            }}
          >
            🗑️ Clear Pending Deliveries
          </button>
        )}
        {activeTab === 'pending' && orders.some(o => o.delivery_status === 'shop_closed') && (
          <button
            onClick={() => handleDeleteAllStatus('shop_closed')}
            style={{
              background: '#FEE2E2', color: '#991B1B', border: '1px solid #FECACA',
              borderRadius: 8, padding: '5px 10px', fontSize: '0.68rem', fontWeight: 800, cursor: 'pointer'
            }}
          >
            🗑️ Clear Shop Closed Deliveries
          </button>
        )}
        {activeTab === 'completed' && orders.some(o => o.delivery_status === 'delivered') && (
          <button
            onClick={() => handleDeleteAllStatus('delivered')}
            style={{
              background: '#FEE2E2', color: '#991B1B', border: '1px solid #FECACA',
              borderRadius: 8, padding: '5px 10px', fontSize: '0.68rem', fontWeight: 800, cursor: 'pointer'
            }}
          >
            🗑️ Clear All Delivered Orders
          </button>
        )}
      </div>



      {/* ── Delivery Queue List ────────────────────────────────────────── */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {filteredOrders.length === 0 && (
          <div className="card" style={{ padding: 32, textAlign: 'center' }}>
            <div className="text-sm text-muted">No orders found in {activeTab} queue.</div>
          </div>
        )}
        {filteredOrders.map((o, idx) => (
          <div
            key={o.order_id}
            className="card-pressable"
            onClick={() => handleCardClick(o)}
            style={{
              padding: '13px 14px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              borderLeft: `4px solid ${
                o.delivery_status === 'delivered' ? '#10B981' :
                o.delivery_status === 'shop_closed' ? '#EF4444' : '#F59E0B'
              }`
            }}
          >
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <span className="text-xs fw-700 text-lighter" style={{ minWidth: 24 }}>#{idx + 1}</span>
                <span className="text-base fw-800" style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {o.shop_name || o.client_name}
                </span>
              </div>
              <div className="text-sm text-muted" style={{ paddingLeft: 30 }}>
                {o.client_name} · {o.area_name || todayRoute?.route_name || 'Area'}{o.phone_number ? ` · ${o.phone_number}` : ''}
              </div>
              {o.outsourced_flag ? (
                <div style={{ paddingLeft: 30, marginTop: 2 }}>
                  <span className="badge badge-red">Contains Outsourced Items</span>
                </div>
              ) : null}
            </div>

            <div style={{ textAlign: 'right', flexShrink: 0 }}>
              <div className="text-base fw-900 text-blue">Rs. {(o.net_total || 0).toLocaleString()}</div>
              {activeTab === 'outstanding' && Number(o.new_balance_after_order || 0) > 0 && (
                <div className="text-xs fw-800" style={{ color: '#DC2626', marginTop: 2 }}>
                  Remaining: Rs. {Number(o.new_balance_after_order).toLocaleString()}
                </div>
              )}
              <span className={`badge ${
                o.delivery_status === 'delivered' ? 'badge-green' :
                o.delivery_status === 'shop_closed' ? 'badge-red' : 'badge-amber'
              }`}>
                {activeTab === 'outstanding' ? 'balance due' : (o.delivery_status || 'pending').replace('_', ' ')}
              </span>

            </div>
          </div>
        ))}
      </div>

      {/* ── Order Detail Bottom Sheet ──────────────────────────────────── */}
      {selectedOrder && (
        <div className="overlay" onClick={() => setSelectedOrder(null)}>
          <div className="sheet" onClick={e => e.stopPropagation()} style={{ maxHeight: '85vh', overflowY: 'auto' }}>
            <div className="sheet-handle" />

            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 12 }}>
              <div>
                <span className="badge badge-blue">Order #{formatInvoiceNo(selectedOrder.order_id)}</span>

                <div className="text-xl fw-900" style={{ marginTop: 4 }}>
                  {selectedOrder.shop_name || selectedOrder.client_name}
                </div>
                <div className="text-sm text-muted">
                  Client: {selectedOrder.client_name} · Phone: {selectedOrder.phone_number || 'N/A'}
                </div>
              </div>
              <span className={`badge ${
                selectedOrder.delivery_status === 'delivered' ? 'badge-green' :
                selectedOrder.delivery_status === 'shop_closed' ? 'badge-red' : 'badge-amber'
              }`}>
                {selectedOrder.delivery_status}
              </span>
            </div>

            {loadingDetails ? (
              <div style={{ padding: 24, textAlign: 'center', color: '#64748B' }}>Loading items…</div>
            ) : (
              <>
                <div className="card" style={{ padding: 12, marginBottom: 14, background: '#F8FAFC' }}>
                  <div className="text-xs fw-700 uppercase text-lighter" style={{ marginBottom: 8 }}>Order Items</div>
                  {orderDetails?.items?.map(it => (
                    <div key={it.item_id} style={{ display: 'flex', justifyContent: 'space-between', padding: '4px 0', fontSize: '0.82rem' }}>
                      <span>{it.product_name} ({it.quantity} {it.unit_type})</span>
                      <span className="fw-700">Rs. {(it.quantity * it.unit_price).toLocaleString()}</span>
                    </div>
                  ))}
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 16, fontSize: '0.85rem' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span className="text-muted">Previous Balance:</span>
                    <span className="fw-700">Rs. {(selectedOrder.previous_balance_at_order || 0).toLocaleString()}</span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span className="text-muted">Order Total (Gross):</span>
                    <span className="fw-700 text-blue">Rs. {(selectedOrder.gross_amount || selectedOrder.net_total || 0).toLocaleString()}</span>
                  </div>

                  {isRemainingBalanceOrder ? (
                    <>
                      {/* ── REMAINING BALANCE VIEW ── */}
                      <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                        <span className="text-muted">Discount Applied:</span>
                        <span className="fw-700 text-amber">Rs. {(selectedOrder.discount || 0).toLocaleString()}</span>
                      </div>
                      <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                        <span className="text-muted">Bill After Discount:</span>
                        <span className="fw-700">Rs. {(selectedOrder.net_total || 0).toLocaleString()}</span>
                      </div>
                      <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                        <span className="text-muted">Already Paid:</span>
                        <span className="fw-700 text-emerald">Rs. {(selectedOrder.payment_amount || 0).toLocaleString()}</span>
                      </div>
                      <div style={{ display: 'flex', justifyContent: 'space-between', background: '#FEF3C7', padding: '6px 8px', borderRadius: 8, border: '1px solid #FDE68A' }}>
                        <span className="fw-800" style={{ color: '#92400E' }}>Outstanding Balance:</span>
                        <span className="fw-900" style={{ color: '#DC2626' }}>Rs. {Number(selectedOrder.new_balance_after_order || 0).toLocaleString()}</span>
                      </div>
                      <div className="divider" style={{ margin: '4px 0' }} />
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <span className="fw-800" style={{ color: '#059669' }}>💰 Pay Today:</span>
                        <label style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                          <span style={{ color: '#059669', fontWeight: 700 }}>Rs.</span>
                          <input
                            className="input"
                            type="number"
                            min="0"
                            step="1"
                            value={paymentInput}
                            onChange={e => setPaymentInput(e.target.value)}
                            style={{ width: 120, height: 38, padding: '0 8px', textAlign: 'right', fontWeight: 800, fontSize: '1rem', border: '2px solid #059669' }}
                          />
                        </label>
                      </div>
                    </>
                  ) : (
                    <>
                      {/* ── PENDING ORDER VIEW ── */}
                      <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                        <span className="text-muted">Discount:</span>
                        {selectedOrder.delivery_status === 'delivered' && Number(selectedOrder.new_balance_after_order || 0) <= 0 ? (
                          <span className="fw-700 text-amber">Rs. {(selectedOrder.discount || 0).toLocaleString()}</span>
                        ) : (
                          <label style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                            <span style={{ color: '#D97706', fontWeight: 700 }}>Rs.</span>
                            <input
                              className="input"
                              type="number"
                              min="0"
                              step="1"
                              value={discountInput}
                              onChange={e => setDiscountInput(e.target.value)}
                              style={{ width: 120, height: 34, padding: '0 8px', textAlign: 'right', fontWeight: 800 }}
                            />
                          </label>
                        )}
                      </div>
                      <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                        <span className="text-muted">Payment Received Today:</span>
                        {selectedOrder.delivery_status === 'delivered' && Number(selectedOrder.new_balance_after_order || 0) <= 0 ? (
                          <span className="fw-700 text-emerald">Rs. {(selectedOrder.payment_amount || 0).toLocaleString()}</span>
                        ) : (
                          <label style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                            <span style={{ color: '#059669', fontWeight: 700 }}>Rs.</span>
                            <input
                              className="input"
                              type="number"
                              min="0"
                              step="1"
                              value={paymentInput}
                              onChange={e => setPaymentInput(e.target.value)}
                              style={{ width: 120, height: 34, padding: '0 8px', textAlign: 'right', fontWeight: 800 }}
                            />
                          </label>
                        )}
                      </div>
                    </>
                  )}
                  <div className="divider" style={{ margin: '4px 0' }} />
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.95rem' }}>
                    <span className="fw-800">{isRemainingBalanceOrder ? 'Balance After Payment:' : 'New Balance After Delivery:'}</span>
                    <span className={`fw-900 ${previewBalance <= 0 ? 'text-emerald' : 'text-amber'}`}>Rs. {previewBalance.toLocaleString()}</span>
                  </div>
                </div>

                {/* Actions */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {selectedOrder.delivery_status !== 'delivered' && (
                    <button className="btn-primary" onClick={() => handleStatusChange('delivered')}>
                      ✓ Mark as Delivered
                    </button>
                  )}
                  {selectedOrder.delivery_status === 'delivered' && Number(selectedOrder.new_balance_after_order || 0) > 0 && (
                    <>
                      <button className="btn-primary" onClick={() => handleStatusChange('delivered')}>
                        💰 Record Payment &amp; Update Balance
                      </button>
                      <button
                        className="btn-ghost"
                        style={{ borderColor: '#059669', color: '#047857', background: '#ECFDF5' }}
                        onClick={() => {
                          handleStatusChange('delivered', Math.max(0, Number(selectedOrder.new_balance_after_order || 0)));
                        }}
                      >
                        ✓ Clear Remaining Balance
                      </button>
                    </>
                  )}
                  {selectedOrder.delivery_status !== 'shop_closed' && (
                    <button
                      className="btn-danger"
                      style={{ background: '#EF4444', color: '#fff' }}
                      onClick={() => handleStatusChange('shop_closed')}
                    >
                      🛑 Mark Shop Closed
                    </button>
                  )}
                  <button
                    type="button"
                    style={{
                      background: '#FFF1F2', color: '#E11D48', border: '1px solid #FECDD3',
                      borderRadius: 12, padding: '10px 0', fontSize: '0.85rem', fontWeight: 800, cursor: 'pointer'
                    }}
                    onClick={() => handleDeleteOrder(selectedOrder.order_id)}
                  >
                    🗑️ Delete Order
                  </button>
                  <button className="btn-ghost" onClick={() => setSelectedOrder(null)}>
                    Go Back
                  </button>

                </div>
              </>
            )}
          </div>
        </div>
      )}

      {/* ── Custom Mobile Confirmation Modal (Yes / No Buttons) ── */}
      {confirmModal && (
        <div className="overlay" onClick={() => setConfirmModal(null)} style={{ zIndex: 10050 }}>
          <div className="sheet" onClick={e => e.stopPropagation()} style={{ maxWidth: 380, margin: '0 auto' }}>
            <div className="sheet-handle" />
            <div style={{ textAlign: 'center', padding: '6px 0 14px' }}>
              <div style={{ fontSize: '2rem', marginBottom: 6 }}>⚠️</div>
              <div className="text-lg fw-900" style={{ color: '#0F172A', marginBottom: 6 }}>
                {confirmModal.title}
              </div>
              <div className="text-sm text-muted" style={{ lineHeight: 1.4, padding: '0 8px' }}>
                {confirmModal.message}
              </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginTop: 10 }}>
              <button
                type="button"
                className="btn-ghost"
                style={{
                  background: '#F1F5F9', border: '1px solid #CBD5E1', color: '#334155',
                  padding: '12px 0', borderRadius: 12, fontWeight: 800, fontSize: '0.85rem'
                }}
                onClick={() => setConfirmModal(null)}
              >
                No, Cancel
              </button>

              <button
                type="button"
                className="btn-primary"
                style={{
                  background: confirmModal.confirmColor || '#DC2626', color: '#FFFFFF',
                  padding: '12px 0', borderRadius: 12, fontWeight: 900, fontSize: '0.85rem',
                  border: 'none', boxShadow: '0 4px 14px rgba(220, 38, 38, 0.3)'
                }}
                onClick={async () => {
                  const action = confirmModal.onConfirm;
                  setConfirmModal(null);
                  if (action) await action();
                }}
              >
                {confirmModal.confirmLabel || 'Yes, Confirm'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}


