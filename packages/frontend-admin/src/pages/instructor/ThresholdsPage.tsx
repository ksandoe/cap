/**
 * ThresholdsPage.tsx — Passing-threshold tuning per module.
 *
 * The evaluation produces a 0-100 score per rubric dimension plus an
 * overall score. Students see only pass/fail; instructors tune the bar here:
 *
 *   pass  ⇔  overallScore ≥ overallMin  AND  every dimension ≥ dimensionFloor
 *
 * Saved thresholds apply to NEW evaluations; they don't change records
 * already stored in the de-identified eval table (which keeps the raw
 * scores, so thresholds can be re-tuned against history).
 */
import { useEffect, useState } from 'react';
import { adminApi } from '../../services/api';

const input: React.CSSProperties = { padding: '8px 10px', border: '1px solid #ccc', borderRadius: 4, fontSize: 14, width: 90 };
const lbl: React.CSSProperties   = { fontWeight: 600, fontSize: 13, color: '#333', display: 'block', marginBottom: 4 };

export function ThresholdsPage() {
  const [modules, setModules]   = useState<{ moduleId: string; moduleTitle: string }[]>([]);
  const [selected, setSelected] = useState<string>('');
  const [overallMin, setOverallMin]         = useState(60);
  const [dimensionFloor, setDimensionFloor] = useState(40);
  const [defaults, setDefaults] = useState({ overallMin: 60, dimensionFloor: 40 });
  const [saving, setSaving]     = useState(false);
  const [saved,  setSaved]      = useState(false);
  const [error,  setError]      = useState<string | null>(null);

  useEffect(() => {
    adminApi.recipe.list().then(({ recipes }) => {
      const seen = new Map<string, string>();
      for (const r of recipes) if (r.isActive && !seen.has(r.moduleId)) seen.set(r.moduleId, r.moduleTitle);
      const mods = [...seen.entries()].map(([moduleId, moduleTitle]) => ({ moduleId, moduleTitle }));
      setModules(mods);
      if (mods.length) setSelected(mods[0].moduleId);
    }).catch(e => setError(e.message));
  }, []);

  useEffect(() => {
    if (!selected) return;
    setSaved(false);
    adminApi.admin.moduleConfig.get(selected).then(({ config, defaults }) => {
      setOverallMin(config.overallMin);
      setDimensionFloor(config.dimensionFloor);
      if (defaults) setDefaults(defaults);
    }).catch(e => setError(e.message));
  }, [selected]);

  async function save() {
    if (!selected) return;
    setSaving(true); setError(null); setSaved(false);
    try {
      await adminApi.admin.moduleConfig.save({ moduleId: selected, overallMin, dimensionFloor });
      setSaved(true);
    } catch (e: any) { setError(e.message); }
    finally { setSaving(false); }
  }

  return (
    <div style={{ maxWidth: 640 }}>
      <h2 style={{ color: '#1e6b34' }}>Passing thresholds</h2>
      <p style={{ color: '#666', fontSize: 14, lineHeight: 1.6 }}>
        The evaluation scores each rubric dimension 0–100 plus an overall
        score. Students see only pass/fail — these thresholds decide which.
        A student passes when the <strong>overall score</strong> meets the
        minimum <em>and</em> no single dimension falls below the floor.
      </p>

      <label style={lbl}>Module</label>
      <select style={{ ...input, width: '100%', marginBottom: 20 }}
        value={selected} onChange={e => setSelected(e.target.value)}>
        {modules.map(m => <option key={m.moduleId} value={m.moduleId}>{m.moduleTitle} ({m.moduleId})</option>)}
      </select>

      <div style={{ display: 'flex', gap: 24, marginBottom: 20 }}>
        <div>
          <label style={lbl}>Overall minimum</label>
          <input type="number" min={0} max={100} style={input} value={overallMin}
            onChange={e => setOverallMin(parseInt(e.target.value) || 0)} />
          <div style={{ fontSize: 12, color: '#888', marginTop: 4 }}>default {defaults.overallMin}</div>
        </div>
        <div>
          <label style={lbl}>Per-dimension floor</label>
          <input type="number" min={0} max={100} style={input} value={dimensionFloor}
            onChange={e => setDimensionFloor(parseInt(e.target.value) || 0)} />
          <div style={{ fontSize: 12, color: '#888', marginTop: 4 }}>default {defaults.dimensionFloor}</div>
        </div>
      </div>

      <p style={{ fontSize: 13, color: '#555', background: '#f4faf6',
        border: '1px solid #dfe7e0', borderRadius: 6, padding: '10px 14px' }}>
        Current rule: pass ⇔ overall ≥ <strong>{overallMin}</strong> and every
        dimension ≥ <strong>{dimensionFloor}</strong>.
      </p>

      {error  && <p style={{ color: '#a33' }}>{error}</p>}
      {saved  && <p style={{ color: '#1e6b34' }}>Saved — applies to the next evaluation.</p>}

      <button onClick={save} disabled={saving || !selected}
        style={{ background: '#1e6b34', color: '#fff', border: 'none',
          borderRadius: 4, padding: '10px 24px', fontSize: 14, cursor: 'pointer' }}>
        {saving ? 'Saving…' : 'Save thresholds'}
      </button>
    </div>
  );
}
