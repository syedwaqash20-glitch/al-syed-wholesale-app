import React, { useState } from 'react';

export default function WhatsAppSimulator({ onClose, onSendIntent }) {
  const [naturalMessage, setNaturalMessage] = useState('Add 3 bundles of Pk for ABC Traders');
  const [jsonIntent, setJsonIntent] = useState(JSON.stringify({
    intent: 'create_order',
    shop_name: 'ABC Traders',
    items: [
      { product_name: 'Pk', quantity: 3, unit_type: 'bundle' }
    ]
  }, null, 2));

  const [loading, setLoading] = useState(false);
  const [response, setResponse] = useState(null);

  const presets = [
    {
      label: 'Create Order (ABC Traders)',
      msg: 'Add 3 bundles of Pk for ABC Traders',
      json: {
        intent: 'create_order',
        shop_name: 'ABC Traders',
        items: [{ product_name: 'Pk', quantity: 3, unit_type: 'bundle' }]
      }
    },
    {
      label: 'Check Balance (ABC General)',
      msg: 'What is the balance for ABC General Store?',
      json: {
        intent: 'client_balance',
        shop_name: 'ABC General Store'
      }
    }
  ];

  const handlePresetSelect = (p) => {
    setNaturalMessage(p.msg);
    setJsonIntent(JSON.stringify(p.json, null, 2));
    setResponse(null);
  };

  const handleExecute = async () => {
    try {
      setLoading(true);
      const parsed = JSON.parse(jsonIntent);
      const res = await onSendIntent(parsed);
      setResponse(res);
    } catch (err) {
      setResponse({ success: false, message: `Parse or Execution Error: ${err.message}` });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="light-bottom-sheet-overlay">
      <div className="light-bottom-sheet-content space-y-3.5 max-h-[92vh]">
        <div className="flex items-center justify-between border-b border-slate-100 pb-2.5">
          <div className="flex items-center gap-2">
            <span className="w-8 h-8 rounded-xl bg-emerald-100 text-emerald-800 font-bold text-xs flex items-center justify-center">
              WA
            </span>
            <div>
              <h4 className="text-sm font-extrabold text-slate-900">WhatsApp Bot Intent Simulator</h4>
              <p className="text-[10px] text-slate-500">LLM-to-JSON Schema Validation</p>
            </div>
          </div>
          <button onClick={onClose} className="text-xs font-bold text-slate-400">✕</button>
        </div>

        <div className="flex gap-2">
          {presets.map((p, idx) => (
            <button
              key={idx}
              onClick={() => handlePresetSelect(p)}
              className="btn-secondary-ghost text-xs px-2.5 py-1 min-h-0 flex-1"
            >
              {p.label}
            </button>
          ))}
        </div>

        <div>
          <label className="text-[11px] font-bold text-slate-700 block mb-1">Simulated WhatsApp Message</label>
          <input
            type="text"
            value={naturalMessage}
            onChange={(e) => setNaturalMessage(e.target.value)}
            className="w-full bg-slate-50 border border-slate-300 rounded-xl px-3 py-2 text-xs text-slate-900"
          />
        </div>

        <div>
          <label className="text-[11px] font-bold text-slate-700 block mb-1">Validated LLM JSON Intent</label>
          <textarea
            rows={4}
            value={jsonIntent}
            onChange={(e) => setJsonIntent(e.target.value)}
            className="w-full bg-slate-900 font-mono text-[11px] text-emerald-400 rounded-xl p-2.5 focus:outline-none"
          ></textarea>
        </div>

        {response && (
          <div className={`p-3 rounded-xl border text-xs space-y-1 ${
            response.success ? 'bg-emerald-50 border-emerald-200 text-emerald-900' : 'bg-rose-50 border-rose-200 text-rose-900'
          }`}>
            <div className="font-extrabold">{response.success ? 'Success Response' : 'Validation Error'}</div>
            <p>{response.message}</p>
          </div>
        )}

        <div className="flex gap-2 pt-1">
          <button onClick={onClose} className="btn-secondary-ghost flex-1 py-2.5 text-xs">
            Close
          </button>
          <button
            onClick={handleExecute}
            disabled={loading}
            className="btn-primary-blue flex-2 py-2.5 text-xs font-bold"
          >
            {loading ? 'Processing...' : 'Run Intent Validation →'}
          </button>
        </div>
      </div>
    </div>
  );
}
