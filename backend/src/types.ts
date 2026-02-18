export type QARequest = {
  question: string;
  options?: string[];
  context?: string;
};

export type QAResponse = {
  answer: string;
  selectedOption: string | null;
  confidence: "low" | "medium" | "high";
};
