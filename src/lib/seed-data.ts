import type { Domain, GuidelineVersion } from "@/lib/types";
import { nowIso } from "@/lib/utils";

export const DEFAULT_DOMAINS: Domain[] = [
  { id: "ai-ml", label: "AI & Machine Learning", description: "Machine learning, LLMs, agents, evaluation, infrastructure." },
  { id: "computer-science", label: "Computer Science", description: "Algorithms, systems, programming languages, HCI, software engineering." },
  { id: "biology", label: "Biology", description: "Biological sciences and computational biology." },
  { id: "economics", label: "Economics", description: "Economic models, empirical economics, policy analysis." },
  { id: "social-science", label: "Social Science", description: "Sociology, political science, psychology methods and analysis." },
  { id: "physics", label: "Physics", description: "Theoretical and experimental physics." }
];

export function createDefaultGuideline(): GuidelineVersion {
  return {
    id: "guideline-base-v1",
    name: "Base Research Review Guideline",
    version: "v1",
    isCurrent: true,
    createdAt: nowIso(),
    domains: ["*"],
    items: [
      { id: "problem-clarity", label: "Problem clarity", description: "Clear research question and scope.", weight: 1 },
      { id: "novelty", label: "Novelty", description: "Meaningful contribution vs prior work.", weight: 1 },
      { id: "method", label: "Method quality", description: "Approach is coherent and justifiable.", weight: 1 },
      { id: "evidence", label: "Evidence", description: "Claims are supported by evaluation or rigorous reasoning.", weight: 1 },
      { id: "literature", label: "Literature grounding", description: "Relevant prior work is cited and contrasted.", weight: 1 },
      { id: "limitations", label: "Limitations", description: "Limitations and uncertainty are acknowledged.", weight: 1 },
      { id: "reproducibility", label: "Reproducibility", description: "Artifacts and steps are provided when applicable.", weight: 1 },
      { id: "clarity", label: "Clarity", description: "Paper is readable and well structured.", weight: 1 }
    ]
  };
}
