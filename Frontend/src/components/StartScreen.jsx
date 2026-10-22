import React from 'react';

export default function StartScreen({ onNavigate, stats, todayRoute, routeClients, orders, onOpenWhatsAppSim }) {
  const pendingDeliveries = orders.filter(o =>
    o.delivery_status === 'pending' ||
    o.delivery_status === 'delivering' ||
    o.delivery_status === 'shop_closed'
  ).length;


  const todaySales = stats?.daily_sales || 0;

  return (
    <div className="page anim-fade">

      {/* ── Today's Route Banner (PURE WHITE HIGH-CONTRAST TYPOGRAPHY) ───── */}
      <div className="card" style={{
        background: 'linear-gradient(135deg, #1E40AF 0%, #2563EB 100%)',
        border: 'none', padding: '18px 16px', borderRadius: 16,
        boxShadow: '0 8px 24px rgba(30, 64, 175, 0.25)', color: '#FFFFFF'
      }}>
        {todayRoute ? (
          <>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
              <span className="badge" style={{
                background: 'rgba(255, 255, 255, 0.25)', color: '#FFFFFF',
                border: '1px solid rgba(255, 255, 255, 0.4)', fontWeight: 800
              }}>
                {todayRoute.assigned_day}
              </span>
              <span style={{ fontSize: '0.78rem', fontWeight: 800, color: '#FFFFFF', opacity: 0.95, letterSpacing: '0.5px' }}>
                Today's Delivery Route
              </span>
            </div>

            <div style={{
              fontSize: '1.25rem', fontWeight: 900, color: '#FFFFFF',
              marginBottom: 14, lineHeight: 1.3, textShadow: '0 1px 2px rgba(0,0,0,0.1)',
              wordBreak: 'break-word', overflowWrap: 'anywhere'
            }}>
              {todayRoute.route_name}
            </div>


            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10 }}>
              <div style={{ background: 'rgba(255, 255, 255, 0.12)', borderRadius: 12, padding: '10px 8px', textAlign: 'center' }}>
                <div style={{ fontSize: '1.5rem', fontWeight: 900, color: '#FFFFFF' }}>{routeClients.length}</div>
                <div style={{ fontSize: '0.72rem', fontWeight: 800, color: '#FFFFFF', opacity: 0.9 }}>Shops</div>
              </div>
              <div style={{ background: 'rgba(255, 255, 255, 0.12)', borderRadius: 12, padding: '10px 8px', textAlign: 'center' }}>
                <div style={{ fontSize: '1.5rem', fontWeight: 900, color: '#FFFFFF' }}>{pendingDeliveries}</div>
                <div style={{ fontSize: '0.72rem', fontWeight: 800, color: '#FFFFFF', opacity: 0.9 }}>To Deliver</div>
              </div>
              <div style={{ background: 'rgba(255, 255, 255, 0.12)', borderRadius: 12, padding: '10px 8px', textAlign: 'center' }}>
                <div style={{ fontSize: '1.5rem', fontWeight: 900, color: '#FFFFFF' }}>
                  {stats?.daily_orders_count || 0}
                </div>
                <div style={{ fontSize: '0.72rem', fontWeight: 800, color: '#FFFFFF', opacity: 0.9 }}>Orders Today</div>
              </div>
            </div>
          </>
        ) : (
          <>
            <div style={{ fontSize: '0.78rem', fontWeight: 800, color: '#FFFFFF', opacity: 0.9, marginBottom: 4, textTransform: 'uppercase' }}>
              Today's Revenue &amp; Sales
            </div>
            <div style={{ fontSize: '2.1rem', fontWeight: 900, color: '#FFFFFF' }}>
              Rs. {todaySales.toLocaleString()}
            </div>
            <div style={{ fontSize: '0.75rem', fontWeight: 700, color: '#FFFFFF', opacity: 0.85, marginTop: 4 }}>
              No route scheduled for today
            </div>
          </>
        )}

        <div style={{
          marginTop: 14, paddingTop: 12, borderTop: '1px solid rgba(255,255,255,0.2)',
          display: 'flex', justifyContent: 'space-between', alignItems: 'center'
        }}>
          <div style={{ fontSize: '0.85rem', fontWeight: 800, color: '#FFFFFF' }}>
            Today's Sales: <strong style={{ color: '#FFFFFF', fontSize: '1.05rem', fontWeight: 900 }}>Rs. {todaySales.toLocaleString()}</strong>
          </div>
          <button
            onClick={() => onNavigate('reports')}
            style={{
              background: 'rgba(255, 255, 255, 0.25)', border: '1px solid rgba(255, 255, 255, 0.45)',
              borderRadius: 10, padding: '6px 14px', color: '#FFFFFF',
              fontSize: '0.75rem', fontWeight: 900, cursor: 'pointer',
              boxShadow: '0 2px 8px rgba(0,0,0,0.12)'
            }}
          >
            Reports 📊
          </button>
        </div>
      </div>

      {/* ── Missed / Closed Shops Call Later Alert ────────────────── */}
      {(() => {
        try {
          const saved = localStorage.getItem('alsyed_missed_shops');
          const list = saved ? JSON.parse(saved) : [];
          if (list.length === 0) return null;
          return (
            <div className="card" style={{
              background: '#FEF3C7', border: '1.5px solid #F59E0B', padding: '12px 14px', borderRadius: 16
            }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
                <span className="text-sm fw-900 text-amber" style={{ color: '#92400E' }}>
                  ⚡ {list.length} Missed Shop(s) — Call Later
                </span>
                <button
                  className="btn-primary btn-sm"
                  style={{ width: 'auto', padding: '4px 10px', fontSize: '0.7rem' }}
                  onClick={() => onNavigate('orders')}
                >
                  Open Orders →
                </button>
              </div>
              <div className="text-xs text-muted">
                Shops were closed during route visit. Call owners on phone to take orders!
              </div>
            </div>
          );
        } catch {
          return null;
        }
      })()}


      {/* ── 3 Main Workflow Tiles ────────────────────────────────────────── */}
      <div className="text-xs fw-700 uppercase text-lighter" style={{ paddingLeft: 4 }}>
        Main Workflows
      </div>

      <div className="card-pressable" onClick={() => onNavigate('orders')}
        style={{ padding: '15px 14px', display: 'flex', alignItems: 'center', gap: 14, borderLeft: '4px solid #2563EB' }}>
        <div className="chip chip-md chip-blue">🛍️</div>
        <div style={{ flex: 1 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span className="text-base fw-800">Going for Orders</span>
            {todayRoute && <span className="badge badge-blue">{routeClients.length} shops</span>}
          </div>
          <div className="text-sm text-muted" style={{ marginTop: 2 }}>
            {todayRoute ? todayRoute.route_name : 'Collect orders from shops on route'}
          </div>
        </div>
        <span style={{ color: '#CBD5E1', fontSize: '1.2rem' }}>›</span>
      </div>

      <div className="card-pressable" onClick={() => onNavigate('delivery')}
        style={{ padding: '15px 14px', display: 'flex', alignItems: 'center', gap: 14, borderLeft: '4px solid #10B981' }}>
        <div className="chip chip-md chip-emerald">🚚</div>
        <div style={{ flex: 1 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span className="text-base fw-800">Delivery</span>
            {pendingDeliveries > 0 && (
              <span className="badge badge-amber">{pendingDeliveries} pending</span>
            )}
          </div>
          <div className="text-sm text-muted" style={{ marginTop: 2 }}>Deliver orders &amp; record payments</div>
        </div>
        <span style={{ color: '#CBD5E1', fontSize: '1.2rem' }}>›</span>
      </div>

      <div className="card-pressable" onClick={() => onNavigate('inventory')}
        style={{ padding: '15px 14px', display: 'flex', alignItems: 'center', gap: 14, borderLeft: '4px solid #F59E0B' }}>
        <div className="chip chip-md chip-amber">📦</div>
        <div style={{ flex: 1 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span className="text-base fw-800">Inventory &amp; Products</span>
          </div>
          <div className="text-sm text-muted" style={{ marginTop: 2 }}>Manage stock, brands, categories &amp; product prices</div>
        </div>
        <span style={{ color: '#CBD5E1', fontSize: '1.2rem' }}>›</span>
      </div>

      <div className="card-pressable" onClick={() => onNavigate('manage')}
        style={{ padding: '15px 14px', display: 'flex', alignItems: 'center', gap: 14, borderLeft: '4px solid #8B5CF6' }}>
        <div className="chip chip-md chip-purple">🗺️</div>
        <div style={{ flex: 1 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span className="text-base fw-800">Routes &amp; Clients</span>
          </div>
          <div className="text-sm text-muted" style={{ marginTop: 2 }}>Manage delivery routes, areas &amp; shop clients</div>
        </div>
        <span style={{ color: '#CBD5E1', fontSize: '1.2rem' }}>›</span>
      </div>

      <div className="card-pressable" onClick={() => onNavigate('catalog')}
        style={{ padding: '15px 14px', display: 'flex', alignItems: 'center', gap: 14, borderLeft: '4px solid #06B6D4' }}>
        <div className="chip chip-md chip-teal">📖</div>
        <div style={{ flex: 1 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span className="text-base fw-800">Product Showcase Catalog</span>
          </div>
          <div className="text-sm text-muted" style={{ marginTop: 2 }}>Browse all available products, bundle &amp; packet rates</div>
        </div>
        <span style={{ color: '#CBD5E1', fontSize: '1.2rem' }}>›</span>
      </div>

      <div className="card-pressable" onClick={() => onNavigate('history')}
        style={{ padding: '15px 14px', display: 'flex', alignItems: 'center', gap: 14, borderLeft: '4px solid #8B5CF6' }}>
        <div className="chip chip-md chip-purple">📜</div>
        <div style={{ flex: 1 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span className="text-base fw-800">Client &amp; Bill History Inventory</span>
          </div>
          <div className="text-sm text-muted" style={{ marginTop: 2 }}>Browse past bills, client order records &amp; outstanding balances</div>
        </div>
        <span style={{ color: '#CBD5E1', fontSize: '1.2rem' }}>›</span>
      </div>

      {/* ── Quick Utilities ──────────────────────────────────────────────── */}
      <div className="text-xs fw-700 uppercase text-lighter" style={{ paddingLeft: 4, marginTop: 4 }}>
        Quick Utilities
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 10 }}>
        <button className="card-pressable" onClick={() => onNavigate('reports')} style={{ padding: 12, border: 'none', textAlign: 'left' }}>
          <div style={{ fontSize: '1.2rem', marginBottom: 4 }}>📊</div>
          <div className="text-sm fw-800">Reports</div>
          <div className="text-xs text-muted">Daily sales summary</div>
        </button>

        <button className="card-pressable" onClick={onOpenWhatsAppSim} style={{ padding: 12, border: 'none', textAlign: 'left' }}>
          <div style={{ fontSize: '1.2rem', marginBottom: 4 }}>📱</div>
          <div className="text-sm fw-800">WhatsApp</div>
          <div className="text-xs text-muted">Simulate receipts</div>
        </button>
      </div>

    </div>
  );
}
