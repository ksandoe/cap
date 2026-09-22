/**
 * RecipeListPage.tsx — Lists all recipe modules with active version info.
 * Each module links to the authoring form (edit creates a new version).
 */
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { adminApi } from '../../services/api';

interface ModuleGroup {
  moduleId:    string;
  moduleTitle: string;
  versions:    number;
  activeVersion: number;
  updatedAt:   string;
}

export function RecipeListPage() {
  const [groups, setGroups] = useState<ModuleGroup[] | null>(null);
  const [error,  setError]  = useState<string | null>(null);

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
  }, []);

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
        <h2 style={{ color: '#1D4E8C', margin: 0 }}>Instructional recipes</h2>
        <Link to="/author/recipes/new"
          style={{ background: '#1D4E8C', color: '#fff', padding: '8px 18px',
            borderRadius: 4, textDecoration: 'none', fontSize: 14 }}>
          + New recipe
        </Link>
      </div>

      {error && <p style={{ color: '#a33' }}>Could not load recipes: {error}</p>}
      {groups === null && !error && <p style={{ color: '#888' }}>Loading…</p>}
      {groups?.length === 0 && (
        <p style={{ color: '#666' }}>No recipes yet — create the first one.</p>
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
          <Link to={`/author/recipes/${encodeURIComponent(g.moduleId)}`}
            style={{ padding: '8px 18px', border: '1px solid #1D4E8C', color: '#1D4E8C',
              borderRadius: 6, textDecoration: 'none', fontSize: 14 }}>
            Edit → new version
          </Link>
        </div>
      ))}
    </div>
  );
}
