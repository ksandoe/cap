/**
 * AuthorLayout.tsx — Domain expert module wrapper.
 * Routes:
 *   /author/recipes           → recipe list
 *   /author/recipes/new       → new recipe form
 *   /author/recipes/:id       → edit existing recipe
 */
import { Routes, Route } from 'react-router-dom';
import { AppShell }       from '../../components/layout/AppShell';
import { RecipeListPage } from './RecipeListPage';
import { RecipeFormPage } from './RecipeFormPage';

export function AuthorLayout() {
  return (
    <AppShell>
      <Routes>
        <Route path="recipes"         element={<RecipeListPage />} />
        <Route path="recipes/new"     element={<RecipeFormPage />} />
        <Route path="recipes/:id"     element={<RecipeFormPage />} />
        <Route path="*"               element={<RecipeListPage />} />
      </Routes>
    </AppShell>
  );
}
