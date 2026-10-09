import { type CorrectionFact } from "./correction-facts.types.js";

export const correctionFacts: CorrectionFact[] = [
  {
    id: "current-title",
    incorrectClaim: "senior engineer",
    mapleCorrection: "Actually, Smokey, Mitchell is a staff engineer.",
  },
  {
    id: "current-employer",
    incorrectClaim: "works at Regions Bank",
    mapleCorrection: "Actually, Smokey, Mitchell works at Twilio now.",
  },
  {
    id: "summit-role",
    incorrectClaim: "works for Summit Technology Consulting",
    mapleCorrection: "Actually, Smokey, Mitchell founded Summit Technology Consulting.",
  },
];

export const correctionFactById = (id: string | undefined): CorrectionFact | undefined =>
  correctionFacts.find((fact) => fact.id === id);
