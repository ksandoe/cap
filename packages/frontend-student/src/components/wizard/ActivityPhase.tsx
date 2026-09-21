/**
 * ActivityPhase.tsx — Phase 2: the learning activity.
 *
 * Renders the recipe's content blocks in the author-defined sequence
 * (Master PRD §3.2): conceptual blocks, instructional blocks (numbered
 * steps — understanding notes are never shown), and SAP activity blocks.
 * A concurrent pair renders its instructional and SAP blocks adjacent.
 *
 * "I have completed the activity" → confirmation → POST verify-sap →
 * poll verify-status every 3s → advance on SAP_VERIFIED, or show which
 * document types are missing / a connectivity error and allow retry.
 *
 * TODO (Phase 2): gate enforcement per block, concurrent-pair layouts
 * (side-by-side ≥1200px, modal/tabbed 768–1199px), block completion state.
 */
import { useEffect, useRef, useState } from 'react';
import { api } from '../../services/api';
import { useSessionStore } from '../../store/sessionStore';
import { ContentBlock, InstructionalBlock, SapBlock, ConcurrentPair } from '@cap/shared';

const POLL_INTERVAL_MS = 3_000;
const POLL_TIMEOUT_MS  = 60_000; // client-side ceiling; SAP query itself times out server-side

export function ActivityPhase() {
  const sessionId = useSessionStore(s => s.sessionId);
  const recipe    = useSessionStore(s => s.recipe);
  const setPhase  = useSessionStore(s => s.setPhase);

  const [confirming, setConfirming] = useState(false);
  const [verifying,  setVerifying]  = useState(false);
  const [error,      setError]      = useState<string | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => () => { if (pollRef.current) clearInterval(pollRef.current); }, []);

  async function startVerification() {
    if (!sessionId || verifying) return;
    setConfirming(false);
    setVerifying(true);
    setError(null);
    try {
      await api.session.verifySap(sessionId);
    } catch (e: any) {
      setError('Verification could not be started. Please try again in a moment.');
      setVerifying(false);
      return;
    }

    const started = Date.now();
    pollRef.current = setInterval(async () => {
      try {
        const { status, sapVerificationError } = await api.session.verifyStatus(sessionId!);
        if (status === 'SAP_VERIFIED') {
          stopPolling();
          setPhase(3);
        } else if ((status === 'LEARNING' || status === 'ACTIVITY') && sapVerificationError) {
          stopPolling();
          const missing = sapVerificationError.missingTypes?.length
            ? `The following items weren't found yet: ${sapVerificationError.missingTypes.join(', ')}. ` +
              'Complete them and try again.'
            : 'The system that checks your work is temporarily unavailable. Please try again in a few minutes.';
          setError(missing);
        } else if (Date.now() - started > POLL_TIMEOUT_MS) {
          stopPolling();
          setError('Verification is taking longer than expected. Please try again.');
        }
      } catch {
        stopPolling();
        setError('Lost connection while verifying. Please try again.');
      }
    }, POLL_INTERVAL_MS);
  }

  function stopPolling() {
    if (pollRef.current) clearInterval(pollRef.current);
    pollRef.current = null;
    setVerifying(false);
  }

  const stub = recipe?.contentStub;

  // Render the learning activity in the authored sequence order
  const items = recipe?.sequence ?? [];
  const blockById = new Map((recipe?.contentBlocks ?? []).map(b => [b.blockId, b]));
  const pairById  = new Map((recipe?.concurrentPairs ?? []).map(p => [p.pairId, p]));

  return (
    <div>
      <h2>Your activity</h2>

      {stub?.summaryText && <p style={{ lineHeight: 1.7 }}>{stub.summaryText}</p>}

      {!!stub?.resourceLinks?.length && (
        <ul className="resource-links">
          {stub.resourceLinks.map(l => (
            <li key={l.url}>
              <a href={l.url} target="_blank" rel="noreferrer">{l.label}</a>
              {l.type && <span className="tag">{l.type}</span>}
            </li>
          ))}
        </ul>
      )}

      {items.map((item, i) => {
        if (item.kind === 'pair') {
          const pair = pairById.get(item.pairId);
          const instr = pair && blockById.get(pair.instructionalId) as InstructionalBlock | undefined;
          const sap   = pair && blockById.get(pair.sapId) as SapBlock | undefined;
          return (
            <div key={item.pairId} className="concurrent-pair">
              {instr && <BlockView block={instr} />}
              {sap   && <BlockView block={sap} />}
            </div>
          );
        }
        const block = blockById.get(item.blockId);
        return block ? <BlockView key={item.blockId} block={block} /> : null;
      })}

      {error && <div className="notice error" role="alert">{error}</div>}

      {!confirming && !verifying && (
        <button className="primary" onClick={() => setConfirming(true)}>
          I have completed the activity
        </button>
      )}

      {confirming && (
        <div className="notice">
          <p>Have you finished all of the steps above?</p>
          <button className="primary" onClick={startVerification}>Yes, check my work</button>
          <button className="secondary" onClick={() => setConfirming(false)}>Not yet</button>
        </div>
      )}

      {verifying && (
        <p className="muted" role="status">Checking your work — this usually takes a few seconds…</p>
      )}
    </div>
  );
}

function BlockView({ block }: { block: ContentBlock }) {
  if (block.type === 'conceptual') {
    return (
      <section className="block conceptual">
        <h3>{block.title}</h3>
        <p style={{ lineHeight: 1.7 }}>{block.body}</p>
        {block.videoUrl && (
          <p><a href={block.videoUrl} target="_blank" rel="noreferrer">Watch: {block.title}</a></p>
        )}
      </section>
    );
  }
  if (block.type === 'instructional') {
    return (
      <section className="block instructional">
        <h3>{block.title}</h3>
        <ol className="steps">
          {block.steps.map(s => <li key={s.stepNumber}>{s.description}</li>)}
        </ol>
      </section>
    );
  }
  return (
    <section className="block sap">
      <h3>{block.title}</h3>
      <p style={{ lineHeight: 1.7 }}>{block.taskPrompt}</p>
    </section>
  );
}
