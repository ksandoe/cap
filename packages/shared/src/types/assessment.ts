export type RatingLevel = 'Strong' | 'Developing' | 'Needs further work';

export interface DimensionRating {
  dimensionName: string;
  rating:        RatingLevel;
  narrative:     string;
}

export interface Evaluation {
  sessionId:        string;
  dimensionRatings: DimensionRating[];
  outcomeSummary:   OutcomeSummary[];
  overallSummary:   string;
  badgeAwarded:     boolean;
  assessedAt:       string;
}

export interface OutcomeSummary {
  outcomeIndex: number;
  outcomeText:  string;
  status:       'achieved' | 'partial' | 'not_addressed';
}
