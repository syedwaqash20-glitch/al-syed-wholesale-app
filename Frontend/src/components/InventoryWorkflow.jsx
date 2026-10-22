import React, { useState, useMemo } from 'react';
import { api } from '../api';

export default function InventoryWorkflow({ inventory, movements, arshadData, onAdjustStock, onRefresh, showToast }) {
  const [activeTab, setActiveTab] = useState('stock'); // 'stock' | 'directory' | 'arshad' | 'movements'
  const [selectedProduct, setSelectedProduct] = useState(null);
  const [adjustQty, setAdjustQty] = useState('');
  const [movementType, setMovementType] = useState('adjustment');
  const [notes, setNotes] = useState('');

  // Sub-filter for Stock Levels ('all' | 'deficit' | 'available' | 'low')
  const [stockCategoryFilter, setStockCategoryFilter] = useState('all');

  const filteredInventory = useMemo(() => {
    if (stockCategoryFilter === 'deficit') {
      return inventory.filter(i => (i.available_qty || 0) < 0);
    } else if (stockCategoryFilter === 'available') {
      return inventory.filter(i => (i.available_qty || 0) > 0);
    } else if (stockCategoryFilter === 'low') {
      return inventory.filter(i => (i.available_qty || 0) > 0 && (i.available_qty || 0) <= (i.min_stock_level || 10));
    }
    return inventory;
  }, [inventory, stockCategoryFilter]);


  // Comprehensive Product Edit modal state
  const [editingPriceProd, setEditingPriceProd] = useState(null);
  const [editProdName, setEditProdName]         = useState('');
  const [editBrandOpt, setEditBrandOpt]         = useState('');
  const [editCustomBrand, setEditCustomBrand]   = useState('');
  const [editCatOpt, setEditCatOpt]             = useState('');
  const [editCustomCat, setEditCustomCat]       = useState('');
  const [basePriceInput, setBasePriceInput]     = useState('');
  const [bundlePriceInput, setBundlePriceInput] = useState('');
  const [packetPriceInput, setPacketPriceInput] = useState('');

  // New Product Modal state
  const [showNewProdModal, setShowNewProdModal] = useState(false);
  const [newProdName, setNewProdName]           = useState('');
  const [selectedBrandOpt, setSelectedBrandOpt] = useState('');
  const [customBrandName, setCustomBrandName]   = useState('');
  const [selectedCatOpt, setSelectedCatOpt]     = useState('');
  const [customCatName, setCustomCatName]       = useState('');
  const [newProdPrice, setNewProdPrice]         = useState('580');
  const [newProdPktPrice, setNewProdPktPrice]   = useState('97');
  const [newProdInitStock, setNewProdInitStock] = useState('100');
  const [isArshad, setIsArshad]                 = useState(false);

  // Brand Management State
  const [showCreateBrandModal, setShowCreateBrandModal] = useState(false);
  const [newBrandNameInput, setNewBrandNameInput]       = useState('');
  const [editingBrandName, setEditingBrandName]         = useState(null);
  const [editBrandNameInput, setEditBrandNameInput]     = useState('');

  // Custom Mobile Confirm Popup Modal State (Replaces browser alert!)
  const [confirmDeleteProd, setConfirmDeleteProd]   = useState(null);
  const [confirmDeleteBrand, setConfirmDeleteBrand] = useState(null);

  // Extract unique brands & categories from inventory list
  const existingBrands = useMemo(() => {
    const set = new Set();
    inventory.forEach(i => { if (i.brand_name) set.add(i.brand_name); });
    return Array.from(set).sort();
  }, [inventory]);

  const existingCategories = useMemo(() => {
    const set = new Set();
    inventory.forEach(i => { if (i.category_name) set.add(i.category_name); });
    return Array.from(set).sort();
  }, [inventory]);

  const handleAdjustSubmit = async (e) => {
    e.preventDefault();
    if (!selectedProduct || !adjustQty) return;
    try {
      await onAdjustStock({
        product_id: selectedProduct.product_id,
        change_qty: Number(adjustQty),
        movement_type: movementType,
        notes: notes.trim() || 'Manual adjustment'
      });
      setSelectedProduct(null);
      setAdjustQty('');
      setNotes('');
    } catch (err) {
      showToast?.('Stock adjustment error: ' + err.message, 'error');
    }
  };

  // Open Edit Product Modal
  const handleOpenEditProduct = (item) => {
    setEditingPriceProd(item);
    setEditProdName(item.product_name || '');
    setBasePriceInput(String(item.base_price || item.bundle_price || 580));
    setBundlePriceInput(String(item.bundle_price || item.base_price || 580));
    setPacketPriceInput(String(item.packet_price || Math.round((item.base_price || 580) / 6)));

    if (existingBrands.includes(item.brand_name)) {
      setEditBrandOpt(item.brand_name);
      setEditCustomBrand('');
    } else {
      setEditBrandOpt('OTHER');
      setEditCustomBrand(item.brand_name || '');
    }

    if (existingCategories.includes(item.category_name)) {
      setEditCatOpt(item.category_name);
      setEditCustomCat('');
    } else {
      setEditCatOpt('OTHER');
      setEditCustomCat(item.category_name || '');
    }
  };

  // Save Edit Product Changes (Refreshes Going for Order & Inventory instantly)
  const handleSaveProductEdit = async (e) => {
    e.preventDefault();
    if (!editingPriceProd) return;

    const finalBrand = editBrandOpt === 'OTHER' ? editCustomBrand.trim() : editBrandOpt;
    const finalCategory = editCatOpt === 'OTHER' ? editCustomCat.trim() : editCatOpt;

    try {
      await api.updateProduct(editingPriceProd.product_id, {
        product_name: editProdName.trim() || editingPriceProd.product_name,
        brand_name: finalBrand || 'General',
        category_name: finalCategory || 'General',
        base_price: Number(basePriceInput) || 0,
        bundle_price: Number(bundlePriceInput) || 0,
        packet_price: Number(packetPriceInput) || 0,
      });
      showToast?.(`Product '${editProdName}' updated successfully!`, 'success');
      setEditingPriceProd(null);
      onRefresh?.();
    } catch (err) {
      showToast?.('Error updating product: ' + err.message, 'error');
    }
  };

  // Execute Confirmed Delete Product
  const executeDeleteProduct = async () => {
    if (!confirmDeleteProd) return;
    const prod = confirmDeleteProd;
    setConfirmDeleteProd(null);
    try {
      await api.deleteProduct(prod.product_id);
      showToast?.(`Product '${prod.product_name}' deleted from system.`, 'success');
      setEditingPriceProd(null);
      onRefresh?.();
    } catch (err) {
      showToast?.('Error deleting product: ' + err.message, 'error');
    }
  };

  // Create New Product (Updates Inventory & Going for Order instantly)
  const handleCreateNewProduct = async (e) => {
    e.preventDefault();
    if (!newProdName.trim()) {
      showToast?.('Product name is required.', 'warning');
      return;
    }

    const finalBrand = selectedBrandOpt === 'OTHER'
      ? customBrandName.trim()
      : (selectedBrandOpt || existingBrands[0] || 'General Brand');

    const finalCategory = selectedCatOpt === 'OTHER'
      ? customCatName.trim()
      : (selectedCatOpt || 'General');

    const bPrice = Number(newProdPrice) || 580;
    const pPrice = Number(newProdPktPrice) || Math.round(bPrice / 6);
    const payload = {
      product_name: newProdName.trim(),
      brand_name: finalBrand,
      category_name: finalCategory,
      base_price: bPrice,
      bundle_price: bPrice,
      packet_price: pPrice,
      packet_conversion_qty: 6,
      is_arshad_foods: isArshad || finalBrand.toLowerCase().includes('arshad'),
      initial_stock: Number(newProdInitStock) || 100
    };

    try {
      await api.createProduct(payload);
      showToast?.(`Product '${newProdName.trim()}' added under ${finalBrand}!`, 'success');
      setShowNewProdModal(false);
      setNewProdName('');
      setCustomBrandName('');
      setCustomCatName('');
      onRefresh?.();
    } catch (err) {
      showToast?.('Error creating product: ' + err.message, 'error');
    }
  };

  // ─── Brand Management Handlers ─────────────────────────────────────────────
  const handleCreateBrand = async (e) => {
    e.preventDefault();
    if (!newBrandNameInput.trim()) return;
    try {
      await api.createBrand({ brand_name: newBrandNameInput.trim() });
      showToast?.(`Brand '${newBrandNameInput.trim()}' created!`, 'success');
      setShowCreateBrandModal(false);
      setNewBrandNameInput('');
      onRefresh?.();
    } catch (err) {
      showToast?.('Error creating brand: ' + err.message, 'error');
    }
  };

  const handleUpdateBrand = async (e) => {
    e.preventDefault();
    if (!editingBrandName || !editBrandNameInput.trim()) return;
    try {
      await api.updateBrand(editingBrandName, editBrandNameInput.trim());
      showToast?.(`Brand renamed to '${editBrandNameInput.trim()}'!`, 'success');
      setEditingBrandName(null);
      setEditBrandNameInput('');
      onRefresh?.();
    } catch (err) {
      showToast?.('Error updating brand: ' + err.message, 'error');
    }
  };

  // Execute Confirmed Delete Brand
  const executeDeleteBrand = async () => {
    if (!confirmDeleteBrand) return;
    const bName = confirmDeleteBrand;
    setConfirmDeleteBrand(null);
    try {
      await api.deleteBrand(bName);
      showToast?.(`Brand '${bName}' deleted. Products reassigned to 'General'.`, 'info');
      onRefresh?.();
    } catch (err) {
      showToast?.('Error deleting brand: ' + err.message, 'error');
    }
  };

  return (
    <div className="page anim-fade" style={{ paddingBottom: 90 }}>
      {/* ── Sub Navigation Tabs ────────────────────────────────────────── */}
      <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
        {[
          { key: 'stock', label: 'Stock Levels' },
          { key: 'directory', label: 'Brands & Categories' },
          { key: 'arshad', label: 'Arshad Foods' },
          { key: 'movements', label: 'Movements' },
        ].map(t => (
          <button
            key={t.key}
            onClick={() => setActiveTab(t.key)}
            style={{
              flex: 1, padding: '8px 0', borderRadius: 10, border: 'none',
              background: activeTab === t.key ? '#1E40AF' : '#F1F5F9',
              color: activeTab === t.key ? '#fff' : '#64748B',
              fontFamily: 'inherit', fontSize: '0.72rem', fontWeight: 700, cursor: 'pointer'
            }}
          >
            {t.label}
          </button>
        ))}
      </div>

      <button
        onClick={() => {
          setSelectedBrandOpt(existingBrands[0] || 'OTHER');
          setSelectedCatOpt(existingCategories[0] || '');
          setShowNewProdModal(true);
        }}
        style={{
          background: '#10B981', color: '#fff', border: 'none', borderRadius: 10,
          padding: '10px 14px', fontSize: '0.78rem', fontWeight: 800, cursor: 'pointer',
          display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6
        }}
      >
        + Add New Product in Brand / Category
      </button>

      {/* ── Tab 1: Stock Levels & Prices ───────────────────────────────── */}
      {activeTab === 'stock' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>

          {/* ── Stock Category Filter Pills ── */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 5, marginBottom: 4 }}>
            {[
              {
                key: 'all',
                label: 'All',
                count: inventory.length,
                activeBg: '#1E40AF', activeColor: '#fff',
                inactiveBg: '#F1F5F9', inactiveColor: '#475569',
                icon: '📦'
              },
              {
                key: 'available',
                label: 'Available',
                count: inventory.filter(i => (i.available_qty || 0) > 0).length,
                activeBg: '#065F46', activeColor: '#fff',
                inactiveBg: '#ECFDF5', inactiveColor: '#065F46',
                icon: '✅'
              },
              {
                key: 'low',
                label: 'Low',
                count: inventory.filter(i => (i.available_qty || 0) > 0 && (i.available_qty || 0) <= (i.min_stock_level || 10)).length,
                activeBg: '#92400E', activeColor: '#fff',
                inactiveBg: '#FFFBEB', inactiveColor: '#92400E',
                icon: '⚡'
              },
              {
                key: 'deficit',
                label: 'Deficit',
                count: inventory.filter(i => (i.available_qty || 0) < 0).length,
                activeBg: '#991B1B', activeColor: '#fff',
                inactiveBg: '#FFF1F2', inactiveColor: '#991B1B',
                icon: '⚠️'
              }
            ].map(f => {
              const isActive = stockCategoryFilter === f.key;
              return (
                <button
                  key={f.key}
                  onClick={() => setStockCategoryFilter(f.key)}
                  style={{
                    padding: '7px 4px',
                    borderRadius: 10,
                    border: `1.5px solid ${isActive ? 'transparent' : '#E2E8F0'}`,
                    background: isActive ? f.activeBg : f.inactiveBg,
                    color: isActive ? f.activeColor : f.inactiveColor,
                    fontSize: '0.65rem',
                    fontWeight: 800,
                    cursor: 'pointer',
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    gap: 2,
                    transition: 'all 0.15s ease'
                  }}
                >
                  <span style={{ fontSize: '0.9rem' }}>{f.icon}</span>
                  <span>{f.label}</span>
                  <span style={{
                    fontSize: '0.8rem',
                    fontWeight: 900,
                    background: isActive ? 'rgba(255,255,255,0.2)' : 'rgba(0,0,0,0.08)',
                    borderRadius: 6,
                    padding: '1px 6px'
                  }}>{f.count}</span>
                </button>
              );
            })}
          </div>

          {/* ── Empty State ── */}
          {filteredInventory.length === 0 && (
            <div style={{
              textAlign: 'center', padding: '32px 16px',
              background: '#F8FAFC', borderRadius: 14,
              border: '1px dashed #CBD5E1'
            }}>
              <div style={{ fontSize: '2rem', marginBottom: 8 }}>🎉</div>
              <div style={{ fontWeight: 800, color: '#475569', fontSize: '0.85rem' }}>
                {stockCategoryFilter === 'deficit' ? 'No deficit items — great!' :
                 stockCategoryFilter === 'low' ? 'No low stock items — well stocked!' :
                 stockCategoryFilter === 'available' ? 'No available stock items.' :
                 'No products found.'}
              </div>
            </div>
          )}

          {/* ── Product Cards ── */}
          {filteredInventory.map(item => {
            const isNegative = item.available_qty < 0;
            const isLow = item.available_qty <= (item.min_stock_level || 10) && !isNegative;
            return (
              <div key={item.product_id} className="card" style={{
                padding: '12px 14px',
                borderLeft: `4px solid ${isNegative ? '#EF4444' : isLow ? '#F59E0B' : '#10B981'}`
              }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                      <span className="text-base fw-800 text-wrap-break">{item.product_name}</span>
                      {item.is_arshad_foods ? <span className="badge badge-amber">Arshad</span> : null}
                      {isNegative
                        ? <span className="badge badge-red">⚠️ Deficit ({item.available_qty})</span>
                        : isLow
                          ? <span className="badge badge-amber">⚡ Low Stock</span>
                          : <span style={{ fontSize: '0.65rem', fontWeight: 800, color: '#065F46', background: '#ECFDF5', padding: '2px 6px', borderRadius: 6 }}>✅ OK</span>
                      }
                    </div>
                    <div className="text-xs text-muted" style={{ marginTop: 2 }}>
                      Brand: <strong>{item.brand_name || 'General'}</strong> · Cat: <strong>{item.category_name || 'General'}</strong>
                    </div>
                    <div className="text-xs fw-800 text-blue" style={{ marginTop: 2 }}>
                      Bundle: Rs. {item.bundle_price || item.base_price || 580} · Packet: Rs. {item.packet_price || Math.round((item.bundle_price||580)/6)}
                    </div>
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 5, flexShrink: 0, marginLeft: 8 }}>
                    <button
                      onClick={() => handleOpenEditProduct(item)}
                      style={{
                        padding: '5px 10px', borderRadius: 8, border: '1px solid #BFDBFE',
                        background: '#EFF6FF', color: '#1E40AF', fontSize: '0.7rem', fontWeight: 700, cursor: 'pointer'
                      }}
                    >
                      ✏️ Edit
                    </button>
                    <button
                      onClick={() => setSelectedProduct(item)}
                      style={{
                        padding: '5px 10px', borderRadius: 8, border: '1px solid #BBF7D0',
                        background: '#F0FDF4', color: '#065F46', fontSize: '0.7rem', fontWeight: 700, cursor: 'pointer'
                      }}
                    >
                      ⚡ Adjust
                    </button>
                  </div>
                </div>

                <div className="divider" style={{ margin: '8px 0' }} />

                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', textAlign: 'center' }}>
                  <div>
                    <div className="text-xs text-muted">Current</div>
                    <div className={`text-sm fw-800 ${item.current_qty < 0 ? 'text-red' : ''}`}>{item.current_qty}</div>
                  </div>
                  <div>
                    <div className="text-xs text-muted">Reserved</div>
                    <div className="text-sm fw-800 text-amber">{item.reserved_qty}</div>
                  </div>
                  <div>
                    <div className="text-xs text-muted">Available</div>
                    <div className={`text-sm fw-900 ${isNegative ? 'text-red' : isLow ? 'text-amber' : 'text-emerald'}`}>
                      {item.available_qty}
                    </div>
                  </div>
                </div>
              </div>
            );
          })}

        </div>
      )}


      {/* ── Tab 2: Brands & Categories Directory & Management ─────────── */}
      {activeTab === 'directory' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          
          {/* Brand Management Section */}
          <div className="card" style={{ padding: 16 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
              <div>
                <div className="text-sm fw-800 text-blue uppercase">Product Brands Directory ({existingBrands.length})</div>
                <div className="text-xs text-muted">Manage system brands &amp; renames</div>
              </div>
              <button
                onClick={() => setShowCreateBrandModal(true)}
                style={{
                  background: '#1E40AF', color: '#fff', border: 'none', borderRadius: 8,
                  padding: '5px 10px', fontSize: '0.72rem', fontWeight: 800, cursor: 'pointer'
                }}
              >
                + Create Brand
              </button>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {existingBrands.map(b => {
                const prodCount = inventory.filter(i => i.brand_name === b).length;
                return (
                  <div key={b} style={{
                    display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                    padding: '8px 10px', background: '#F8FAFC', borderRadius: 10, border: '1px solid #E2E8F0'
                  }}>
                    <div>
                      <div className="text-sm fw-800">🏷️ {b}</div>
                      <div className="text-xs text-muted">{prodCount} Product{prodCount !== 1 ? 's' : ''}</div>
                    </div>

                    <div style={{ display: 'flex', gap: 6 }}>
                      <button
                        onClick={() => {
                          setEditingBrandName(b);
                          setEditBrandNameInput(b);
                        }}
                        style={{
                          background: '#EFF6FF', border: '1px solid #BFDBFE', color: '#1E40AF',
                          padding: '3px 8px', borderRadius: 6, fontSize: '0.68rem', fontWeight: 700, cursor: 'pointer'
                        }}
                      >
                        ✏️ Rename
                      </button>
                      <button
                        onClick={() => setConfirmDeleteBrand(b)}
                        style={{
                          background: '#FEE2E2', border: '1px solid #FECACA', color: '#DC2626',
                          padding: '3px 8px', borderRadius: 6, fontSize: '0.68rem', fontWeight: 700, cursor: 'pointer'
                        }}
                      >
                        🗑️ Delete
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Categories List Section */}
          <div className="card" style={{ padding: 16 }}>
            <div className="text-sm fw-800 text-purple uppercase" style={{ marginBottom: 10 }}>
              Active Product Categories ({existingCategories.length})
            </div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
              {existingCategories.map(c => (
                <span key={c} className="badge badge-purple" style={{ fontSize: '0.75rem', padding: '6px 12px' }}>
                  📦 {c}
                </span>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* ── Tab 3: Arshad Foods Breakdown ────────────────────────────── */}
      {activeTab === 'arshad' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <div className="card" style={{ padding: '14px', background: 'linear-gradient(135deg, #FFFBEB 0%, #FEF3C7 100%)', border: '1px solid #FDE68A' }}>
            <div className="text-xs fw-700 uppercase text-amber" style={{ marginBottom: 4 }}>Arshad Foods Special Summary</div>
            <div className="text-2xl fw-900 text-amber" style={{ color: '#B45309' }}>
              {arshadData?.total_quantity_sold || 0} Units Sold
            </div>
            <div className="text-xs text-muted" style={{ marginTop: 4 }}>
              Total Revenue: Rs. {(arshadData?.total_revenue || 0).toLocaleString()}
            </div>
          </div>

          <div className="card" style={{ padding: 14 }}>
            <div className="text-xs fw-700 uppercase text-lighter" style={{ marginBottom: 10 }}>Product-Level Sales</div>
            {arshadData?.products?.map(p => (
              <div key={p.product_id} style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0', borderBottom: '1px solid #F1F5F9' }}>
                <div>
                  <div className="text-sm fw-800">{p.product_name}</div>
                  <div className="text-xs text-muted">Revenue: Rs. {(p.total_revenue || 0).toLocaleString()}</div>
                </div>
                <div className="text-sm fw-900 text-blue">
                  {p.total_quantity_sold} sold
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── Tab 4: Inventory Movements ───────────────────────────────── */}
      {activeTab === 'movements' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {movements.map(m => (
            <div key={m.movement_id} className="card" style={{ padding: '10px 14px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div>
                  <div className="text-sm fw-800">{m.product_name}</div>
                  <div className="text-xs text-muted">{m.notes} · {new Date(m.created_at).toLocaleDateString()}</div>
                </div>
                <div style={{ textAlign: 'right' }}>
                  <span className={`badge ${m.change_qty >= 0 ? 'badge-green' : 'badge-red'}`}>
                    {m.change_qty >= 0 ? `+${m.change_qty}` : m.change_qty}
                  </span>
                  <div className="text-xs text-muted" style={{ marginTop: 2 }}>{m.movement_type}</div>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* ── Modal 1: Adjust Stock ──────────────────────────────────────── */}
      {selectedProduct && (
        <div className="overlay" onClick={() => setSelectedProduct(null)}>
          <div className="sheet" onClick={e => e.stopPropagation()}>
            <div className="sheet-handle" />
            <div className="text-lg fw-900" style={{ marginBottom: 4 }}>
              ⚡ Adjust Stock
            </div>
            <div className="text-sm fw-800" style={{ marginBottom: 4, color: '#1E40AF' }}>
              {selectedProduct.product_name}
            </div>

            {/* Current stock summary */}
            <div style={{
              display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)',
              gap: 6, marginBottom: 14, textAlign: 'center',
              background: '#F8FAFC', borderRadius: 12, padding: '10px 8px',
              border: '1px solid #E2E8F0'
            }}>
              <div>
                <div className="text-xs text-muted">Current</div>
                <div className={`text-sm fw-900 ${selectedProduct.current_qty < 0 ? 'text-red' : ''}`}>
                  {selectedProduct.current_qty}
                </div>
              </div>
              <div>
                <div className="text-xs text-muted">Reserved</div>
                <div className="text-sm fw-900 text-amber">{selectedProduct.reserved_qty}</div>
              </div>
              <div>
                <div className="text-xs text-muted">Available</div>
                <div className={`text-sm fw-900 ${selectedProduct.available_qty < 0 ? 'text-red' : 'text-emerald'}`}>
                  {selectedProduct.available_qty}
                </div>
              </div>
            </div>

            <form onSubmit={handleAdjustSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              <div>
                <label className="text-xs fw-700 uppercase text-lighter">Quantity Change (+ to add, - to remove)</label>
                <input
                  type="number"
                  className="input"
                  placeholder="e.g. +50 or -10"
                  value={adjustQty}
                  onChange={e => setAdjustQty(e.target.value)}
                  required
                />
              </div>

              {/* Quick-add shortcut buttons */}
              <div>
                <label className="text-xs fw-700 uppercase text-lighter" style={{ marginBottom: 5, display: 'block' }}>Quick Shortcuts</label>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 5 }}>
                  {[10, 25, 50, 100, -10].map(v => (
                    <button
                      key={v}
                      type="button"
                      onClick={() => setAdjustQty(String(v))}
                      style={{
                        padding: '7px 4px',
                        borderRadius: 8,
                        border: `1.5px solid ${v < 0 ? '#FECACA' : '#BFDBFE'}`,
                        background: v < 0 ? '#FFF1F2' : '#EFF6FF',
                        color: v < 0 ? '#DC2626' : '#1E40AF',
                        fontSize: '0.72rem',
                        fontWeight: 800,
                        cursor: 'pointer'
                      }}
                    >
                      {v > 0 ? `+${v}` : v}
                    </button>
                  ))}
                </div>
              </div>

              {/* Set exact stock level */}
              <div style={{
                background: '#FFFBEB', border: '1px solid #FDE68A',
                borderRadius: 10, padding: '8px 10px'
              }}>
                <label className="text-xs fw-700 uppercase text-lighter" style={{ color: '#92400E' }}>
                  Set to Exact Stock Level
                </label>
                <div style={{ display: 'flex', gap: 6, marginTop: 5 }}>
                  <input
                    type="number"
                    className="input"
                    style={{ flex: 1, margin: 0 }}
                    placeholder={`Current: ${selectedProduct.current_qty}`}
                    id="exactStockInput"
                  />
                  <button
                    type="button"
                    style={{
                      padding: '8px 12px', borderRadius: 8, border: 'none',
                      background: '#F59E0B', color: '#fff', fontWeight: 800,
                      fontSize: '0.72rem', cursor: 'pointer', whiteSpace: 'nowrap'
                    }}
                    onClick={() => {
                      const exact = Number(document.getElementById('exactStockInput').value);
                      if (!isNaN(exact)) {
                        const diff = exact - (selectedProduct.current_qty || 0);
                        setAdjustQty(String(diff));
                        setMovementType('adjustment');
                        setNotes(`Set to exact stock level: ${exact}`);
                      }
                    }}
                  >
                    → Set
                  </button>
                </div>
              </div>

              <div>
                <label className="text-xs fw-700 uppercase text-lighter">Movement Type</label>
                <select
                  className="input"
                  value={movementType}
                  onChange={e => setMovementType(e.target.value)}
                >
                  <option value="adjustment">Stock Adjustment</option>
                  <option value="purchase">Purchase Intake</option>
                  <option value="return">Return</option>
                </select>
              </div>

              <div>
                <label className="text-xs fw-700 uppercase text-lighter">Notes</label>
                <input
                  type="text"
                  className="input"
                  placeholder="e.g. Supplier delivery, manual count"
                  value={notes}
                  onChange={e => setNotes(e.target.value)}
                />
              </div>

              <button type="submit" className="btn-primary" style={{ marginTop: 4 }}>
                ✅ Save Adjustment
              </button>
              <button type="button" className="btn-ghost" onClick={() => setSelectedProduct(null)}>
                Cancel
              </button>
            </form>
          </div>
        </div>
      )}

      {/* ── Modal 2: Edit Product (Category Name is OPTIONAL) ───────────── */}
      {editingPriceProd && (
        <div className="overlay" onClick={() => setEditingPriceProd(null)}>
          <div className="sheet" onClick={e => e.stopPropagation()} style={{ maxHeight: '88vh', overflowY: 'auto' }}>
            <div className="sheet-handle" />
            <div className="text-lg fw-900" style={{ marginBottom: 4 }}>
              Edit Product: {editingPriceProd.product_name}
            </div>
            <div className="text-sm text-muted" style={{ marginBottom: 14 }}>
              Modify product details, category, brand name, and rates.
            </div>

            <form onSubmit={handleSaveProductEdit} style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              <div>
                <label className="text-xs fw-700 uppercase text-lighter">Product Name</label>
                <input
                  className="input"
                  value={editProdName}
                  onChange={e => setEditProdName(e.target.value)}
                  required
                />
              </div>

              <div>
                <label className="text-xs fw-700 uppercase text-lighter">Brand Name</label>
                <select
                  className="input"
                  style={{ fontWeight: 700 }}
                  value={editBrandOpt}
                  onChange={e => setEditBrandOpt(e.target.value)}
                >
                  {existingBrands.map(b => (
                    <option key={b} value={b}>Brand: {b}</option>
                  ))}
                  <option value="OTHER">➕ Other / Change Brand Name…</option>
                </select>
                {editBrandOpt === 'OTHER' && (
                  <input
                    className="input"
                    style={{ marginTop: 6 }}
                    placeholder="Type new brand name"
                    value={editCustomBrand}
                    onChange={e => setEditCustomBrand(e.target.value)}
                    required
                  />
                )}
              </div>

              <div>
                <label className="text-xs fw-700 uppercase text-lighter">
                  Category Name (Optional)
                </label>
                <select
                  className="input"
                  style={{ fontWeight: 700 }}
                  value={editCatOpt}
                  onChange={e => setEditCatOpt(e.target.value)}
                >
                  <option value="">None / Default Category</option>
                  {existingCategories.map(c => (
                    <option key={c} value={c}>Category: {c}</option>
                  ))}
                  <option value="OTHER">➕ Other / Change Category Name…</option>
                </select>
                {editCatOpt === 'OTHER' && (
                  <input
                    className="input"
                    style={{ marginTop: 6 }}
                    placeholder="Type category name (optional)"
                    value={editCustomCat}
                    onChange={e => setEditCustomCat(e.target.value)}
                  />
                )}
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                <div>
                  <label className="text-xs fw-700 uppercase text-lighter">Bundle Price (Rs.)</label>
                  <input
                    type="number"
                    step="any"
                    min="0"
                    className="input"
                    value={bundlePriceInput}
                    onChange={e => setBundlePriceInput(e.target.value)}
                    required
                  />
                </div>
                <div>
                  <label className="text-xs fw-700 uppercase text-lighter">Packet Price (Rs. Decimals Allowed)</label>
                  <input
                    type="number"
                    step="any"
                    min="0"
                    className="input"
                    value={packetPriceInput}
                    onChange={e => setPacketPriceInput(e.target.value)}
                  />
                </div>
              </div>


              <button type="submit" className="btn-primary" style={{ marginTop: 8 }}>
                Save Product Changes
              </button>

              <button
                type="button"
                onClick={() => setConfirmDeleteProd(editingPriceProd)}
                style={{
                  background: '#FEE2E2', border: '1px solid #FECACA', color: '#DC2626',
                  borderRadius: 10, padding: '10px 0', fontSize: '0.8rem', fontWeight: 800, cursor: 'pointer'
                }}
              >
                🗑️ Delete Product from System
              </button>

              <button type="button" className="btn-ghost" onClick={() => setEditingPriceProd(null)}>
                Cancel
              </button>
            </form>
          </div>
        </div>
      )}

      {/* ── Modal 3: Add New Product ────────────────────────────────────── */}
      {showNewProdModal && (
        <div className="overlay" onClick={() => setShowNewProdModal(false)}>
          <div className="sheet" onClick={e => e.stopPropagation()} style={{ maxHeight: '85vh', overflowY: 'auto' }}>
            <div className="sheet-handle" />
            <div className="text-lg fw-900" style={{ marginBottom: 12 }}>
              Add New Product to System
            </div>

            <form onSubmit={handleCreateNewProduct} style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              <div>
                <label className="text-xs fw-700 uppercase text-lighter">Product Name</label>
                <input
                  className="input"
                  placeholder="e.g. Potato Sticks Crunchy 50g"
                  value={newProdName}
                  onChange={e => setNewProdName(e.target.value)}
                  required
                />
              </div>

              {/* BRAND SELECTION DROPDOWN */}
              <div>
                <label className="text-xs fw-700 uppercase text-lighter">Select Brand</label>
                <select
                  className="input"
                  style={{ fontWeight: 700 }}
                  value={selectedBrandOpt}
                  onChange={e => setSelectedBrandOpt(e.target.value)}
                >
                  {existingBrands.map(b => (
                    <option key={b} value={b}>Brand: {b}</option>
                  ))}
                  <option value="OTHER">➕ Other / Add New Brand…</option>
                </select>
                {selectedBrandOpt === 'OTHER' && (
                  <input
                    className="input"
                    style={{ marginTop: 6 }}
                    placeholder="Type new brand name (e.g. Lays, Nimko Master)"
                    value={customBrandName}
                    onChange={e => setCustomBrandName(e.target.value)}
                    required
                  />
                )}
              </div>

              {/* CATEGORY SELECTION DROPDOWN (OPTIONAL) */}
              <div>
                <label className="text-xs fw-700 uppercase text-lighter">
                  Select Category (Optional)
                </label>
                <select
                  className="input"
                  style={{ fontWeight: 700 }}
                  value={selectedCatOpt}
                  onChange={e => setSelectedCatOpt(e.target.value)}
                >
                  <option value="">None / Optional Category</option>
                  {existingCategories.map(c => (
                    <option key={c} value={c}>Category: {c}</option>
                  ))}
                  <option value="OTHER">➕ Other / Add New Category…</option>
                </select>
                {selectedCatOpt === 'OTHER' && (
                  <input
                    className="input"
                    style={{ marginTop: 6 }}
                    placeholder="Type new category name (optional)"
                    value={customCatName}
                    onChange={e => setCustomCatName(e.target.value)}
                  />
                )}
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                <div>
                  <label className="text-xs fw-700 uppercase text-lighter">Bundle Price (Rs.)</label>
                  <input
                    type="number"
                    min="0"
                    className="input"
                    value={newProdPrice}
                    onChange={e => setNewProdPrice(e.target.value)}
                    required
                  />
                </div>
                <div>
                  <label className="text-xs fw-700 uppercase text-lighter">Packet Price (Rs.)</label>
                  <input
                    type="number"
                    min="0"
                    className="input"
                    value={newProdPktPrice}
                    onChange={e => setNewProdPktPrice(e.target.value)}
                  />
                </div>
              </div>

              <div>
                <label className="text-xs fw-700 uppercase text-lighter">Initial Stock Quantity</label>
                <input
                  type="number"
                  min="0"
                  className="input"
                  value={newProdInitStock}
                  onChange={e => setNewProdInitStock(e.target.value)}
                />
              </div>

              <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: '0.8rem', fontWeight: 700, cursor: 'pointer' }}>
                <input
                  type="checkbox"
                  checked={isArshad}
                  onChange={e => setIsArshad(e.target.checked)}
                />
                Mark as Arshad Foods Product
              </label>

              <button type="submit" className="btn-primary" style={{ marginTop: 8 }}>
                Save Product &amp; Update Order Menu
              </button>
              <button type="button" className="btn-ghost" onClick={() => setShowNewProdModal(false)}>
                Cancel
              </button>
            </form>
          </div>
        </div>
      )}

      {/* ── Modal 4: Create Brand ───────────────────────────────────────── */}
      {showCreateBrandModal && (
        <div className="overlay" onClick={() => setShowCreateBrandModal(false)}>
          <div className="sheet" onClick={e => e.stopPropagation()}>
            <div className="sheet-handle" />
            <div className="text-lg fw-900" style={{ marginBottom: 12 }}>Create New Brand</div>

            <form onSubmit={handleCreateBrand} style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              <div>
                <label className="text-xs fw-700 uppercase text-lighter">Brand Name</label>
                <input
                  className="input"
                  placeholder="e.g. Lays, Super Crisps"
                  value={newBrandNameInput}
                  onChange={e => setNewBrandNameInput(e.target.value)}
                  required
                />
              </div>

              <button type="submit" className="btn-primary" style={{ marginTop: 8 }}>Save Brand</button>
              <button type="button" className="btn-ghost" onClick={() => setShowCreateBrandModal(false)}>Cancel</button>
            </form>
          </div>
        </div>
      )}

      {/* ── Modal 5: Rename Brand ───────────────────────────────────────── */}
      {editingBrandName && (
        <div className="overlay" onClick={() => setEditingBrandName(null)}>
          <div className="sheet" onClick={e => e.stopPropagation()}>
            <div className="sheet-handle" />
            <div className="text-lg fw-900" style={{ marginBottom: 4 }}>Rename Brand: {editingBrandName}</div>
            <div className="text-sm text-muted" style={{ marginBottom: 12 }}>
              Renaming will update all products under this brand instantly.
            </div>

            <form onSubmit={handleUpdateBrand} style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              <div>
                <label className="text-xs fw-700 uppercase text-lighter">New Brand Name</label>
                <input
                  className="input"
                  value={editBrandNameInput}
                  onChange={e => setEditBrandNameInput(e.target.value)}
                  required
                />
              </div>

              <button type="submit" className="btn-primary" style={{ marginTop: 8 }}>Rename Brand</button>
              <button type="button" className="btn-ghost" onClick={() => setEditingBrandName(null)}>Cancel</button>
            </form>
          </div>
        </div>
      )}

      {/* ── 📱 CUSTOM MOBILE CONFIRM POPUP MODAL: DELETE PRODUCT (Yes / No) ── */}
      {confirmDeleteProd && (
        <div className="overlay" onClick={() => setConfirmDeleteProd(null)}>
          <div className="sheet" onClick={e => e.stopPropagation()} style={{ textAlign: 'center', padding: '24px 20px' }}>
            <div className="sheet-handle" />
            <div style={{ fontSize: '2.8rem', marginBottom: 6 }}>⚠️</div>
            <div className="text-xl fw-900 text-red" style={{ color: '#DC2626', marginBottom: 6 }}>
              Delete Product from System?
            </div>
            <div className="text-sm text-muted text-wrap-break" style={{ marginBottom: 20 }}>
              Are you sure you want to permanently delete <strong>"{confirmDeleteProd.product_name}"</strong>? This will update the database and remove it from Going for Order.
            </div>

            <div style={{ display: 'flex', gap: 10 }}>
              <button
                type="button"
                onClick={() => setConfirmDeleteProd(null)}
                style={{
                  flex: 1, minHeight: 48, borderRadius: 12, border: '1.5px solid #CBD5E1',
                  background: '#F8FAFC', color: '#334155', fontFamily: 'inherit',
                  fontSize: '0.88rem', fontWeight: 800, cursor: 'pointer'
                }}
              >
                No, Keep Product
              </button>
              <button
                type="button"
                onClick={executeDeleteProduct}
                style={{
                  flex: 1, minHeight: 48, borderRadius: 12, border: 'none',
                  background: '#DC2626', color: '#FFFFFF', fontFamily: 'inherit',
                  fontSize: '0.88rem', fontWeight: 900, cursor: 'pointer',
                  boxShadow: '0 4px 14px rgba(220, 38, 38, 0.3)'
                }}
              >
                Yes, Delete Product
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── 📱 CUSTOM MOBILE CONFIRM POPUP MODAL: DELETE BRAND (Yes / No) ── */}
      {confirmDeleteBrand && (
        <div className="overlay" onClick={() => setConfirmDeleteBrand(null)}>
          <div className="sheet" onClick={e => e.stopPropagation()} style={{ textAlign: 'center', padding: '24px 20px' }}>
            <div className="sheet-handle" />
            <div style={{ fontSize: '2.8rem', marginBottom: 6 }}>🏷️</div>
            <div className="text-xl fw-900 text-red" style={{ color: '#DC2626', marginBottom: 6 }}>
              Delete Brand?
            </div>
            <div className="text-sm text-muted text-wrap-break" style={{ marginBottom: 20 }}>
              Delete brand <strong>"{confirmDeleteBrand}"</strong>? Products under this brand will automatically move to 'General'.
            </div>

            <div style={{ display: 'flex', gap: 10 }}>
              <button
                type="button"
                onClick={() => setConfirmDeleteBrand(null)}
                style={{
                  flex: 1, minHeight: 48, borderRadius: 12, border: '1.5px solid #CBD5E1',
                  background: '#F8FAFC', color: '#334155', fontFamily: 'inherit',
                  fontSize: '0.88rem', fontWeight: 800, cursor: 'pointer'
                }}
              >
                No, Keep Brand
              </button>
              <button
                type="button"
                onClick={executeDeleteBrand}
                style={{
                  flex: 1, minHeight: 48, borderRadius: 12, border: 'none',
                  background: '#DC2626', color: '#FFFFFF', fontFamily: 'inherit',
                  fontSize: '0.88rem', fontWeight: 900, cursor: 'pointer',
                  boxShadow: '0 4px 14px rgba(220, 38, 38, 0.3)'
                }}
              >
                Yes, Delete Brand
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
