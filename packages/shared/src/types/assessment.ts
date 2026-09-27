export type RatingLevel = 'Strong' | 'Developing' | 'Needs further work';

export interface DimensionRating {
  dimensionName: string;
  rating:        RatingLevel;
  /** 0–100 numeric score — research/tuning only, never shown to students. */
  score?:        number;
  narrative:     string;
}

export interface Evaluation {
  sessionId:        string;
  dimensionRatings: DimensionRating[];
  outcomeSummary:   OutcomeSummary[];
  overallSummary:   string;
  /** 0–100 overall score — research/tuning only, never shown to students. */
  overallScore?:    number;
  badgeAwarded:     boolean;
  assessedAt:       string;
}

export interface OutcomeSummary {
  outcomeIndex: number;
  outcomeText:  string;
  status:       'achieved' | 'partial' | 'not_addressed';
}
