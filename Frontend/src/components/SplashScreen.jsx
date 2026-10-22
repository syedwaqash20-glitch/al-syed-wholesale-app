import React, { useEffect } from 'react';

export default function SplashScreen({ onComplete }) {
  useEffect(() => {
    const timer = window.setTimeout(onComplete, 1800);
    return () => window.clearTimeout(timer);
  }, [onComplete]);

  return (
    <div className="app-splash" role="status" aria-label="Al Syed Traders">
      <div className="app-splash-brand">
        <div className="app-splash-name">AL - SYED</div>
        <div className="app-splash-traders">TRADERS</div>
      </div>
      <div className="app-splash-loading" aria-hidden="true">
        <span />
        <span />
        <span />
      </div>
    </div>
  );
}
