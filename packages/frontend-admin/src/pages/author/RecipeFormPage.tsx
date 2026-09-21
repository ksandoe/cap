/**
 * RecipeFormPage.tsx
 *
 * The core authoring form. Sections (each a collapsible panel):
 *   1. Module identity      — title, description, module ID
 *   2. Learning outcomes    — numbered list
 *   3. Key concepts         — term + definition pairs
 *   4. Content blocks       — ordered sequence of conceptual / instructional / SAP blocks
 *                             with gate flags and concurrent pair groupings
 *   5. Instructional recipe — rubric dimensions, probing rules, vague answer triggers,
 *                             career transfer prompts, tone guidance, max turns
 *   6. Background docs      — file upload, pasted text, external URLs
 *   7. Content stub         — summary text, resource links
 *
 * Each content block of type 'instructional' has a nested step editor
 * (numbered steps with description, outcome tag(s), understanding note).
 *
 * TODO: implement each section — stubs provided for structure.
 */
import { useParams } from 'react-router-dom';

export function RecipeFormPage() {
  const { id } = useParams();
  const isNew  = !id;

  return (
    <div style={{ maxWidth: 760 }}>
      <h2 style={{ color: '#1D4E8C', marginBottom: 4 }}>
        {isNew ? 'New recipe' : `Edit recipe — ${id}`}
      </h2>
      <p style={{ color: '#888', marginBottom: 32, fontSize: 14 }}>
        Complete all required sections. Sections marked ★ are required.
      </p>

      {[
        { label: '★ 1. Module identity',      stub: 'module_title, module_description, module_id' },
        { label: '★ 2. Learning outcomes',    stub: 'Numbered list — minimum 2, maximum 8.' },
        { label: '★ 3. Key concepts',         stub: 'Term + definition pairs.' },
        { label: '★ 4. Content blocks',       stub: 'Ordered sequence of conceptual, instructional, and SAP blocks. Gate flags. Concurrent pair groupings. Nested step editor for instructional blocks.' },
        { label: '★ 5. Instructional recipe', stub: 'Rubric dimensions, probing rules, vague answer triggers, career transfer prompts, tone guidance, max turns.' },
        { label: '6. Background documentation', stub: 'PDF/DOCX upload (S3), pasted text, external URLs.' },
        { label: '7. Content stub',           stub: 'Summary text (100–300 words), resource links.' },
      ].map(sec => (
        <div key={sec.label} style={{ border: '1px solid #ddd', borderRadius: 6,
          marginBottom: 16, overflow: 'hidden' }}>
          <div style={{ background: '#EEF3FA', padding: '12px 16px',
            fontWeight: 600, fontSize: 14, color: '#1D4E8C' }}>
            {sec.label}
          </div>
          <div style={{ padding: '16px', color: '#aaa', fontSize: 13 }}>
            TODO: {sec.stub}
          </div>
        </div>
      ))}

      <div style={{ display: 'flex', gap: 12, marginTop: 24 }}>
        <button style={{ background: '#1D4E8C', color: '#fff', border: 'none',
          borderRadius: 4, padding: '10px 24px', fontSize: 14, cursor: 'pointer' }}>
          Save recipe
        </button>
        <button style={{ background: '#E6F4F1', color: '#085041', border: 'none',
          borderRadius: 4, padding: '10px 24px', fontSize: 14, cursor: 'pointer' }}>
          Preview check-in questions
        </button>
      </div>
    </div>
  );
}
