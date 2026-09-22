/**
 * RecipeListPage.tsx
 * Lists all modules the author has recipes for.
 * TODO: implement — fetch from GET /recipe/list
 */
import { Link } from 'react-router-dom';

export function RecipeListPage() {
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
      <p style={{ color: '#888' }}>TODO: load and display recipe list from Aurora.</p>
    </div>
  );
}
