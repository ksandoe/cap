/**
 * PlatformPage.tsx — Platform-wide settings (v3.1).
 *
 * Two cards:
 *   1. Master rubric — the evaluation rubric applied to every module.
 *      Editable here because the research team is still finalizing the
 *      wording; edits apply to NEW evaluations/conversations. The code
 *      constant MASTER_RUBRIC remains the fallback.
 *   2. Team passkey — rotate the shared sign-in key (interim auth —
 *      replaced by OTP + per-user roles later). The current key is never
 *      displayed.
 */
import { useEffect, useState } from 'react';
import { adminApi } from '../../services/api';
import { useAuthStore } from '../../store/authStore';
import { input, lbl, smallBtn, move, Move } from '../../components/authoring/editors';

interface PlatformInfo {
  rubric: { name: string; description: string }[];
  rubricCustomized: boolean;
  passkeySet: boolean;
  updatedAt?: string;
  updatedBy?: string;
}

export function PlatformPage() {
  const displayName = useAuthStore(s => s.displayName);
  const [info, setInfo]       = useState<PlatformInfo | null>(null);
  const [loadErr, setLoadErr] = useState<string | null>(null);
  const [rubric, setRubric]   = useState<{ name: string; description: string }[]>([]);
  const [passkey, setPasskey] = useState('');
  const [msg, setMsg]         = useState<{ kind: 'ok' | 'err'; text: string } | null>(null);
  const [busy, setBusy]       = useState(false);

  useEffect(() => { load(); }, []);

  async function load() {
    try {
      const p: PlatformInfo = await adminApi.admin.platform.get();
      setInfo(p);
      setRubric(p.rubric);
      setLoadErr(null);
    } catch (e: any) { setLoadErr(e.message); }
  }

  async function run(fn: () => Promise<any>, okText: string) {
    setBusy(true); setMsg(null);
    try { await fn(); setMsg({ kind: 'ok', text: okText }); await load(); }
    catch (e: any) { setMsg({ kind: 'err', text: e.message }); }
    finally { setBusy(false); }
  }

  const saveRubric  = () => run(() => adminApi.admin.platform.saveRubric(rubric), 'Rubric saved — new conversations and evaluations will use it.');
  const resetRubric = () => run(() => adminApi.admin.platform.resetRubric(), 'Rubric reverted to the built-in master rubric.');
  const savePasskey = () => run(async () => {
    await adminApi.admin.platform.savePasskey(passkey);
    setPasskey('');
  }, 'Passkey updated — the new key is required at next sign-in.');
  const resetPasskey = () => run(() => adminApi.admin.platform.resetPasskey(), 'Passkey reverted to the environment default.');

  if (!info) {
    return loadErr
      ? <p style={{ color: '#a33' }}>Could not load platform settings: {loadErr}</p>
      : <p style={{ color: '#888' }}>Loading…</p>;
  }

  return (
    <div style={{ maxWidth: 760 }}>
      <h2 style={{ color: '#1e6b34' }}>Platform settings</h2>
      {info.updatedAt && (
        <p style={{ fontSize: 12, color: '#999', marginTop: -8 }}>
          Last changed {new Date(info.updatedAt).toLocaleString()}
          {info.updatedBy ? ` by ${info.updatedBy}` : ''}
        </p>
      )}

      {msg && (
        <p style={{ padding: '10px 14px', borderRadius: 6, fontSize: 14, marginBottom: 16,
          background: msg.kind === 'ok' ? '#e6f4ea' : '#fbeaea',
          color: msg.kind === 'ok' ? '#1e6b34' : '#7a1f1f' }}>{msg.text}</p>
      )}

      {/* ── Master rubric ── */}
      <section style={{ border: '1px solid #ddd', borderRadius: 8, padding: 20, marginBottom: 24, background: '#fff' }}>
        <h3 style={{ marginTop: 0, fontSize: 16 }}>Master rubric</h3>
        <p style={{ fontSize: 13, color: '#777' }}>
          Every module's checkout conversation is evaluated against these dimensions —
          keeping them identical is what makes de-identified evaluation records
          comparable across modules for research. Edit sparingly, and expect
          dimension-level comparisons to shift meaning after a change.
          {info.rubricCustomized
            ? ' A custom rubric is currently active.'
            : ' Currently using the built-in rubric.'}
        </p>
        {rubric.map((d, i) => (
          <div key={i} style={{ display: 'flex', gap: 8, marginBottom: 8, alignItems: 'flex-start' }}>
            <input style={{ ...input, flex: 1 }} placeholder="Dimension name" value={d.name}
              onChange={e => setRubric(r => r.map((x, j) => j === i ? { ...x, name: e.target.value } : x))} />
            <input style={{ ...input, flex: 2 }} placeholder="What the evaluator looks for" value={d.description}
              onChange={e => setRubric(r => r.map((x, j) => j === i ? { ...x, description: e.target.value } : x))} />
            <Move first={i === 0} last={i === rubric.length - 1}
              onUp={() => setRubric(r => move(r, i, -1))}
              onDown={() => setRubric(r => move(r, i, 1))}
              onDel={() => setRubric(r => r.filter((_, j) => j !== i))} />
          </div>
        ))}
        <div style={{ display: 'flex', gap: 10, marginTop: 12 }}>
          <button style={smallBtn} disabled={busy}
            onClick={() => setRubric(r => [...r, { name: '', description: '' }])}>+ Add dimension</button>
          <button onClick={saveRubric} disabled={busy}
            style={{ background: '#1e6b34', color: '#fff', border: 'none', borderRadius: 4,
              padding: '8px 18px', fontSize: 13, cursor: 'pointer' }}>Save rubric</button>
          {info.rubricCustomized && (
            <button onClick={resetRubric} disabled={busy}
              style={{ background: '#fff', border: '1px solid #ccc', borderRadius: 4,
                padding: '8px 14px', fontSize: 13, cursor: 'pointer' }}>Revert to built-in</button>
          )}
        </div>
      </section>

      {/* ── Team passkey ── */}
      <section style={{ border: '1px solid #ddd', borderRadius: 8, padding: 20, background: '#fff' }}>
        <h3 style={{ marginTop: 0, fontSize: 16 }}>Team passkey</h3>
        <p style={{ fontSize: 13, color: '#777' }}>
          Interim sign-in for the whole team — replaced by OTP sign-on with
          per-user roles later. The current key is never shown here; set a
          new one to rotate it.{' '}
          {info.passkeySet ? 'A custom passkey is active.' : 'Using the environment default.'}
        </p>
        <label style={lbl}>New passkey (min 8 characters)</label>
        <div style={{ display: 'flex', gap: 10 }}>
          <input style={{ ...input, maxWidth: 320 }} type="password" value={passkey}
            placeholder="New team passkey" onChange={e => setPasskey(e.target.value)} />
          <button onClick={savePasskey} disabled={busy || passkey.trim().length < 8}
            style={{ background: '#1e6b34', color: '#fff', border: 'none', borderRadius: 4,
              padding: '8px 18px', fontSize: 13, cursor: 'pointer',
              opacity: passkey.trim().length < 8 ? 0.5 : 1 }}>Update passkey</button>
          {info.passkeySet && (
            <button onClick={resetPasskey} disabled={busy}
              style={{ background: '#fff', border: '1px solid #ccc', borderRadius: 4,
                padding: '8px 14px', fontSize: 13, cursor: 'pointer' }}>Use env default</button>
          )}
        </div>
        {displayName && (
          <p style={{ fontSize: 12, color: '#999', marginTop: 10, marginBottom: 0 }}>
            Signed in as {displayName} — you'll need the new key next time you sign in.
          </p>
        )}
      </section>
    </div>
  );
}
