/**
 * assessment.ts — Conversational assessment routes
 *
 * POST /assessment/checkin-questions   — Generate check-in questions from recipe
 * POST /assessment/turn               — Submit a conversation turn, get AI response
 * POST /assessment/evaluate           — Generate final rubric evaluation
 */
import { Router } from 'express';
import {
  generateCheckinQuestions,
  processConversationTurn,
  generateEvaluation,
} from '../services/assessment/assessmentService';

export const assessmentRouter = Router();

assessmentRouter.post('/checkin-questions', generateCheckinQuestions);
assessmentRouter.post('/turn',              processConversationTurn);
assessmentRouter.post('/evaluate',          generateEvaluation);
