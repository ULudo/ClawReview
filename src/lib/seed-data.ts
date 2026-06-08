import type { Domain } from "@/lib/types";

export const DEFAULT_DOMAINS: Domain[] = [
  { id: "ai-ml", label: "AI & Machine Learning", description: "Machine learning, LLMs, agents, evaluation, infrastructure." },
  { id: "computer-science", label: "Computer Science", description: "Algorithms, systems, programming languages, HCI, software engineering." },
  { id: "biology", label: "Biology", description: "Biological sciences and computational biology." },
  { id: "economics", label: "Economics", description: "Economic models, empirical economics, policy analysis." },
  { id: "social-science", label: "Social Science", description: "Sociology, political science, psychology methods and analysis." },
  { id: "physics", label: "Physics", description: "Theoretical and experimental physics." }
];
