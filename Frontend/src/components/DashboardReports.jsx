import React from 'react';

export default function DashboardReports({ stats, arshadData, todayRoute, orders }) {
  const daily     = stats?.daily_sales || 0;
  const weekly    = stats?.weekly_sales || 0;
  const yearly    = stats?.yearly_sales || 0;
  const bundles   = stats?.bundles_sold || 0;
  const packets   = stats?.packets_sold || 0;
  const mixes     = stats?.bundle_mixes_sold || 0;

  return (
    <div className="page anim-fade" style={{ paddingBottom: 90 }}>
      {/* ── Active Route Card ──────────────────────────────────────────── */}
      {todayRoute && (
        <div className="card" style={{ padding: '12px 14px', background: '#EFF6FF', border: '1px solid #BFDBFE' }}>
          <div className="text-xs fw-700 uppercase text-blue">Route Context</div>
          <div className="text-base fw-800 text-blue" style={{ marginTop: 2 }}>
            {todayRoute.assigned_day} · {todayRoute.route_name}
          </div>
          <div className="text-xs text-muted" style={{ marginTop: 2 }}>
            {todayRoute.client_count || 0} assigned shops
          </div>
        </div>
      )}

      {/* ── Financial Summary Cards ────────────────────────────────────── */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8 }}>
        <div className="card" style={{ padding: '12px 10px', textAlign: 'center' }}>
          <div className="text-xs text-muted">Daily</div>
          <div className="text-base fw-900 text-blue">Rs. {daily.toLocaleString()}</div>
          <div className="text-xs text-emerald">Received Rs. {(stats?.daily_received || 0).toLocaleString()}</div>
          <div className="text-xs text-muted" style={{ fontSize: '0.65rem' }}>{stats?.daily_orders_count || 0} orders</div>
        </div>
        <div className="card" style={{ padding: '12px 10px', textAlign: 'center' }}>
          <div className="text-xs text-muted">Weekly</div>
          <div className="text-base fw-900 text-emerald">Rs. {weekly.toLocaleString()}</div>
          <div className="text-xs text-emerald">Received Rs. {(stats?.weekly_received || 0).toLocaleString()}</div>
          <div className="text-xs text-muted" style={{ fontSize: '0.65rem' }}>{stats?.weekly_orders_count || 0} orders</div>
        </div>
        <div className="card" style={{ padding: '12px 10px', textAlign: 'center' }}>
          <div className="text-xs text-muted">Yearly</div>
          <div className="text-base fw-900 text-purple">Rs. {yearly.toLocaleString()}</div>
          <div className="text-xs text-emerald">Received Rs. {(stats?.yearly_received || 0).toLocaleString()}</div>
          <div className="text-xs text-muted" style={{ fontSize: '0.65rem' }}>{stats?.yearly_orders_count || 0} orders</div>
        </div>
      </div>

      {/* ── Unit Breakdown ────────────────────────────────────────────── */}
      <div className="card" style={{ padding: 14 }}>
        <div className="text-xs fw-700 uppercase text-lighter" style={{ marginBottom: 10 }}>Product Volume Breakdown</div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10, textAlign: 'center' }}>
          <div style={{ background: '#F8FAFC', padding: 10, borderRadius: 10 }}>
            <div className="text-xs text-muted">Bundles</div>
            <div className="text-lg fw-900 text-blue">{bundles}</div>
          </div>
          <div style={{ background: '#F8FAFC', padding: 10, borderRadius: 10 }}>
            <div className="text-xs text-muted">Packets</div>
            <div className="text-lg fw-900 text-emerald">{packets}</div>
          </div>
          <div style={{ background: '#F8FAFC', padding: 10, borderRadius: 10 }}>
            <div className="text-xs text-muted">Mixes</div>
            <div className="text-lg fw-900 text-amber">{mixes}</div>
          </div>
        </div>
      </div>

      {/* ── Arshad Foods Highlight ────────────────────────────────────── */}
      {arshadData && (
        <div className="card" style={{ padding: 14 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div>
              <div className="text-xs fw-700 uppercase text-amber">Arshad Foods Breakdown</div>
              <div className="text-lg fw-900" style={{ marginTop: 2 }}>{arshadData.total_quantity_sold} Units Sold</div>
            </div>
            <div className="text-sm fw-800 text-amber">Rs. {arshadData.total_revenue.toLocaleString()}</div>
          </div>
        </div>
      )}

      {/* ── Recent Transactions Log ───────────────────────────────────── */}
      <div className="card" style={{ padding: 14 }}>
        <div className="text-xs fw-700 uppercase text-lighter" style={{ marginBottom: 10 }}>Recent Finalized Orders</div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {orders.slice(0, 5).map(o => (
            <div key={o.order_id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '6px 0', borderBottom: '1px solid #F1F5F9' }}>
              <div>
                <div className="text-sm fw-800">{o.shop_name || o.client_name}</div>
                <div className="text-xs text-muted">Bill #{o.order_id} · {o.order_date}</div>
              </div>
              <div style={{ textAlign: 'right' }}>
                <div className="text-sm fw-900 text-blue">Rs. {(o.net_total || 0).toLocaleString()}</div>
                <div className="text-xs text-emerald">Received Rs. {(o.payment_amount || 0).toLocaleString()}</div>
                <span className="badge badge-green">{o.delivery_status}</span>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
