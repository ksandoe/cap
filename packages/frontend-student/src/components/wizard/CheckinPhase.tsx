/**
 * CheckinPhase.tsx — Phase 1: adaptive check-in survey.
 *
 * Fetches AI-generated questions, renders them by response type
 * (Likert / multiple choice / short text), and submits all responses
 * before advancing to Phase 2. Responses are not graded.
 */
import { useEffect, useState } from 'react';
import { api, CheckinQuestion } from '../../services/api';
import { useSessionStore } from '../../store/sessionStore';
import { CheckinResponse } from '@cap/shared';

export function CheckinPhase() {
  const sessionId     = useSessionStore(s => s.sessionId);
  const setPhase      = useSessionStore(s => s.setPhase);
  const setResponses  = useSessionStore(s => s.setCheckinResponses);

  const [questions, setQuestions] = useState<CheckinQuestion[] | null>(null);
  const [answers,   setAnswers]   = useState<Record<string, string>>({});
  const [error,     setError]     = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    api.assessment.checkinQuestions()
      .then(r => setQuestions(r.questions))
      .catch(e => setError(`Could not load the check-in questions. ${e.message}`));
  }, []);

  const allAnswered = !!questions && questions.every(q => (answers[q.questionKey] ?? '').trim() !== '');

  async function submit() {
    if (!allAnswered || !sessionId || submitting) return;
    setSubmitting(true);
    const responses: CheckinResponse[] = questions!.map(q => ({
      questionKey:  q.questionKey,
      questionText: q.questionText,
      responseType: q.responseType,
      response:     answers[q.questionKey],
    }));
    try {
      await api.session.submitCheckin(sessionId, responses);
      setResponses(responses);
      setPhase(2);
    } catch (e: any) {
      setError(`Could not save your answers. ${e.message}`);
      setSubmitting(false);
    }
  }

  if (error) {
    return <div className="notice error" role="alert">{error}</div>;
  }
  if (!questions) {
    return <p className="muted">Preparing a few questions about your background…</p>;
  }

  return (
    <div>
      <h2>Before you start</h2>
      <p className="muted">
        A few quick questions about your experience. These aren’t graded — they
        help tailor the conversation you’ll have after the activity.
      </p>

      {questions.map((q, qi) => (
        <fieldset key={q.questionKey} className="question">
          <legend>{qi + 1}. {q.questionText}</legend>

          {q.responseType === 'short_text' ? (
            <input
              type="text"
              maxLength={150}
              value={answers[q.questionKey] ?? ''}
              onChange={e => setAnswers(a => ({ ...a, [q.questionKey]: e.target.value }))}
              aria-label={q.questionText}
            />
          ) : (
            <div className="options">
              {(q.options ?? []).map(opt => (
                <label key={opt} className="option">
                  <input
                    type="radio"
                    name={q.questionKey}
                    value={opt}
                    checked={answers[q.questionKey] === opt}
                    onChange={() => setAnswers(a => ({ ...a, [q.questionKey]: opt }))}
                  />
                  {opt}
                </label>
              ))}
            </div>
          )}
        </fieldset>
      ))}

      <button className="primary" disabled={!allAnswered || submitting} onClick={submit}>
        {submitting ? 'Saving…' : 'Continue to the activity'}
      </button>
    </div>
  );
}
