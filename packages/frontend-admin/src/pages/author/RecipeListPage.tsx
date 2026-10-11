/**
 * RecipeListPage.tsx — Modules workspace (v3).
 *
 * Two zones:
 *   1. Drafts in progress — server-side drafts with per-section progress;
 *      authors resume across sessions (Joni's feedback).
 *   2. Published modules — the active recipe version per module; Maintain
 *      opens the wizard seeded from that version.
 *
 * "New module" offers two starts: AI-assisted (the generation dialog) or
 * a blank draft straight into the wizard.
 */
import { useEffect, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { adminApi } from '../../services/api';
import { useAuthStore } from '../../store/authStore';
import { AUTHORING_SECTIONS } from '@cap/shared';
import type { RecipeDraft } from '@cap/shared';

interface ModuleGroup {
  moduleId:    string;
  moduleTitle: string;
  versions:    number;
  activeVersion: number;
  updatedAt:   string;
}

export function RecipeListPage() {
  const [groups, setGroups]   = useState<ModuleGroup[] | null>(null);
  const [drafts, setDrafts]   = useState<RecipeDraft[] | null>(null);
  const [error,  setError]    = useState<string | null>(null);
  const location  = useLocation();
  const navigate  = useNavigate();
  const displayName = useAuthStore(s => s.displayName);
  const published = (location.state as any)?.published as string | undefined;

  useEffect(() => {
    adminApi.recipe.list()
      .then(({ recipes }) => {
        const byModule = new Map<string, any[]>();
        for (const r of recipes) {
          const arr = byModule.get(r.moduleId) ?? [];
          arr.push(r);
          byModule.set(r.moduleId, arr);
        }
        setGroups([...byModule.entries()].map(([moduleId, rs]) => {
          const active = rs.find(r => r.isActive) ?? rs[0];
          return {
            moduleId,
            moduleTitle:   active.moduleTitle,
            versions:      rs.length,
            activeVersion: active.version,
            updatedAt:     active.updatedAt,
          };
        }));
      })
      .catch(e => setError(e.message));

    adminApi.authoring.listDrafts()
      .then(({ drafts }) => setDrafts(drafts))
      .catch(() => setDrafts([]));
  }, []);

  async function newBlankDraft() {
    try {
      const { draft } = await adminApi.authoring.createDraft({
        title: 'Untitled draft', owner: displayName ?? undefined,
      });
      navigate(`/author/drafts/${draft.draftId}`);
    } catch (e: any) { setError(e.message); }
  }

  async function discardDraft(id: string) {
    try {
      await adminApi.authoring.deleteDraft(id);
      setDrafts(ds => (ds ?? []).filter(d => d.draftId !== id));
    } catch (e: any) { setError(e.message); }
  }

  const sectionCount = (d: RecipeDraft) =>
    AUTHORING_SECTIONS.filter(s => d.sections?.[s.id] === 'done').length;

  return (
    <div style={{ maxWidth: 860 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
        <h2 style={{ color: '#1e6b34', margin: 0 }}>Modules</h2>
        <div style={{ display: 'flex', gap: 10 }}>
          <Link to="/author/generate"
            style={{ background: '#1e6b34', color: '#fff', padding: '8px 18px',
              borderRadius: 4, textDecoration: 'none', fontSize: 14 }}>
            ✦ New module — AI-assisted
          </Link>
          <button onClick={newBlankDraft}
            style={{ background: '#fff', color: '#1e6b34', border: '1px solid #1e6b34',
              padding: '8px 18px', borderRadius: 4, fontSize: 14, cursor: 'pointer' }}>
            New blank module
          </button>
        </div>
      </div>

      {published && (
        <div style={{ background: '#e6f4ea', border: '1px solid #c2e2cb', color: '#1e6b34',
          padding: '12px 16px', borderRadius: 6, marginBottom: 16 }}>
          Published <strong>{published}</strong> — new student sessions will use this version.
        </div>
      )}
      {error && <p style={{ color: '#a33' }}>Could not load: {error}</p>}

      {/* ── drafts in progress ── */}
      <h3 style={{ color: '#444', fontSize: 15, marginBottom: 10 }}>Drafts in progress</h3>
      {drafts === null && <p style={{ color: '#888', fontSize: 13 }}>Loading drafts…</p>}
      {drafts?.length === 0 && (
        <p style={{ color: '#999', fontSize: 13, marginBottom: 20 }}>
          No drafts — start one with AI assistance or a blank module.
        </p>
      )}
      {(drafts ?? []).map(d => (
        <div key={d.draftId} style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '12px 18px', border: '1px solid #e0d9b8', borderRadius: 8,
          marginBottom: 10, background: '#fffdf4',
        }}>
          <div>
            <div style={{ fontWeight: 600 }}>{d.title || 'Untitled draft'}</div>
            <div style={{ fontSize: 12, color: '#777' }}>
              {sectionCount(d)}/{AUTHORING_SECTIONS.length} sections complete
              {d.moduleId ? ` · ${d.moduleId}` : ''}
              {d.owner ? ` · ${d.owner}` : ''}
              {' · updated '}{new Date(d.updatedAt).toLocaleString()}
            </div>
          </div>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <Link to={`/author/drafts/${d.draftId}`}
              style={{ padding: '7px 16px', border: '1px solid #1e6b34', color: '#1e6b34',
                borderRadius: 6, textDecoration: 'none', fontSize: 13 }}>
              Continue →
            </Link>
            <button onClick={() => discardDraft(d.draftId)}
              style={{ padding: '7px 10px', border: '1px solid #ddd', color: '#a33',
                borderRadius: 6, background: '#fff', fontSize: 13, cursor: 'pointer' }}>
              Discard
            </button>
          </div>
        </div>
      ))}

      {/* ── published modules ── */}
      <h3 style={{ color: '#444', fontSize: 15, margin: '28px 0 10px' }}>Published modules</h3>
      {groups === null && !error && <p style={{ color: '#888', fontSize: 13 }}>Loading…</p>}
      {groups?.length === 0 && (
        <p style={{ color: '#666', fontSize: 13 }}>No published modules yet.</p>
      )}
      {(groups ?? []).map(g => (
        <div key={g.moduleId} style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '14px 18px', border: '1px solid #ddd', borderRadius: 8,
          marginBottom: 10, background: '#fff',
        }}>
          <div>
            <div style={{ fontWeight: 600 }}>{g.moduleTitle}</div>
            <div style={{ fontSize: 13, color: '#777' }}>
              <code>{g.moduleId}</code> · v{g.activeVersion} active · {g.versions} version{g.versions === 1 ? '' : 's'} ·
              updated {new Date(g.updatedAt).toLocaleString()}
            </div>
          </div>
          <Link to={`/author/modules/${encodeURIComponent(g.moduleId)}`}
            style={{ padding: '8px 18px', border: '1px solid #1e6b34', color: '#1e6b34',
              borderRadius: 6, textDecoration: 'none', fontSize: 14 }}>
            Maintain →
          </Link>
        </div>
      ))}
    </div>
  );
}
