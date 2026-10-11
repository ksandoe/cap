/**
 * GeneratePage.tsx — AI-assisted recipe generation dialog (v3).
 *
 * Flow: Materials → a few clarifying questions → Generate.
 *
 *   Materials — Word/PDF/text files are uploaded as base64 and extracted
 *     server-side (extract-text); pasted text works the same way. Sources
 *     persist on the draft so an author can add more and regenerate later
 *     (Joni: authoring happens across sessions).
 *   Questions — fixed prompts about audience + focus; all optional.
 *   Generate  — POST /admin/authoring/generate drafts the recipe-side
 *     fields (description, outcomes, concepts, probing rules, vague-answer
 *     triggers, tone) and merges them into a server-side draft, then
 *     routes into the authoring wizard. Activity steps are always
 *     author-built — the AI does not invent procedures.
 *
 *   ?draft=<id> resumes onto an existing draft (re-generation).
 */
import { useEffect, useRef, useState } from 'react';
import { useNavigate, useSearchParams, Link } from 'react-router-dom';
import { adminApi } from '../../services/api';
import { useAuthStore } from '../../store/authStore';
import { input, lbl, smallBtn } from '../../components/authoring/editors';
import type { SourceMaterial, RecipeDraft } from '@cap/shared';

const QUESTIONS = [
  { key: 'audience',   q: 'Who are the students? (course, level, how much they already know)' },
  { key: 'activity',   q: 'What will students actually DO in the activity? (one or two sentences)' },
  { key: 'focus',      q: 'What should the debrief conversation focus on — the ideas that matter most?' },
  { key: 'misconceptions', q: 'Where do students usually get stuck or misunderstand?' },
];

const ACCEPT = '.pdf,.docx,.txt,.md';

export function GeneratePage() {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const draftIdParam = params.get('draft');
  const displayName = useAuthStore(s => s.displayName);

  const [draftId, setDraftId]   = useState<string | null>(draftIdParam);
  const [materials, setMaterials] = useState<SourceMaterial[]>([]);
  const [pasted, setPasted]     = useState('');
  const [answers, setAnswers]   = useState<Record<string, string>>({});
  const [guidance, setGuidance] = useState('');
  const [step, setStep]         = useState<1 | 2>(1);
  const [busy, setBusy]         = useState<string | null>(null);
  const [error, setError]       = useState<string | null>(null);
  const [generated, setGenerated] = useState<any | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  // Resuming a draft — preload its materials and answers.
  useEffect(() => {
    if (!draftIdParam) return;
    adminApi.authoring.getDraft(draftIdParam).then(({ draft }) => {
      setMaterials(draft.sourceMaterials ?? []);
      setAnswers(draft.contextAnswers ?? {});
    }).catch(() => {});
  }, [draftIdParam]);

  const totalChars = materials.reduce((a, m) => a + m.text.length, 0) + pasted.length;

  function readFile(file: File): Promise<string> {
    return new Promise((res, rej) => {
      const r = new FileReader();
      r.onload = () => res((r.result as string).split(',')[1] ?? '');
      r.onerror = () => rej(new Error(`Could not read ${file.name}.`));
      r.readAsDataURL(file);
    });
  }

  async function addFiles(files: FileList | null) {
    if (!files?.length) return;
    setError(null);
    for (const file of Array.from(files)) {
      if (materials.length >= 8) { setError('At most 8 source materials.'); break; }
      setBusy(`Reading ${file.name}…`);
      try {
        const ext = file.name.toLowerCase().split('.').pop() ?? '';
        if (ext === 'txt' || ext === 'md') {
          // plain text — decode client-side, skip the round trip
          const text = await file.text();
          setMaterials(m => [...m, { label: file.name, text }]);
        } else {
          const data = await readFile(file);
          const r = await adminApi.authoring.extractText({ filename: file.name, data });
          setMaterials(m => [...m, { label: file.name, text: r.text }]);
        }
      } catch (e: any) {
        setError(`${file.name}: ${e.message}`);
      }
    }
    setBusy(null);
    if (fileRef.current) fileRef.current.value = '';
  }

  function addPasted() {
    if (!pasted.trim()) return;
    setMaterials(m => [...m, { label: `Pasted text ${m.filter(x => x.label.startsWith('Pasted')).length + 1}`, text: pasted.trim() }]);
    setPasted('');
  }

  async function ensureDraft(): Promise<RecipeDraft> {
    if (draftId) {
      const { draft } = await adminApi.authoring.updateDraft(draftId, {
        sourceMaterials: materials, contextAnswers: answers,
      });
      return draft;
    }
    const { draft } = await adminApi.authoring.createDraft({
      title: 'Untitled draft', owner: displayName ?? undefined,
      sourceMaterials: materials, contextAnswers: answers,
    });
    setDraftId(draft.draftId);
    return draft;
  }

  async function generate() {
    setBusy('Generating your recipe draft…'); setError(null);
    try {
      const draft = await ensureDraft();
      const r = await adminApi.authoring.generate({
        materials, answers, guidance, draftId: draft.draftId,
      });
      setGenerated(r.generated);
      setTimeout(() => navigate(`/author/drafts/${draft.draftId}`), 600);
    } catch (e: any) {
      setError(e.message);
      setBusy(null);
    }
  }

  return (
    <div style={{ maxWidth: 760 }}>
      <h2 style={{ color: '#1e6b34', marginBottom: 4 }}>New module — AI-assisted</h2>
      <p style={{ color: '#888', fontSize: 14, marginBottom: 20 }}>
        Share your source materials and the assistant drafts the module's
        description, learning outcomes, key concepts, and conversation
        behavior. You review everything before publishing — and you always
        build the activity steps yourself. <Link to="/author/recipes" style={{ color: '#1e6b34' }}>← Back to modules</Link>
      </p>

      {/* ── step indicator ── */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 20, fontSize: 13 }}>
        {['1 · Your materials', '2 · A few questions', '3 · Generate'].map((s, i) => (
          <span key={s} style={{
            padding: '4px 12px', borderRadius: 12,
            background: step > i || (step === 2 && i === 2) ? '#E9F5EC' : '#f0f0ee',
            color: step > i ? '#1e6b34' : '#777', fontWeight: step - 1 === i ? 700 : 400,
          }}>{s}</span>
        ))}
      </div>

      {step === 1 && (
        <div>
          <label style={lbl}>Upload assignment sheets, slide decks, instructions — PDF, Word (.docx), or text</label>
          <div style={{ border: '1px dashed #b9cbb9', borderRadius: 6, padding: 18,
            textAlign: 'center', background: '#fbfdfb', marginBottom: 14 }}>
            <input ref={fileRef} type="file" accept={ACCEPT} multiple
              onChange={e => addFiles(e.target.files)} style={{ display: 'none' }} />
            <button type="button" style={{ ...smallBtn, padding: '8px 20px', fontSize: 14 }}
              onClick={() => fileRef.current?.click()}>
              Choose files
            </button>
            <div style={{ fontSize: 12, color: '#999', marginTop: 6 }}>
              Up to 8 files · text is extracted on the server · {totalChars.toLocaleString()} chars so far
            </div>
          </div>

          {materials.map((m, i) => (
            <details key={i} style={{ border: '1px solid #ddd', borderRadius: 6, marginBottom: 8, background: '#fff' }}>
              <summary style={{ padding: '8px 12px', cursor: 'pointer', fontSize: 13, display: 'flex', justifyContent: 'space-between' }}>
                <span>{m.label} <span style={{ color: '#999' }}>({m.text.length.toLocaleString()} chars)</span></span>
                <button type="button" style={{ ...smallBtn, color: '#a33' }}
                  onClick={e => { e.preventDefault(); setMaterials(ms => ms.filter((_, j) => j !== i)); }}>remove</button>
              </summary>
              <div style={{ padding: '0 12px 10px', fontSize: 12, color: '#666', whiteSpace: 'pre-wrap',
                maxHeight: 120, overflow: 'auto' }}>{m.text.slice(0, 2000)}</div>
            </details>
          ))}

          <label style={{ ...lbl, marginTop: 14 }}>Or paste text</label>
          <textarea style={{ ...input, minHeight: 90 }} value={pasted}
            placeholder="Paste instructions, an assignment sheet, notes…"
            onChange={e => setPasted(e.target.value)} />
          <div style={{ marginTop: 8 }}>
            <button type="button" style={smallBtn} onClick={addPasted} disabled={!pasted.trim()}>+ Add pasted text</button>
          </div>

          {error && <p style={{ color: '#a33', marginTop: 12 }}>{error}</p>}
          {busy && <p style={{ color: '#888', marginTop: 12 }}>{busy}</p>}

          <div style={{ marginTop: 20, display: 'flex', gap: 12 }}>
            <button type="button" onClick={() => setStep(2)} disabled={!!busy}
              style={{ background: '#1e6b34', color: '#fff', border: 'none', borderRadius: 4,
                padding: '10px 24px', fontSize: 14, cursor: 'pointer' }}>
              Continue →
            </button>
            <span style={{ fontSize: 12, color: '#999', alignSelf: 'center' }}>
              {materials.length === 0 ? 'You can also continue with no materials — the draft will be generic.' : `${materials.length} source${materials.length === 1 ? '' : 's'} added`}
            </span>
          </div>
        </div>
      )}

      {step === 2 && (
        <div>
          <p style={{ fontSize: 13, color: '#777', marginTop: 0 }}>
            A few questions to focus the draft — all optional, skip what the
            materials already answer.
          </p>
          {QUESTIONS.map(({ key, q }) => (
            <div key={key} style={{ marginBottom: 14 }}>
              <label style={lbl}>{q}</label>
              <textarea style={{ ...input, minHeight: 44 }} value={answers[key] ?? ''}
                onChange={e => setAnswers(a => ({ ...a, [key]: e.target.value }))} />
            </div>
          ))}
          <label style={lbl}>Anything else the assistant should know? (optional)</label>
          <textarea style={{ ...input, minHeight: 50 }} value={guidance}
            placeholder="e.g. Keep outcomes at an introductory level; students will not have seen an ERP before."
            onChange={e => setGuidance(e.target.value)} />

          {error && <p style={{ color: '#a33', marginTop: 12 }}>{error}</p>}
          {generated && (
            <div style={{ background: '#e6f4ea', border: '1px solid #c2e2cb', color: '#1e6b34',
              padding: '10px 14px', borderRadius: 6, marginTop: 12, fontSize: 14 }}>
              Draft generated — opening the authoring wizard…
            </div>
          )}

          <div style={{ marginTop: 20, display: 'flex', gap: 12 }}>
            <button type="button" style={smallBtn} onClick={() => setStep(1)} disabled={!!busy}>← Materials</button>
            <button type="button" onClick={generate} disabled={!!busy}
              style={{ background: '#1e6b34', color: '#fff', border: 'none', borderRadius: 4,
                padding: '10px 24px', fontSize: 14,
                cursor: busy ? 'not-allowed' : 'pointer', opacity: busy ? 0.6 : 1 }}>
              {busy ?? 'Draft my recipe ✦'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
