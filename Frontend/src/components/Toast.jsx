import React, { useEffect } from 'react';

export default function Toast({ message, type = 'info', onClose, duration = 3000 }) {
  useEffect(() => {
    if (!message) return;
    const timer = setTimeout(() => {
      onClose?.();
    }, duration);
    return () => clearTimeout(timer);
  }, [message, duration, onClose]);

  if (!message) return null;

  const bgColors = {
    success: 'linear-gradient(135deg, #059669 0%, #10B981 100%)',
    error: 'linear-gradient(135deg, #DC2626 0%, #EF4444 100%)',
    warning: 'linear-gradient(135deg, #D97706 0%, #F59E0B 100%)',
    info: 'linear-gradient(135deg, #1E40AF 0%, #2563EB 100%)',
  };

  const icons = {
    success: '✅',
    error: '⚠️',
    warning: '⚡',
    info: 'ℹ️',
  };

  return (
    <div style={{
      position: 'fixed',
      bottom: 80,
      left: '50%',
      transform: 'translateX(-50%)',
      zIndex: 10000,

      background: bgColors[type] || bgColors.info,
      color: '#FFFFFF',
      padding: '10px 18px',
      borderRadius: 12,
      boxShadow: '0 8px 24px rgba(0,0,0,0.25)',
      display: 'flex',
      alignItems: 'center',
      gap: 10,
      fontFamily: 'inherit',
      fontSize: '0.82rem',
      fontWeight: 700,
      width: 'calc(100vw - 32px)',
      maxWidth: 400,
      boxSizing: 'border-box',
      overflow: 'hidden',
      animation: 'toastFadeIn 0.3s cubic-bezier(0.16, 1, 0.3, 1)',

    }}>
      <span style={{ fontSize: '1rem' }}>{icons[type] || 'ℹ️'}</span>
      <span style={{ flex: 1, wordBreak: 'break-word' }}>{message}</span>
      <button
        onClick={onClose}
        style={{
          background: 'rgba(255,255,255,0.2)',
          border: 'none',
          color: '#FFF',
          width: 22,
          height: 22,
          borderRadius: '50%',
          cursor: 'pointer',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontSize: '0.7rem',
          fontWeight: 900
        }}
      >
        ✕
      </button>
    </div>
  );
}
