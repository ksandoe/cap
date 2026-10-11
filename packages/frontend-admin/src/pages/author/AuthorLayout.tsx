/**
 * AuthorLayout.tsx — Domain expert module wrapper (v3).
 * Routes:
 *   /author/recipes              → modules workspace (drafts + published)
 *   /author/generate             → AI-assisted generation dialog
 *   /author/drafts/:draftId      → authoring wizard (draft resume)
 *   /author/modules/:moduleId    → authoring wizard (maintenance, seeded
 *                                  from the module's active version)
 */
import { Routes, Route } from 'react-router-dom';
import { AppShell }       from '../../components/layout/AppShell';
import { RecipeListPage } from './RecipeListPage';
import { GeneratePage }   from './GeneratePage';
import { AuthoringWizard } from './AuthoringWizard';

export function AuthorLayout() {
  return (
    <AppShell>
      <Routes>
        <Route path="recipes"             element={<RecipeListPage />} />
        <Route path="generate"            element={<GeneratePage />} />
        <Route path="drafts/:draftId"     element={<AuthoringWizard />} />
        <Route path="modules/:moduleId"   element={<AuthoringWizard />} />
        <Route path="*"                   element={<RecipeListPage />} />
      </Routes>
    </AppShell>
  );
}
