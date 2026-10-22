import React from 'react';

export default function Navbar({
  activeScreen, title, onBack, isOnline, step, totalSteps,
  pendingSyncCount = 0, isSyncing = false, onSync
}) {
  return (
    <header className="app-header">
      <div className="app-header-bar">
        {/* Left: Back or Logo */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          {activeScreen !== 'start' ? (
            <button className="header-back-btn" onClick={onBack} aria-label="Go Back">
              ‹
            </button>
          ) : (
            <div className="header-logo">AS</div>
          )}
          <div>
            <div className="header-title">{title || 'Al Syed Distribution'}</div>
            <div className="header-subtitle" style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
              <span style={{
                width: 6, height: 6, borderRadius: '50%',
                background: isOnline ? '#34D399' : '#FCD34D',
                display: 'inline-block'
              }} />
              {isOnline ? 'Online' : 'Offline Mode'}
            </div>
          </div>
        </div>

        {/* Right: Pure Circular Sync Icon Button (Spins when touched) */}
        <button
          onClick={onSync}
          disabled={isSyncing}
          title="Sync database"
          style={{
            background: 'rgba(255,255,255,0.18)',
            color: '#FFFFFF',
            border: '1px solid rgba(255,255,255,0.25)',
            borderRadius: '50%',
            width: 36,
            height: 36,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            cursor: isSyncing ? 'wait' : 'pointer',
            transition: 'all 0.2s ease',
            padding: 0
          }}
        >
          <span style={{
            display: 'inline-block',
            animation: isSyncing ? 'spin 1s linear infinite' : 'none',
            fontSize: '1.05rem',
            lineHeight: 1
          }}>
            🔄
          </span>
        </button>


      </div>

      {/* Progress Dots for multi-step order flow */}
      {activeScreen === 'orders' && step && (
        <div className="progress-dots-bar">
          <span className="step-label">Step {step} of {totalSteps || 3}</span>
          <div className="progress-dots">
            {Array.from({ length: totalSteps || 3 }).map((_, i) => (
              <span key={i} className={`dot ${i + 1 <= step ? 'active' : ''}`} />
            ))}
          </div>
        </div>
      )}
    </header>
  );
}

