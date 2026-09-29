/**
 * EvaluationsPage.tsx — De-identified evaluation browser.
 *
 * Reads the cap-evaluations store: every completed attempt's rubric
 * scores, narrative, and transcript — with no student identifiers
 * (attemptId is the dead session's id). This is the testing view
 * instructors asked for, and the same dataset researchers will see
 * post-IRB. Students never see any of it.
 */
import { useEffect, useState } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { adminApi } from '../../services/api';

const th: React.CSSProperties = { textAlign: 'left', padding: '6px 10px 6px 0', fontSize: 13, color: '#555', borderBottom: '2px solid #dfe7e0' };
const td: React.CSSProperties = { padding: '8px 10px 8px 0', fontSize: 13, borderBottom: '1px solid #eee', verticalAlign: 'top' };

export function EvaluationsPage() {
  const [modules, setModules] = useState<{ moduleId: string; moduleTitle: string }[]>([]);
  const [selected, setSelected] = useState('');
  const [rows, setRows] = useState<any[]>([]);
  const [error, setError] = useState<string | null>(null);

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
    adminApi.evaluations.list(selected)
      .then(({ evaluations }) => setRows(evaluations))
      .catch(e => setError(e.message));
  }, [selected]);

  return (
    <div style={{ maxWidth: 860 }}>
      <h2 style={{ color: '#1e6b34' }}>Evaluation records</h2>
      <p style={{ color: '#666', fontSize: 14, lineHeight: 1.6 }}>
        De-identified attempt records — rubric scores and transcripts with
        no student identifiers. This is the instructor testing view;
        students see only pass/fail.
      </p>

      <select value={selected} onChange={e => setSelected(e.target.value)}
        style={{ padding: '8px 10px', border: '1px solid #ccc', borderRadius: 4, fontSize: 14, marginBottom: 16, width: '100%', maxWidth: 480 }}>
        {modules.map(m => <option key={m.moduleId} value={m.moduleId}>{m.moduleTitle} ({m.moduleId})</option>)}
      </select>

      {error && <p style={{ color: '#a33' }}>{error}</p>}
      {!error && rows.length === 0 && <p style={{ color: '#888' }}>No completed attempts recorded yet.</p>}

      {rows.length > 0 && (
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr>
              <th style={th}>Completed</th><th style={th}>Attempt</th>
              <th style={th}>Overall</th><th style={th}>Verdict</th><th style={th}></th>
            </tr>
          </thead>
          <tbody>
            {rows.map(r => (
              <tr key={r.attemptId}>
                <td style={td}>{new Date(r.completedAt).toLocaleString()}</td>
                <td style={td}>#{r.attemptNumber} · recipe v{r.recipeVersion}</td>
                <td style={{ ...td, fontWeight: 700 }}>{r.overallScore ?? '—'}</td>
                <td style={td}>
                  <span style={{ padding: '2px 8px', borderRadius: 10, fontSize: 12,
                    background: r.badgeAwarded ? '#e6f4ea' : '#fdecea',
                    color: r.badgeAwarded ? '#1e6b34' : '#a33' }}>
                    {r.badgeAwarded ? 'pass' : 'no pass'}
                  </span>
                </td>
                <td style={td}>
                  <Link to={`/instructor/evaluations/${r.attemptId}`}
                    style={{ color: '#1e6b34', fontSize: 13 }}>detail →</Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

export function EvaluationDetailPage() {
  const { attemptId } = useParams();
  const navigate = useNavigate();
  const [rec, setRec] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!attemptId) return;
    adminApi.evaluations.get(attemptId).then(setRec).catch(e => setError(e.message));
  }, [attemptId]);

  if (error) return <p style={{ color: '#a33' }}>{error}</p>;
  if (!rec)   return <p style={{ color: '#888' }}>Loading…</p>;

  const ev = rec.evaluation ?? {};
  const dims = ev.dimensionRatings ?? [];

  return (
    <div style={{ maxWidth: 860 }}>
      <button onClick={() => navigate(-1)}
        style={{ background: 'none', border: 'none', color: '#1e6b34', cursor: 'pointer', fontSize: 14, padding: 0, marginBottom: 12 }}>
        ← all evaluations
      </button>

      <h2 style={{ color: '#1e6b34', marginTop: 0 }}>
        Attempt #{rec.attemptNumber} — {ev.badgeAwarded ? 'pass' : 'no pass'}
      </h2>
      <p style={{ color: '#888', fontSize: 13 }}>
        {rec.moduleId} · recipe v{rec.recipeVersion} · {new Date(rec.completedAt).toLocaleString()}
        {' · '}attempt {rec.attemptId.slice(0, 8)}… (de-identified)
      </p>

      <h3 style={{ marginBottom: 8 }}>Rubric scores — overall {ev.overallScore ?? '—'}/100</h3>
      <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: 24 }}>
        <thead>
          <tr><th style={th}>Dimension</th><th style={th}>Rating</th><th style={th}>Score</th><th style={th}>Narrative</th></tr>
        </thead>
        <tbody>
          {dims.map((d: any, i: number) => (
            <tr key={i}>
              <td style={{ ...td, fontWeight: 600 }}>{d.dimensionName ?? d.dimension ?? d.name ?? `Dimension ${i + 1}`}</td>
              <td style={td}>{d.rating ?? '—'}</td>
              <td style={{ ...td, fontWeight: 700 }}>{d.score ?? '—'}</td>
              <td style={{ ...td, color: '#666' }}>{d.narrative ?? ''}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <h3 style={{ marginBottom: 8 }}>Summary</h3>
      <p style={{ color: '#444', fontSize: 14, lineHeight: 1.6 }}>{ev.overallSummary}</p>
      {(ev.outcomeSummary?.length ?? 0) > 0 && (
        <ul style={{ fontSize: 13, color: '#555' }}>
          {ev.outcomeSummary.map((o: any, i: number) => (
            <li key={i}>{typeof o === 'string' ? o : `${o.outcomeText ?? o.outcome ?? o.name ?? ''}: ${o.status ?? o.rating ?? ''}`}</li>
          ))}
        </ul>
      )}

      <h3 style={{ marginBottom: 8 }}>Transcript</h3>
      <div style={{ border: '1px solid #ddd', borderRadius: 6, padding: 16, background: '#fafafa' }}>
        {(rec.transcript ?? []).map((t: any, i: number) => (
          <div key={i} style={{ marginBottom: 12 }}>
            <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: 1, textTransform: 'uppercase',
                          color: t.role === 'assistant' ? '#1e6b34' : '#555' }}>
              {t.role === 'assistant' ? 'Agent' : 'Student'}
            </div>
            <div style={{ fontSize: 14, color: '#333', lineHeight: 1.55 }}>{t.content}</div>
          </div>
        ))}
        {(!rec.transcript || rec.transcript.length === 0) && (
          <p style={{ color: '#888', fontSize: 13 }}>No transcript recorded.</p>
        )}
      </div>
    </div>
  );
}
