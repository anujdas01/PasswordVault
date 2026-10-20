import React, { useState, useCallback } from 'react';
import { get, post } from '../api/client.js';
import { useToast } from '../context/ToastContext.jsx';

export default function GeneratorPage() {
  const toast = useToast();
  const [length, setLength] = useState(20);
  const [opts, setOpts] = useState({
    use_lower: true,
    use_upper: true,
    use_digits: true,
    use_symbols: true,
    exclude_ambiguous: false,
  });
  const [count, setCount] = useState(3);
  const [results, setResults] = useState([]);
  const [busy, setBusy] = useState(false);

  const generate = useCallback(
    async (e) => {
      if (e) e.preventDefault();
      setBusy(true);
      try {
        const r = await post('/generate', { length, count, ...opts });
        setResults(r.results);
      } catch (err) {
        toast.error(err.message);
      } finally {
        setBusy(false);
      }
    },
    [length, count, opts, toast]
  );

  const toggle = (key) => setOpts((o) => ({ ...o, [key]: !o[key] }));

  const copy = async (text) => {
    try {
      await navigator.clipboard.writeText(text);
      toast.success('Copied');
    } catch {
      toast.error('Copy failed');
    }
  };

  const colors = ['#888', '#d64545', '#e0a63c', '#5a9be0', '#2e9e5b'];

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-semibold">Password Generator</h1>
      <form onSubmit={generate} className="card max-w-xl space-y-4">
        <div>
          <label className="mb-1 block text-sm text-muted">
            Length: <span className="text-text font-semibold">{length}</span>
          </label>
          <input
            type="range"
            min={4}
            max={128}
            value={length}
            onChange={(e) => setLength(Number(e.target.value))}
            className="w-full accent-primary"
          />
        </div>
        <div className="grid grid-cols-2 gap-2 text-sm">
          {[
            ['use_lower', 'Lowercase (a-z)'],
            ['use_upper', 'Uppercase (A-Z)'],
            ['use_digits', 'Digits (0-9)'],
            ['use_symbols', 'Symbols (!@#…)'],
            ['exclude_ambiguous', 'Exclude ambiguous (Il1O0)'],
          ].map(([key, label]) => (
            <label key={key} className="flex items-center gap-2">
              <input type="checkbox" checked={opts[key]} onChange={() => toggle(key)} className="accent-primary" />
              {label}
            </label>
          ))}
        </div>
        <div className="flex items-end gap-3">
          <div>
            <label className="mb-1 block text-sm text-muted">Count (1-10)</label>
            <input
              type="number"
              min={1}
              max={10}
              value={count}
              onChange={(e) => setCount(Math.max(1, Math.min(10, Number(e.target.value) || 1)))}
              className="input w-24"
            />
          </div>
          <button type="submit" className="btn-primary ml-auto" disabled={busy}>
            Generate
          </button>
        </div>
      </form>

      <div className="space-y-2">
        {results.map((r, i) => (
          <div key={i} className="card flex items-center gap-3">
            <div className="flex-1 font-mono break-all">{r.password}</div>
            <div className="w-24 text-right text-xs" style={{ color: colors[r.rating] }}>
              {r.strength}
              <div className="text-muted">{r.entropy} bits</div>
            </div>
            <button onClick={() => copy(r.password)} className="btn-secondary px-2 py-1 text-xs">
              Copy
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}
