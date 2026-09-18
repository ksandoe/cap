/**
 * CheckoutPhase.tsx — Phase 3: the checkout conversation.
 *
 * Text-based dialogue with the AI agent. The backend is stateless — the
 * full message history is sent with each turn. Agent output may contain
 * hidden markers ([PHASE:n], [ASSESSMENT:{json}]) which are stripped
 * before display and used to trigger the Phase 4 evaluation.
 */
import { useEffect, useRef, useState } from 'react';
import { api } from '../../services/api';
import { useSessionStore } from '../../store/sessionStore';
import { Evaluation } from '@cap/shared';

const KICKOFF =
  '[The student has completed the activity and is ready for the checkout conversation. Begin now.]';

const PHASE_RE      = /\[PHASE:(\d)\]/g;
const ASSESSMENT_RE = /\[ASSESSMENT:(\{.*\})\]/s;

export function CheckoutPhase() {
  const sessionId      = useSessionStore(s => s.sessionId);
  const recipe         = useSessionStore(s => s.recipe);
  const transcript     = useSessionStore(s => s.transcript);
  const appendTurn     = useSessionStore(s => s.appendTurn);
  const setPhase       = useSessionStore(s => s.setPhase);
  const setEvaluation  = useSessionStore(s => s.setEvaluation);

  const [input,     setInput]     = useState('');
  const [waiting,   setWaiting]   = useState(false);
  const [finishing, setFinishing] = useState(false);
  const [error,     setError]     = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const started   = useRef(false);

  const maxTurns = recipe?.maxTurns ?? 20;
  const userTurns = transcript.filter(t => t.role === 'user' && !t.hidden).length;

  // Kick off the conversation with a hidden seed message (first mount only)
  useEffect(() => {
    if (started.current || !sessionId) return;
    started.current = true;
    if (transcript.length === 0) sendTurn(KICKOFF, true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionId]);

  // Keep the latest turn in view
  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight });
  }, [transcript, waiting]);

  async function sendTurn(content: string, hidden = false) {
    if (!sessionId) return;
    appendTurn('user', content, hidden);
    setWaiting(true);
    setError(null);
    try {
      const messages = [
        ...useSessionStore.getState().transcript.map(({ role, content }) => ({ role, content })),
      ];
      const { response } = await api.assessment.turn(messages);

      // Parse hidden markers out of the agent's reply
      let endConversation = false;
      let inlineEval: Evaluation | null = null;
      const cleaned = response
        .replace(ASSESSMENT_RE, (_: string, json: string) => {
          endConversation = true;
          try { inlineEval = JSON.parse(json); } catch { /* fall through to /evaluate */ }
          return '';
        })
        .replace(PHASE_RE, (_: string, n: string) => {
          if (n === '4') endConversation = true;
          return '';
        })
        .trim();

      if (cleaned) appendTurn('assistant', cleaned);
      setWaiting(false);

      const turns = useSessionStore.getState().transcript
        .filter(t => t.role === 'user' && !t.hidden).length;
      if (endConversation || turns >= maxTurns) await finish(inlineEval);
    } catch (e: any) {
      setWaiting(false);
      setError(`Something went wrong. ${e.message}`);
    }
  }

  async function finish(inlineEval: Evaluation | null) {
    if (finishing || !sessionId) return;
    setFinishing(true);
    try {
      const transcript = useSessionStore.getState().transcript
        .map(({ role, content }) => ({ role, content }));
      const evaluation = inlineEval
        ?? (await api.assessment.evaluate(transcript)).evaluation;
      setEvaluation(evaluation);
      // /complete destroys the session record — call it last
      await api.session.complete(sessionId, evaluation);
      setPhase(4);
    } catch (e: any) {
      setError(`Could not generate your evaluation. ${e.message}`);
      setFinishing(false);
    }
  }

  const visible = transcript.filter(t => !t.hidden);

  return (
    <div>
      <h2>Let’s talk about what you did</h2>
      <p className="muted">
        A short conversation about your activity — think of it as a debrief,
        not a test. Answer in your own words.
      </p>

      <div className="chat" ref={scrollRef} aria-live="polite">
        {visible.map((t, i) => (
          <div key={i} className={`bubble ${t.role === 'assistant' ? 'agent' : 'student'}`}>
            {t.content}
          </div>
        ))}
        {waiting && <div className="bubble agent typing" role="status">…</div>}
        {finishing && <p className="muted" role="status">Preparing your evaluation…</p>}
      </div>

      {error && <div className="notice error" role="alert">{error}</div>}

      {!finishing && (
        <form
          onSubmit={e => {
            e.preventDefault();
            const content = input.trim();
            if (!content || waiting) return;
            setInput('');
            sendTurn(content);
          }}
          className="chat-input"
        >
          <input
            type="text"
            value={input}
            onChange={e => setInput(e.target.value)}
            placeholder="Type your reply…"
            aria-label="Your reply"
            disabled={waiting}
            autoFocus
          />
          <button type="submit" className="primary" disabled={waiting || !input.trim()}>
            Send
          </button>
        </form>
      )}
    </div>
  );
}
