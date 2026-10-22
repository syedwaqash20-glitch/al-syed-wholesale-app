import React, { useState, useEffect, useMemo } from 'react';
import { api } from '../api';


export function formatInvoiceNo(id) {
  if (!id) return 'ALS-000001';
  if (typeof id === 'string' && id.startsWith('ALS-')) return id;
  const num = parseInt(String(id).replace(/\D/g, ''), 10);
  if (!isNaN(num) && num > 0) {
    return `ALS-${String(num).padStart(6, '0')}`;
  }
  return `ALS-${String(id).slice(0, 6).toUpperCase()}`;
}



export default function ClientHistory({ client, allClients = [], allOrders = [], onBack }) {

  const [activeTab, setActiveTab] = useState(client ? 'client_history' : 'bill_history');
  const [selectedClient, setSelectedClient] = useState(client || null);
  const [selectedRouteFilter, setSelectedRouteFilter] = useState('');
  const [clientOrders, setClientOrders] = useState([]);
  const [loading, setLoading] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [filterDate, setFilterDate] = useState('');

  // Thermal Receipt Modal state
  const [receiptOrder, setReceiptOrder] = useState(null);

  // Update selected client if passed prop changes
  useEffect(() => {
    if (client) setSelectedClient(client);
  }, [client]);

  // Load orders for selected client
  useEffect(() => {
    let isMounted = true;
    if (selectedClient?.client_id) {
      setLoading(true);
      api.getClientOrders(selectedClient.client_id)
        .then(res => {
          if (isMounted && res?.orders) {
            setClientOrders(res.orders);
            setSelectedClient(previous => previous ? {
              ...previous,
              previous_balance: res.current_balance ?? previous.previous_balance
            } : previous);
          }
        })
        .catch(() => {
          if (isMounted) setClientOrders([]);
        })
        .finally(() => {
          if (isMounted) setLoading(false);
        });
    } else {
      setClientOrders([]);
    }
    return () => { isMounted = false; };
  }, [selectedClient]);

  // Filter client orders by date filter and search query (bill #, client name, shop name, date)
  const filteredClientOrders = useMemo(() => {
    let list = clientOrders;

    if (filterDate) {
      list = list.filter(o => (o.order_date || '').includes(filterDate));
    }

    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      list = list.filter(o => {
        const invNo = formatInvoiceNo(o.order_id).toLowerCase();
        const rawId = String(o.order_id);
        const shop  = (o.shop_name || '').toLowerCase();
        const clientName = (o.client_name || '').toLowerCase();
        const dateStr = (o.order_date || '').toLowerCase();
        return invNo.includes(q) || rawId.includes(q) || shop.includes(q) || clientName.includes(q) || dateStr.includes(q);
      });
    }

    return list;
  }, [clientOrders, filterDate, searchQuery]);


  // Group client orders by date for clear timeline display
  const ordersByDate = useMemo(() => {
    const groups = {};
    filteredClientOrders.forEach(o => {
      const d = o.order_date || 'Unspecified Date';
      if (!groups[d]) groups[d] = [];
      groups[d].push(o);
    });
    return groups;
  }, [filteredClientOrders]);

  // Filter all bills by search query
  const filteredAllBills = useMemo(() => {
    if (!searchQuery.trim()) return allOrders;
    const q = searchQuery.toLowerCase();
    return allOrders.filter(o =>
      String(o.order_id).includes(q) ||
      (o.shop_name || '').toLowerCase().includes(q) ||
      (o.client_name || '').toLowerCase().includes(q) ||
      (o.area_name || '').toLowerCase().includes(q) ||
      (o.order_date || '').includes(q)
    );
  }, [allOrders, searchQuery]);

  return (
    <div className="page anim-fade" style={{ paddingBottom: 90 }}>
      {/* ── Top Navigation Tabs ──────────────────────────────────────────── */}
      <div style={{ display: 'flex', gap: 6 }}>
        <button
          onClick={() => setActiveTab('client_history')}
          style={{
            flex: 1, padding: '9px 0', borderRadius: 10, border: 'none',
            background: activeTab === 'client_history' ? '#1E40AF' : '#F1F5F9',
            color: activeTab === 'client_history' ? '#fff' : '#64748B',
            fontFamily: 'inherit', fontSize: '0.75rem', fontWeight: 700, cursor: 'pointer'
          }}
        >
          🏪 Client Bill History ({clientOrders.length})
        </button>
        <button
          onClick={() => setActiveTab('bill_history')}
          style={{
            flex: 1, padding: '9px 0', borderRadius: 10, border: 'none',
            background: activeTab === 'bill_history' ? '#1E40AF' : '#F1F5F9',
            color: activeTab === 'bill_history' ? '#fff' : '#64748B',
            fontFamily: 'inherit', fontSize: '0.75rem', fontWeight: 700, cursor: 'pointer'
          }}
        >
          📜 All System Bills ({allOrders.length})
        </button>
      </div>

      {onBack && (
        <button className="btn-ghost btn-sm" style={{ width: 'auto', alignSelf: 'flex-start' }} onClick={onBack}>
          ← Back
        </button>
      )}

      {/* ══════════════════════════════════════════════════════════════════
          TAB 1: CLIENT BILL HISTORY (CHRONOLOGICAL TIMELINE BY DATE)
      ══════════════════════════════════════════════════════════════════ */}
      {activeTab === 'client_history' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>

          {/* Search bar & Client Selector & Date Filter */}
          <div className="card" style={{ padding: '14px 16px', background: '#F8FAFC', border: '1px solid #E2E8F0' }}>
            <label className="text-xs fw-700 uppercase text-lighter">Search Bills</label>
            <input
              className="input"
              style={{ marginTop: 4, height: 40, fontSize: '0.82rem' }}
              placeholder="Search by Bill #, Client Name, Shop or Date…"
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
            />

            <div className="divider" style={{ margin: '10px 0' }} />

            {/* STEP 1: Pick a Route */}
            <label className="text-xs fw-700 uppercase text-lighter">Step 1 — Select Route</label>
            <select
              className="input"
              style={{ marginTop: 4, height: 42, fontSize: '0.83rem', fontWeight: 700, color: '#1E40AF', width: '100%', boxSizing: 'border-box' }}
              value={selectedRouteFilter}
              onChange={e => {
                setSelectedRouteFilter(e.target.value);
                setSelectedClient(null); // reset client when route changes
              }}
            >
              <option value="">— Select a Route —</option>
              {(() => {
                const seen = new Set();
                return allClients
                  .map(c => c.route_name || 'General Route / Unassigned')
                  .filter(r => { if (seen.has(r)) return false; seen.add(r); return true; })
                  .map(r => <option key={r} value={r}>{r}</option>);
              })()}
            </select>

            {/* STEP 2: Pick a Client under that Route */}
            {selectedRouteFilter && (
              <>
                <label className="text-xs fw-700 uppercase text-lighter" style={{ marginTop: 10, display: 'block' }}>Step 2 — Select Shop / Client</label>
                <select
                  className="input"
                  style={{ marginTop: 4, height: 42, fontSize: '0.83rem', fontWeight: 700, color: '#1E40AF', width: '100%', boxSizing: 'border-box' }}
                  value={selectedClient?.client_id || ''}
                  onChange={e => {
                    const cId = Number(e.target.value);
                    const found = allClients.find(c => c.client_id === cId);
                    if (found) setSelectedClient(found);
                  }}
                >
                  <option value="">— Select a Shop —</option>
                  {allClients
                    .filter(c => (c.route_name || 'General Route / Unassigned') === selectedRouteFilter)
                    .map(c => (
                      <option key={c.client_id} value={c.client_id}>
                        {c.shop_name || c.client_name}{c.area_name ? ` · ${c.area_name}` : ''}
                      </option>
                    ))
                  }
                </select>
              </>
            )}

            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 10 }}>
              <span className="text-xs text-muted">Filter by Exact Date:</span>
              <input
                type="date"
                className="input"
                style={{ width: 140, height: 32, fontSize: '0.75rem' }}
                value={filterDate}
                onChange={e => setFilterDate(e.target.value)}
              />
              {filterDate && (
                <button className="btn-ghost btn-sm" onClick={() => setFilterDate('')}>
                  Clear Date
                </button>
              )}
            </div>
          </div>

          {/* Dedicated Client Page Banner & Navigation Back Sign */}
          {selectedClient && (
            <div className="card" style={{ padding: '16px 18px', background: 'linear-gradient(135deg, #1E40AF 0%, #1E3A8A 100%)', color: '#fff', borderRadius: 16 }}>
              {/* Header Action Bar */}
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12, gap: 8 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                  {onBack && (
                    <button
                      onClick={onBack}
                      style={{
                        background: 'rgba(255,255,255,0.22)', border: '1px solid rgba(255,255,255,0.35)',
                        color: '#fff', padding: '4px 10px', borderRadius: 8, fontSize: '0.72rem', fontWeight: 800, cursor: 'pointer',
                        display: 'inline-flex', alignItems: 'center', gap: 4, whiteSpace: 'nowrap'
                      }}
                    >
                      ← Back
                    </button>
                  )}
                  <span className="badge" style={{ background: 'rgba(255,255,255,0.22)', color: '#fff', border: 'none', fontWeight: 800 }}>
                    {selectedClient.area_name || 'Area'}
                  </span>
                </div>

                <div style={{ textAlign: 'right', flexShrink: 0 }}>
                  <div className="text-xs uppercase" style={{ opacity: 0.85, fontSize: '0.62rem', letterSpacing: '0.04em' }}>Current Balance</div>
                  <div className="text-xl fw-900" style={{ color: '#FCD34D', lineHeight: 1.1 }}>
                    Rs. {(selectedClient.previous_balance || 0).toLocaleString()}
                  </div>
                </div>
              </div>

              {/* Client / Shop Title & Details */}
              <div style={{ marginBottom: 10 }}>
                <div className="text-xl fw-900 text-wrap-break" style={{ color: '#FFFFFF', lineHeight: 1.25 }}>
                  🏪 {selectedClient.shop_name || selectedClient.client_name}
                </div>
                <div className="text-xs text-wrap-break" style={{ opacity: 0.9, marginTop: 4, lineHeight: 1.4 }}>
                  Owner: <strong>{selectedClient.client_name}</strong> · Phone: <strong>{selectedClient.phone_number || 'N/A'}</strong>
                </div>
                {selectedClient.address && (
                  <div className="text-xs text-wrap-break" style={{ opacity: 0.85, marginTop: 2 }}>
                    Address: {selectedClient.address}
                  </div>
                )}
              </div>

              {/* Bottom Info Bar */}
              <div style={{ paddingTop: 10, borderTop: '1px solid rgba(255,255,255,0.2)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '0.72rem' }}>
                <span style={{ opacity: 0.9 }}>Route: <strong>{selectedClient.route_name || 'General'}</strong></span>
                <span style={{ opacity: 0.9 }}>Total Bills: <strong>{clientOrders.length}</strong></span>
              </div>
            </div>
          )}


          {/* Timeline Order Groups */}
          {loading ? (
            <div style={{ padding: 36, textAlign: 'center', color: '#64748B' }}>Loading client history timeline…</div>
          ) : Object.keys(ordersByDate).length === 0 ? (
            <div className="card" style={{ padding: 32, textAlign: 'center' }}>
              <div style={{ fontSize: '2rem', marginBottom: 6 }}>📜</div>
              <div className="text-base fw-800 text-dark" style={{ marginBottom: 4 }}>No bills for now</div>
              <div className="text-xs text-muted">
                {selectedClient?.shop_name || 'This client'} has no saved purchase bills in the database history.
              </div>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              {Object.entries(ordersByDate).map(([dateStr, dateOrders]) => {
                const daySales = dateOrders.reduce((s, o) => s + (o.net_total || 0), 0);
                return (
                  <div key={dateStr} style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>

                    {/* Date Header Badge with Daily Summary (Screen Bounded & Wrap-Safe) */}
                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4, margin: '4px 0' }}>
                      <div style={{ width: '100%', height: 1, background: '#E2E8F0' }} />
                      <div className="badge badge-purple" style={{
                        padding: '6px 12px', fontSize: '0.72rem', fontWeight: 800,
                        whiteSpace: 'normal', textTransform: 'none', letterSpacing: 'normal',
                        textAlign: 'center', lineHeight: 1.35, maxWidth: '100%', boxSizing: 'border-box'
                      }}>
                        📅 Date: <strong>{dateStr}</strong>
                        <div style={{ fontSize: '0.68rem', opacity: 0.85, marginTop: 1 }}>
                          {dateOrders.length} Order{dateOrders.length > 1 ? 's' : ''} · Total: Rs. {daySales.toLocaleString()}
                        </div>
                      </div>
                    </div>


                    {/* Orders for this date */}
                    {dateOrders.map(o => (
                      <div key={o.order_id} className="card" style={{ padding: '16px', borderLeft: '4px solid #1E40AF' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 12 }}>
                          <div>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                              <span className="text-base fw-900 text-blue">Bill #{formatInvoiceNo(o.order_id)}</span>

                              <span className={`badge ${
                                o.delivery_status === 'delivered' ? 'badge-green' :
                                o.delivery_status === 'shop_closed' ? 'badge-red' : 'badge-amber'
                              }`}>
                                {o.delivery_status.replace('_', ' ')}
                              </span>
                            </div>
                            <div className="text-xs text-muted" style={{ marginTop: 4 }}>
                              Date Logged: <strong>{o.order_date}</strong>
                            </div>
                          </div>

                          <div style={{ textAlign: 'right' }}>
                            <div className="text-xs uppercase text-lighter">Bill Net Amount</div>
                            <div className="text-xl fw-900 text-blue">Rs. {(o.net_total || 0).toLocaleString()}</div>
                          </div>
                        </div>

                        {/* Items Purchased List */}
                        {o.items && o.items.length > 0 && (
                          <div style={{ background: '#F8FAFC', borderRadius: 10, padding: '12px', marginBottom: 12 }}>
                            <div className="text-xs fw-700 uppercase text-lighter" style={{ marginBottom: 8 }}>
                              Purchased Line Items ({o.items.length})
                            </div>
                            {o.items.map(it => (
                              <div key={it.item_id} style={{ display: 'flex', justifyContent: 'space-between', padding: '4px 0', borderBottom: '1px solid #F1F5F9', fontSize: '0.8rem' }}>
                                <span>{it.product_name} ({it.quantity} {it.unit_type})</span>
                                <span className="fw-700 text-dark">Rs. {(it.subtotal || 0).toLocaleString()}</span>
                              </div>
                            ))}
                          </div>
                        )}

                        {/* Financial Progression (Clean Inline Typography) */}
                        <div style={{ background: '#EFF6FF', borderRadius: 10, padding: '12px 14px', fontSize: '0.78rem', marginBottom: 12 }}>
                          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                              <span className="text-muted">Gross Amount:</span>
                              <span className="fw-800 text-dark" style={{ whiteSpace: 'nowrap' }}>Rs. {(o.gross_amount || o.net_total || 0).toLocaleString()}</span>
                            </div>

                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                              <span className="text-muted">Special Discount:</span>
                              <span className="fw-800 text-emerald" style={{ whiteSpace: 'nowrap' }}>− Rs. {(o.discount || 0).toLocaleString()}</span>
                            </div>

                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                              <span className="text-muted">Prev Balance on Date:</span>
                              <span className="fw-800 text-amber" style={{ whiteSpace: 'nowrap' }}>Rs. {(o.previous_balance_at_order || 0).toLocaleString()}</span>
                            </div>

                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                              <span className="text-muted">Payment Paid on Date:</span>
                              <span className="fw-800 text-emerald" style={{ whiteSpace: 'nowrap' }}>Rs. {(o.payment_amount || 0).toLocaleString()}</span>
                            </div>
                          </div>

                          <div className="divider" style={{ margin: '8px 0', borderColor: '#BFDBFE' }} />

                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <span className="fw-800 text-dark uppercase" style={{ fontSize: '0.75rem' }}>New Balance After Order:</span>
                            <span className="text-base fw-900 text-amber" style={{ whiteSpace: 'nowrap' }}>Rs. {(o.new_balance_after_order || 0).toLocaleString()}</span>
                          </div>
                        </div>


                        {/* View Saved Thermal Roll Bill Button */}
                        <button
                          onClick={() => setReceiptOrder(o)}
                          style={{
                            width: '100%', background: '#1E293B', color: '#fff', border: 'none',
                            borderRadius: 8, padding: '8px 0', fontSize: '0.75rem', fontWeight: 800,
                            cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6
                          }}
                        >
                          🖨️ View Saved White Thermal Receipt
                        </button>
                      </div>
                    ))}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* ══════════════════════════════════════════════════════════════════
          TAB 2: ALL SYSTEM BILLS INVENTORY
      ══════════════════════════════════════════════════════════════════ */}
      {activeTab === 'bill_history' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <input
            className="input"
            placeholder="Search by Bill #, Shop Name, Client Name, or Date…"
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
          />

          <div className="text-xs fw-700 uppercase text-lighter" style={{ paddingLeft: 4 }}>
            All Generated System Bills ({filteredAllBills.length})
          </div>

          {filteredAllBills.length === 0 && (
            <div className="card" style={{ padding: 32, textAlign: 'center' }}>
              <div className="text-sm text-muted">No generated bills found.</div>
            </div>
          )}

          {filteredAllBills.map(o => (
            <div key={o.order_id} className="card" style={{ padding: 14 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                    <span className="text-sm fw-800 text-blue">Bill #{formatInvoiceNo(o.order_id)}</span>
                    <span className="text-base fw-800 text-dark text-wrap-break">{o.shop_name || o.client_name}</span>
                    <span className={`badge ${o.delivery_status === 'delivered' ? 'badge-green' : 'badge-amber'}`}>
                      {o.delivery_status}
                    </span>
                  </div>
                  <div className="text-xs text-muted" style={{ marginTop: 2 }}>
                    Client: {o.client_name} · Date: <strong>{o.order_date}</strong>
                  </div>
                </div>

                <div style={{ textAlign: 'right', flexShrink: 0, display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 4 }}>
                  <div className="text-base fw-900 text-blue">Rs. {(o.net_total || 0).toLocaleString()}</div>
                  <div className="text-xs text-emerald">Received: Rs. {(o.payment_amount || 0).toLocaleString()}</div>
                  <div className="text-xs text-amber">Balance: Rs. {(o.new_balance_after_order || 0).toLocaleString()}</div>
                  <button
                    onClick={() => setReceiptOrder(o)}
                    style={{
                      background: '#1E40AF', color: '#fff', border: 'none',
                      borderRadius: 6, padding: '3px 8px', fontSize: '0.68rem', fontWeight: 800, cursor: 'pointer'
                    }}
                  >
                    🖨️ Saved Bill
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* ══════════════════════════════════════════════════════════════════
          SAVED WHITE THERMAL RECEIPT MODAL
      ══════════════════════════════════════════════════════════════════ */}
      {receiptOrder && (
        <div className="overlay" onClick={() => setReceiptOrder(null)}>
          <div className="sheet" onClick={e => e.stopPropagation()} style={{ maxHeight: '90vh', overflowY: 'auto' }}>
            <div className="sheet-handle" />

            {/* REALISTIC WHITE THERMAL RECEIPT PREVIEW */}
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
                <span>Bill #: {formatInvoiceNo(receiptOrder.order_id)}</span>
                <span>Date: {receiptOrder.order_date}</span>
              </div>

              <div>Shop: <strong>{receiptOrder.shop_name || receiptOrder.client_name}</strong></div>
              <div>Client: {receiptOrder.client_name}</div>
              {receiptOrder.area_name && <div>Area: {receiptOrder.area_name}</div>}

              <div style={{ borderBottom: '1px dashed #000', margin: '8px 0' }} />

              <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 'bold' }}>
                <span>ITEM</span>
                <span>QTY × RATE</span>
                <span>AMOUNT</span>
              </div>
              <div style={{ borderBottom: '1px solid #000', marginBottom: 6 }} />

              {receiptOrder.items?.map(i => (
                <div key={i.item_id} style={{ marginBottom: 4 }}>
                  <div style={{ fontWeight: 'bold' }}>{i.product_name}</div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.72rem', color: '#333' }}>
                    <span>  {i.quantity} {i.unit_type} @ {i.unit_price}</span>
                    <span>Rs. {(i.subtotal || i.quantity * i.unit_price).toLocaleString()}</span>
                  </div>
                </div>
              ))}

              <div style={{ borderBottom: '1px dashed #000', margin: '8px 0' }} />

              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span>Gross Subtotal:</span><span>Rs. {(receiptOrder.gross_amount || receiptOrder.net_total || 0).toLocaleString()}</span>
              </div>
              {(receiptOrder.discount || 0) > 0 && (
                <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 'bold' }}>
                  <span>Special Discount:</span><span>− Rs. {(receiptOrder.discount).toLocaleString()}</span>
                </div>
              )}
              <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 'bold', fontSize: '0.88rem', margin: '4px 0' }}>
                <span>NET BILL AMOUNT:</span><span>Rs. {(receiptOrder.net_total || 0).toLocaleString()}</span>
              </div>

              <div style={{ borderBottom: '1px dashed #000', margin: '6px 0' }} />

              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span>Previous Balance:</span><span>Rs. {(receiptOrder.previous_balance_at_order || 0).toLocaleString()}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span>Payment Paid Today:</span><span>Rs. {(receiptOrder.payment_amount || 0).toLocaleString()}</span>
              </div>

              <div style={{ borderBottom: '2px solid #000', margin: '6px 0' }} />

              <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 'bold', fontSize: '0.95rem' }}>
                <span>FINAL OUTSTANDING:</span><span>Rs. {(receiptOrder.new_balance_after_order || 0).toLocaleString()}</span>
              </div>

              <div style={{ borderBottom: '1px dashed #000', margin: '8px 0' }} />
              <div style={{ textAlign: 'center', fontSize: '0.7rem', fontStyle: 'italic', marginTop: 6 }}>
                Thank you for your business!
              </div>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 12 }}>
              <button
                type="button"
                className="btn-primary"
                onClick={() => {
                  const itemsHtml = (receiptOrder.items || []).map(i => `
                    <div style="margin-bottom: 4px;">
                      <div style="font-weight: bold;">${i.product_name}</div>
                      <div style="display: flex; justify-content: space-between; font-size: 11px;">
                        <span>${i.quantity} ${i.unit_type} @ ${i.unit_price}</span>
                        <span>Rs. ${(i.subtotal || i.quantity * i.unit_price).toLocaleString()}</span>
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
                        <title>Receipt #${receiptOrder.order_id} - Al Syed Distribution</title>
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
                        <div class="flex"><span>Bill #: ${receiptOrder.order_id}</span><span>Date: ${receiptOrder.order_date || ''}</span></div>
                        <div>Shop: <strong>${receiptOrder.shop_name || receiptOrder.client_name}</strong></div>
                        <div>Client: ${receiptOrder.client_name || ''}</div>
                        <div class="dashed"></div>
                        <div class="flex bold"><span>ITEM</span><span>QTY × RATE</span><span>AMOUNT</span></div>
                        <div class="dashed"></div>
                        ${itemsHtml}
                        <div class="dashed"></div>
                        <div class="flex"><span>Gross Subtotal:</span><span>Rs. ${(receiptOrder.gross_amount || receiptOrder.net_total || 0).toLocaleString()}</span></div>
                        ${(receiptOrder.discount || 0) > 0 ? `<div class="flex bold"><span>Discount:</span><span>- Rs. ${(receiptOrder.discount).toLocaleString()}</span></div>` : ''}
                        <div class="flex bold" style="font-size: 13px;"><span>NET BILL:</span><span>Rs. ${(receiptOrder.net_total || 0).toLocaleString()}</span></div>
                        <div class="dashed"></div>
                        <div class="flex"><span>Prev Balance:</span><span>Rs. ${(receiptOrder.previous_balance_at_order || 0).toLocaleString()}</span></div>
                        <div class="flex"><span>Paid Today:</span><span>Rs. ${(receiptOrder.payment_amount || 0).toLocaleString()}</span></div>
                        <div class="dashed" style="border-bottom: 2px solid #000;"></div>
                        <div class="flex bold" style="font-size: 14px;"><span>OUTSTANDING:</span><span>Rs. ${(receiptOrder.new_balance_after_order || 0).toLocaleString()}</span></div>
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
                  borderRadius: 12, padding: '10px 14px', fontSize: '0.85rem', fontWeight: 800, cursor: 'pointer'
                }}
                onClick={() => {
                  const itemsText = (receiptOrder.items || []).map(i => `• ${i.product_name}: ${i.quantity} ${i.unit_type} × Rs.${i.unit_price} = Rs.${(i.subtotal || i.quantity * i.unit_price).toLocaleString()}`).join('\n');
                  const text = `🧾 *AL SYED DISTRIBUTION — BILL #${receiptOrder.order_id}*\n` +
                    `Shop: *${receiptOrder.shop_name || receiptOrder.client_name}*\n` +
                    `Date: ${receiptOrder.order_date || ''}\n\n` +
                    `*ITEMS:*\n${itemsText}\n\n` +
                    `Net Bill: *Rs. ${(receiptOrder.net_total || 0).toLocaleString()}*\n` +
                    `Prev Balance: Rs. ${(receiptOrder.previous_balance_at_order || 0).toLocaleString()}\n` +
                    `Paid Today: Rs. ${(receiptOrder.payment_amount || 0).toLocaleString()}\n` +
                    `*Final Outstanding Balance: Rs. ${(receiptOrder.new_balance_after_order || 0).toLocaleString()}*\n\n` +
                    `Thank you for your business!`;

                  if (navigator.share) {
                    navigator.share({
                      title: `Bill #${receiptOrder.order_id} - ${receiptOrder.shop_name}`,
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

              <button type="button" className="btn-ghost" onClick={() => setReceiptOrder(null)}>
                Close Saved Bill
              </button>
            </div>

          </div>
        </div>
      )}
    </div>
  );
}
