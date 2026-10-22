import React, { useState, useMemo } from 'react';

export default function ProductCatalog({ products, brands, categories = [], inventory = [] }) {
  const [activeBrand, setActiveBrand] = useState('All');
  const [searchQuery, setSearchQuery] = useState('');

  // Map inventory O(1)
  const invMap = useMemo(() => {
    const m = {};
    inventory.forEach(i => { m[i.product_id] = i; });
    return m;
  }, [inventory]);

  const filteredProducts = useMemo(() => {
    let list = activeBrand === 'All' ? products : products.filter(p => p.brand_name === activeBrand);
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      list = list.filter(p =>
        [p.product_name, p.brand_name, p.category_name]
          .some(s => (s || '').toLowerCase().includes(q))
      );
    }
    return list;
  }, [products, activeBrand, searchQuery]);

  return (
    <div className="page anim-fade" style={{ paddingBottom: 90 }}>
      {/* ── Catalog Banner ─────────────────────────────────────────────── */}
      <div className="card" style={{ padding: '16px', background: 'linear-gradient(135deg, #0F172A 0%, #1E3A8A 100%)', color: '#fff' }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 10 }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div className="text-xs fw-700 uppercase" style={{ color: '#93C5FD', letterSpacing: '0.05em' }}>Al Syed Distribution Catalog</div>
            <div className="text-xl fw-900 text-wrap-break" style={{ marginTop: 4, lineHeight: 1.25 }}>Product Catalog & Showcase</div>
            <div className="text-xs" style={{ opacity: 0.8, marginTop: 6 }}>
              Showing {filteredProducts.length} of {products.length} products offered
            </div>
          </div>
          <span className="badge" style={{
            background: 'rgba(255,255,255,0.18)', color: '#fff',
            fontSize: '0.75rem', fontWeight: 800,
            whiteSpace: 'nowrap', flexShrink: 0,
            border: '1px solid rgba(255,255,255,0.25)',
            padding: '5px 10px', borderRadius: 10
          }}>
            📦 6 Pkt = 1 Bundle
          </span>
        </div>
      </div>


      {/* ── Search Bar ─────────────────────────────────────────────────── */}
      <input
        className="input"
        placeholder="Search products, brands, or categories…"
        value={searchQuery}
        onChange={e => setSearchQuery(e.target.value)}
      />

      {/* ── Brand Filter Chips ─────────────────────────────────────────── */}
      <div className="h-scroll" style={{ gap: 6 }}>
        {['All', ...brands.map(b => b.brand_name)].map(b => (
          <button
            key={b}
            onClick={() => setActiveBrand(b)}
            style={{
              padding: '6px 14px', borderRadius: 20, border: 'none', flexShrink: 0,
              background: activeBrand === b ? '#1E40AF' : '#F1F5F9',
              color: activeBrand === b ? '#fff' : '#475569',
              fontFamily: 'inherit', fontSize: '0.75rem', fontWeight: 700, cursor: 'pointer'
            }}
          >
            {b}
          </button>
        ))}
      </div>

      {/* ── Product Showcase Grid ──────────────────────────────────────── */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(1, 1fr)', gap: 10 }}>
        {filteredProducts.length === 0 && (
          <div className="card" style={{ padding: 32, textAlign: 'center' }}>
            <div className="text-sm text-muted">No products matching search query.</div>
          </div>
        )}

        {filteredProducts.map(p => {
          const invItem = invMap[p.product_id] || { available_qty: 0 };
          const bundlePrice = p.bundle_price || p.base_price || 0;
          const convQty = p.packet_conversion_qty || 1;
          const packetPrice = p.packet_price || (bundlePrice > 0 ? Math.round(bundlePrice / convQty) : 0);
          const isLow = invItem.available_qty <= 10 && invItem.available_qty > 0;

          return (
            <div key={p.product_id} className="card" style={{ padding: '14px 16px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                    <span className="text-base fw-900 text-dark">{p.product_name}</span>
                    {p.brand_name && <span className="badge badge-blue">{p.brand_name}</span>}
                    {p.is_arshad_foods === 1 && <span className="badge badge-amber">Arshad Foods</span>}
                  </div>
                  {p.category_name && (
                    <div className="text-xs text-muted" style={{ marginTop: 4 }}>
                      Category: {p.category_name}
                    </div>
                  )}
                </div>

                <span className={`badge ${invItem.available_qty <= 0 ? 'badge-red' : isLow ? 'badge-amber' : 'badge-green'}`}>
                  {invItem.available_qty <= 0 ? 'Out of Stock' : `In Stock: ${invItem.available_qty}`}
                </span>
              </div>

              <div className="divider" style={{ margin: '10px 0' }} />

              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', textAlign: 'center', background: '#F8FAFC', borderRadius: 10, padding: '10px 8px' }}>
                <div>
                  <div className="text-xs text-muted">Bundle Price</div>
                  <div className="text-sm fw-900 text-blue">Rs. {bundlePrice.toLocaleString()}</div>
                </div>
                <div>
                  <div className="text-xs text-muted">Packet Price</div>
                  <div className="text-sm fw-900 text-emerald">Rs. {packetPrice.toLocaleString()}</div>
                </div>
                <div>
                  <div className="text-xs text-muted">Bundle Ratio</div>
                  <div className="text-xs fw-800 text-purple" style={{ marginTop: 2 }}>
                    {convQty} Pkts = 1 Mix
                  </div>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
