/**
 * AuthoringWizard.tsx — v3 guided authoring wizard.
 *
 * Replaces the single long recipe form. Loads a server-side draft and
 * renders one section at a time with a progress rail — drafts persist
 * across sessions so authors can stop and resume (interview feedback:
 * authoring is too much for one sitting).
 *
 * Routes in:
 *   /author/drafts/:draftId   — a working draft (new or AI-generated)
 *   /author/modules/:moduleId — maintenance: finds/creates a draft seeded
 *                               from the module's active recipe version
 *
 * Autosave: debounced PUT of {title, moduleId, sections, data} whenever
 * the draft changes. Publish validates then creates a new recipe version.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import type { ComponentType, CSSProperties } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import { adminApi } from '../../services/api';
import { useAuthStore } from '../../store/authStore';
import {
  BasicsSection, OutcomesSection, ConceptsSection,
  ActivitySection, ConversationSection, completeness,
  type SectionProps,
} from './sections';
import { prepareImage, input } from '../../components/authoring/editors';
import type {
  RecipeDraft, AuthoringSectionId, SectionStatus, Recipe, AuthoringTrack,
} from '@cap/shared';
import { AUTHORING_SECTIONS, AUTHORING_TRACK_LABELS, AUTHORING_TRACK_BLURBS } from '@cap/shared';

const SECTION_BODIES: Record<AuthoringSectionId, ComponentType<SectionProps>> = {
  basics:       BasicsSection,
  outcomes:     OutcomesSection,
  concepts:     ConceptsSection,
  activity:     ActivitySection,
  conversation: ConversationSection,
};

/** Seed a maintenance draft from a module's active recipe. */
function draftFromRecipe(r: any): Partial<RecipeDraft> {
  return {
    title: r.moduleTitle, moduleId: r.moduleId, fromVersion: r.version,
    data: {
      recipeId: r.recipeId, moduleId: r.moduleId,
      moduleTitle: r.moduleTitle, moduleDescription: r.moduleDescription,
      learningOutcomes: r.learningOutcomes ?? [],
      keyConcepts: r.keyConcepts ?? [], parameters: r.parameters ?? [],
      steps: r.steps ?? [], probingRules: r.probingRules ?? [],
      vagueAnswerTriggers: r.vagueAnswerTriggers ?? [],
      toneGuidance: r.toneGuidance, backgroundDocs: r.backgroundDocs,
    },
    sections: { basics: 'done', outcomes: 'done', concepts: 'done', activity: 'done', conversation: 'done' },
  };
}

const STATUS_ICON: Record<SectionStatus, string> = { done: '●', in_progress: '◐', todo: '○' };
const STATUS_COLOR: Record<SectionStatus, string> = { done: '#1e6b34', in_progress: '#8a6d00', todo: '#aaa' };

export function AuthoringWizard() {
  const { draftId, moduleId } = useParams();
  const navigate  = useNavigate();
  const displayName = useAuthStore(s => s.displayName);

  const [draft, setDraft] = useState<RecipeDraft | null>(null);
  const [loadErr, setLoadErr] = useState<string | null>(null);
  const [current, setCurrent] = useState<AuthoringSectionId | 'review'>('basics');
  const [saveState, setSaveState] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
  const [publishing, setPublishing] = useState(false);
  const [publishErrs, setPublishErrs] = useState<string[]>([]);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const dirtyRef  = useRef(false);

  // ── load ──────────────────────────────────────────────────────────────────
  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        if (draftId) {
          const { draft } = await adminApi.authoring.getDraft(draftId);
          if (!cancelled) setDraft(draft);
          return;
        }
        if (moduleId) {
          // Maintenance: reuse an existing draft for this module if one is
          // open, else seed one from the active recipe version.
          const { drafts } = await adminApi.authoring.listDrafts();
          const existing = drafts.find(d => d.moduleId === moduleId);
          if (existing) {
            if (!cancelled) navigate(`/author/drafts/${existing.draftId}`, { replace: true });
            return;
          }
          const recipe = await adminApi.recipe.get(moduleId);
          const seeded = draftFromRecipe(recipe);
          const { draft } = await adminApi.authoring.createDraft({
            ...seeded, owner: displayName ?? undefined,
          });
          if (!cancelled) navigate(`/author/drafts/${draft.draftId}`, { replace: true });
          return;
        }
        setLoadErr('No draft or module specified.');
      } catch (e: any) {
        if (!cancelled) setLoadErr(e.message);
      }
    }
    load();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [draftId, moduleId]);

  // ── autosave (debounced) ──────────────────────────────────────────────────
  const persist = useCallback((d: RecipeDraft) => {
    if (saveTimer.current) clearTimeout(saveTimer.current);
    dirtyRef.current = true;
    saveTimer.current = setTimeout(async () => {
      setSaveState('saving');
      try {
        await adminApi.authoring.updateDraft(d.draftId, {
          title: d.title, owner: d.owner, moduleId: d.moduleId,
          sections: d.sections, data: d.data,
          sourceMaterials: d.sourceMaterials, aiFields: d.aiFields,
        });
        dirtyRef.current = false;
        setSaveState('saved');
      } catch { setSaveState('error'); }
    }, 800);
  }, []);

  const update = useCallback((fn: (d: RecipeDraft) => RecipeDraft) => {
    setDraft(prev => {
      if (!prev) return prev;
      const next = fn(prev);
      persist(next);
      return next;
    });
  }, [persist]);

  /** Merge recipe-field edits; mark the current section in-progress. */
  const setData = useCallback((patch: Partial<Recipe>) => {
    update(d => ({
      ...d,
      data: { ...d.data, ...patch },
      moduleId: patch.moduleId !== undefined ? patch.moduleId : d.moduleId,
      title:   patch.moduleTitle !== undefined
        ? (patch.moduleTitle || d.title)
        : (d.data.moduleTitle || d.title),
      sections: current !== 'review' && d.sections[current as AuthoringSectionId] === 'todo'
        ? { ...d.sections, [current]: 'in_progress' as SectionStatus }
        : d.sections,
    }));
  }, [update, current]);

  const setStatus = (s: AuthoringSectionId, status: SectionStatus) =>
    update(d => ({ ...d, sections: { ...d.sections, [s]: status } }));

  const setTitle = (title: string) => update(d => ({ ...d, title }));
  const setOwner = () => { if (displayName && draft && !draft.owner) update(d => ({ ...d, owner: displayName })); };
  // eslint-disable-next-line react-hooks/rules-of-hooks
  useEffect(setOwner, [displayName, draft?.draftId]); // one-time attribution

  // Quill "image" toolbar handler — uploads to cap-assets via the API and
  // inserts the returned URL instead of embedding base64 into the recipe.
  const imageUpload = useCallback(function(this: any) {
    const quill = this.quill;
    const picker = document.createElement('input');
    picker.type = 'file';
    picker.accept = 'image/png,image/jpeg,image/gif,image/webp';
    picker.onchange = async () => {
      const file = picker.files?.[0];
      if (!file) return;
      try {
        const { dataUrl, contentType } = await prepareImage(file);
        const { url } = await adminApi.admin.uploadImage({
          data: dataUrl.split(',')[1], contentType, moduleId: draft?.moduleId,
        });
        const range = quill.getSelection(true);
        quill.insertEmbed(range.index, 'image', url, 'user');
        quill.setSelection(range.index + 1, 'user');
      } catch (e: any) {
        setPublishErrs(prev => [...prev, `Image upload failed: ${e.message ?? e}`]);
      }
    };
    picker.click();
  }, [draft?.moduleId]);

  // ── publish ───────────────────────────────────────────────────────────────
  async function publish() {
    if (!draft) return;
    const { errs } = completeness(draft);
    setPublishErrs(errs);
    if (errs.length) return;
    setPublishing(true);
    try {
      // flush any pending autosave first so the publish sees the latest data
      if (dirtyRef.current) {
        await adminApi.authoring.updateDraft(draft.draftId, {
          title: draft.title, owner: draft.owner, moduleId: draft.moduleId,
          sections: draft.sections, data: draft.data,
          sourceMaterials: draft.sourceMaterials, aiFields: draft.aiFields,
        });
      }
      const { recipe } = await adminApi.authoring.publish(draft.draftId);
      navigate('/author/recipes', { state: { published: `${recipe.moduleTitle} — v${recipe.version}` } });
    } catch (e: any) {
      setPublishErrs([`Publish failed: ${e.message}`]);
      setPublishing(false);
    }
  }

  if (loadErr) return <p style={{ color: '#a33' }}>Could not load draft: {loadErr}</p>;
  if (!draft)  return <p style={{ color: '#888' }}>Loading draft…</p>;

  const doneCount = AUTHORING_SECTIONS.filter(s => draft.sections[s.id] === 'done').length;
  const Body = current === 'review' ? null : SECTION_BODIES[current];
  const currentTrack = current === 'review' ? null
    : AUTHORING_SECTIONS.find(s => s.id === current)!.track;
  // Rail entries grouped by track — a header row introduces each zone.
  const rail: ({ kind: 'header'; track: AuthoringTrack } | { kind: 'section'; id: AuthoringSectionId | 'review'; label: string })[] = [];
  let lastTrack: AuthoringTrack | null = null;
  for (const s of AUTHORING_SECTIONS) {
    if (s.track !== lastTrack && s.track !== 'module') {
      rail.push({ kind: 'header', track: s.track });
      lastTrack = s.track;
    }
    rail.push({ kind: 'section', id: s.id, label: s.label });
  }
  rail.push({ kind: 'section', id: 'review', label: 'Review & publish' });

  return (
    <div style={{ display: 'flex', gap: 24, alignItems: 'flex-start' }}>
      {/* ── progress rail ── */}
      <aside style={{ width: 220, flexShrink: 0, position: 'sticky', top: 24 }}>
        <input style={{ ...input, fontWeight: 600, marginBottom: 4 }}
          value={draft.title} onChange={e => setTitle(e.target.value)}
          placeholder="Draft title" />
        <div style={{ fontSize: 11, color: '#888', marginBottom: 14 }}>
          {doneCount}/{AUTHORING_SECTIONS.length} sections complete ·{' '}
          {saveState === 'saving' ? 'saving…' : saveState === 'saved' ? 'saved' :
           saveState === 'error' ? 'save failed — retrying on next edit' : ''}
        </div>
        <nav>
          {rail.map((item) => {
            if (item.kind === 'header') {
              return (
                <div key={`h-${item.track}`} style={{
                  fontSize: 11, fontWeight: 700, textTransform: 'uppercase',
                  letterSpacing: 0.4, color: item.track === 'recipe' ? '#1D4E8C' : '#8a6d00',
                  margin: '14px 0 4px', padding: '0 12px',
                }}>
                  {AUTHORING_TRACK_LABELS[item.track]}
                </div>
              );
            }
            const s = item;
            const active = s.id === current;
            const st: SectionStatus | undefined = s.id === 'review' ? undefined : draft.sections[s.id as AuthoringSectionId];
            return (
              <button key={s.id} type="button" onClick={() => setCurrent(s.id as any)}
                style={{
                  display: 'flex', alignItems: 'center', gap: 8, width: '100%',
                  padding: '9px 12px', marginBottom: 4, borderRadius: 6, fontSize: 13,
                  border: active ? '1px solid #1e6b34' : '1px solid transparent',
                  background: active ? '#E9F5EC' : 'transparent',
                  color: active ? '#1e6b34' : '#444', cursor: 'pointer', textAlign: 'left',
                }}>
                <span style={{ color: st ? STATUS_COLOR[st] : '#888', width: 14 }}>{st ? STATUS_ICON[st] : '✓'}</span>
                {s.label}
              </button>
            );
          })}
        </nav>
        <div style={{ marginTop: 16, fontSize: 12 }}>
          <Link to="/author/recipes" style={{ color: '#1e6b34' }}>← Back to modules</Link>
        </div>
        <div style={{ marginTop: 8, fontSize: 12 }}>
          <Link to={`/author/generate?draft=${draft.draftId}`} style={{ color: '#1e6b34' }}>
            ✦ Regenerate with AI
          </Link>
        </div>
        {draft.fromVersion !== undefined && (
          <div style={{ marginTop: 12, fontSize: 11, color: '#8a6d00', background: '#fdf6e3',
            padding: '6px 10px', borderRadius: 4 }}>
            Editing published v{draft.fromVersion} — publishing creates v{draft.fromVersion + 1}.
          </div>
        )}
      </aside>

      {/* ── current section ── */}
      <main style={{ flex: 1, minWidth: 0 }}>
        {Body ? (
          <>
            <h2 style={{ color: '#1e6b34', marginTop: 0, fontSize: 18 }}>
              {AUTHORING_SECTIONS.find(s => s.id === current)?.label}
            </h2>
            {currentTrack && (
              <div style={{
                fontSize: 13, lineHeight: 1.5, padding: '10px 14px', borderRadius: 6,
                marginBottom: 18, border: '1px solid',
                ...(currentTrack === 'activity'
                  ? { background: '#fdf6e3', borderColor: '#f0d9a0', color: '#854f0b' }
                  : currentTrack === 'recipe'
                    ? { background: '#eef3fb', borderColor: '#c3d3ee', color: '#1d4e8c' }
                    : { background: '#f5f5f4', borderColor: '#e0e0e0', color: '#666' }),
              }}>
                <strong>{AUTHORING_TRACK_LABELS[currentTrack]}.</strong>{' '}
                {AUTHORING_TRACK_BLURBS[currentTrack]}
              </div>
            )}
            <Body draft={draft} setData={setData} imageUpload={imageUpload} />
            <div style={{ display: 'flex', gap: 12, marginTop: 18, alignItems: 'center' }}>
              <label style={{ fontSize: 13, color: '#444', display: 'flex', gap: 6, alignItems: 'center' }}>
                <input type="checkbox"
                  checked={draft.sections[current as AuthoringSectionId] === 'done'}
                  onChange={e => setStatus(current as AuthoringSectionId, e.target.checked ? 'done' : 'in_progress')} />
                Mark this section complete
              </label>
              <span style={{ marginLeft: 'auto' }}>
                <button type="button" style={{ ...navBtn, marginRight: 8 }}
                  onClick={() => stepRail(current, -1, setCurrent)}>← Previous</button>
                <button type="button" style={navBtn}
                  onClick={() => stepRail(current, 1, setCurrent)}>Next →</button>
              </span>
            </div>
          </>
        ) : (
          <>
            <h2 style={{ color: '#1e6b34', marginTop: 0, fontSize: 18 }}>Review & publish</h2>
            <ReviewPanel draft={draft} onJump={s => setCurrent(s)} />
            {publishErrs.length > 0 && (
              <div style={{ background: '#fbeaea', border: '1px solid #eec9c9', color: '#7a1f1f',
                padding: '12px 16px', borderRadius: 6, marginBottom: 16 }}>
                {publishErrs.map((e, i) => <div key={i}>• {e}</div>)}
              </div>
            )}
            <div style={{ display: 'flex', gap: 12, marginBottom: 60 }}>
              <button type="button" style={navBtn} onClick={() => setCurrent('conversation')}>← Back</button>
              <button onClick={publish} disabled={publishing}
                style={{ background: '#1e6b34', color: '#fff', border: 'none',
                  borderRadius: 4, padding: '10px 24px', fontSize: 14,
                  cursor: publishing ? 'not-allowed' : 'pointer', opacity: publishing ? 0.6 : 1 }}>
                {publishing ? 'Publishing…' : `Publish${draft.fromVersion !== undefined ? ` as v${draft.fromVersion + 1}` : ''}`}
              </button>
            </div>
          </>
        )}
      </main>
    </div>
  );
}

const navBtn: CSSProperties = { padding: '8px 16px', fontSize: 13, border: '1px solid #ccc', borderRadius: 4, background: '#fff', cursor: 'pointer' };

function stepRail(
  current: AuthoringSectionId | 'review',
  dir: -1 | 1,
  set: (s: AuthoringSectionId | 'review') => void,
) {
  const ids = [...AUTHORING_SECTIONS.map(s => s.id), 'review'] as (AuthoringSectionId | 'review')[];
  const i = ids.indexOf(current);
  const next = ids[i + dir];
  if (next) set(next);
}

/** Per-section readiness summary on the review step. */
const SECTION_ERR_PREFIX: Record<AuthoringSectionId, string> = {
  basics: 'Module basics:', outcomes: 'Learning outcomes:', concepts: 'Key concepts:',
  activity: 'Activity steps:', conversation: 'Assessment conversation:',
};

function ReviewPanel({ draft, onJump }: { draft: RecipeDraft; onJump: (s: AuthoringSectionId) => void }) {
  const { errs } = completeness(draft);
  return (
    <div style={{ marginBottom: 18 }}>
      {AUTHORING_SECTIONS.map(s => {
        const st = draft.sections[s.id];
        const sectErrs = errs.filter(e => e.startsWith(SECTION_ERR_PREFIX[s.id]));
        return (
          <div key={s.id} style={{ display: 'flex', alignItems: 'center', gap: 10,
            padding: '10px 14px', border: '1px solid #ddd', borderRadius: 6, marginBottom: 8 }}>
            <span style={{ color: STATUS_COLOR[st], width: 16 }}>{STATUS_ICON[st]}</span>
            <span style={{ flex: 1, fontSize: 14 }}>{s.label}</span>
            {sectErrs.length > 0 && <span style={{ fontSize: 12, color: '#a33' }}>{sectErrs.length} issue{sectErrs.length === 1 ? '' : 's'}</span>}
            <button type="button" style={{ padding: '4px 12px', fontSize: 12, border: '1px solid #ccc',
              borderRadius: 4, background: '#fff', cursor: 'pointer' }}
              onClick={() => onJump(s.id)}>Edit</button>
          </div>
        );
      })}
      <p style={{ fontSize: 12, color: '#888', marginTop: 12 }}>
        Publishing makes this the active version — new student sessions use it
        immediately; in-progress sessions keep their version. Evaluation uses
        the platform-wide master rubric, which is not edited per module.
      </p>
    </div>
  );
}
