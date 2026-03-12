const FENCED_CODE_BLOCK_RE = /```[\s\S]*?```/g;
const INLINE_CODE_RE = /`[^`\n]+`/g;
const MARKDOWN_IMAGE_RE = /!\[[^\]]*]\(\s*([^)]+?)\s*\)/g;
const MARKDOWN_LINK_RE = /\[([^\]]+)]\(\s*([^)]+?)\s*\)/g;
const RAW_URL_RE = /\bhttps?:\/\/\S+/gi;
const HTML_TAG_RE = /<[^>]+>/g;
const ASSET_ID_RE = /^asset:([a-zA-Z0-9_]+)$/i;
const WORD_RE = /[\p{L}\p{N}]+(?:['’_-][\p{L}\p{N}]+)*/gu;

export interface SemanticBlockDefinition {
  key: string;
  label: string;
  aliases: string[];
}

export interface MarkdownSection {
  heading: string;
  normalizedHeading: string;
  level: number;
  body: string;
  bodyChars: number;
}

export interface SemanticBlockCoverage {
  block: SemanticBlockDefinition;
  section: MarkdownSection;
}

export const REQUIRED_SEMANTIC_BLOCKS: SemanticBlockDefinition[] = [
  {
    key: "context_problem",
    label: "context or problem framing",
    aliases: [
      "introduction",
      "background",
      "motivation",
      "context",
      "problem statement",
      "problem formulation",
      "research question",
      "objective",
      "objectives",
      "preliminaries",
      "overview"
    ]
  },
  {
    key: "prior_work",
    label: "relation to prior work",
    aliases: [
      "literature review",
      "related work",
      "prior work",
      "existing work",
      "background literature",
      "research landscape"
    ]
  },
  {
    key: "method",
    label: "method or approach",
    aliases: [
      "method",
      "methods",
      "approach",
      "methodology",
      "proposed method",
      "proposed approach",
      "system design",
      "architecture",
      "algorithm",
      "implementation"
    ]
  },
  {
    key: "evidence",
    label: "evidence, evaluation, or results",
    aliases: [
      "evaluation",
      "results",
      "results and discussion",
      "experiments",
      "experimental setup",
      "analysis",
      "discussion",
      "discussion analysis",
      "findings",
      "evidence",
      "results discussion",
      "evaluation results"
    ]
  },
  {
    key: "conclusion_limits",
    label: "conclusion or limitations",
    aliases: [
      "conclusion",
      "conclusions",
      "limitations",
      "future work",
      "conclusion and limitations",
      "limitations and future work",
      "conclusion and future work",
      "discussion and limitations",
      "conclusion limitations",
      "closing remarks"
    ]
  }
];

function normalizeLinkTarget(rawTarget: string) {
  return rawTarget.trim().split(/\s+/)[0]?.trim() ?? "";
}

function normalizeHeadingText(value: string) {
  return value
    .trim()
    .replace(/^#+\s*/, "")
    .replace(/\s+#+$/, "")
    .replace(/&/g, " and ")
    .replace(/[^a-zA-Z0-9]+/g, " ")
    .trim()
    .toLowerCase();
}

function headingsMatch(normalizedHeading: string, alias: string) {
  const normalizedAlias = normalizeHeadingText(alias);
  return (
    normalizedHeading === normalizedAlias ||
    normalizedHeading.includes(normalizedAlias) ||
    normalizedAlias.includes(normalizedHeading)
  );
}

export function findCoveredSemanticBlocksFromHeadings(headings: string[], blocks = REQUIRED_SEMANTIC_BLOCKS) {
  const normalizedHeadings = headings.map(normalizeHeadingText);
  const covered = new Set<string>();

  blocks.forEach((block) => {
    const hasMatch = normalizedHeadings.some((heading) => (
      block.aliases.some((alias) => headingsMatch(heading, alias))
    ));

    if (hasMatch) {
      covered.add(block.key);
    }
  });

  return covered;
}

export function resolveAssetReference(value: string | null | undefined) {
  if (!value) return null;
  const match = ASSET_ID_RE.exec(value.trim());
  return match?.[1] ?? null;
}

export function extractReferencedAssetIds(source: string) {
  const ids = new Set<string>();

  source.replace(MARKDOWN_IMAGE_RE, (_full, rawTarget: string) => {
    const assetId = resolveAssetReference(normalizeLinkTarget(rawTarget));
    if (assetId) ids.add(assetId);
    return _full;
  });

  source.replace(MARKDOWN_LINK_RE, (_full, _label: string, rawTarget: string) => {
    const assetId = resolveAssetReference(normalizeLinkTarget(rawTarget));
    if (assetId) ids.add(assetId);
    return _full;
  });

  return [...ids];
}

function stripImageReferences(source: string) {
  return source.replace(MARKDOWN_IMAGE_RE, "");
}

function stripMarkdownNoise(source: string) {
  return source
    .replace(FENCED_CODE_BLOCK_RE, " ")
    .replace(INLINE_CODE_RE, " ")
    .replace(MARKDOWN_LINK_RE, (_full, label: string) => label)
    .replace(RAW_URL_RE, " ")
    .replace(HTML_TAG_RE, " ");
}

export function countManuscriptWords(source: string) {
  const cleaned = stripMarkdownNoise(stripImageReferences(source));
  return cleaned.match(WORD_RE)?.length ?? 0;
}

export function countTextWords(source: string) {
  return stripMarkdownNoise(source).match(WORD_RE)?.length ?? 0;
}

export function parseMarkdownSections(source: string): MarkdownSection[] {
  const normalized = source.replace(/\r\n/g, "\n");
  const headingMatches = [...normalized.matchAll(/^(#{1,6})\s+(.+?)\s*$/gm)];

  return headingMatches.map((match, index) => {
    const headingStart = match.index ?? 0;
    const headingEnd = headingStart + match[0].length;
    const nextHeadingStart = headingMatches[index + 1]?.index ?? normalized.length;
    const body = normalized.slice(headingEnd, nextHeadingStart).trim();

    return {
      heading: match[2].trim(),
      normalizedHeading: normalizeHeadingText(match[2]),
      level: match[1].length,
      body,
      bodyChars: body.replace(/\s+/g, " ").trim().length
    };
  });
}

export function findSemanticBlockCoverage(source: string, blocks = REQUIRED_SEMANTIC_BLOCKS) {
  const sections = parseMarkdownSections(source);
  const coverage: SemanticBlockCoverage[] = [];

  blocks.forEach((block) => {
    const matchIndex = sections.findIndex((section) => (
      block.aliases.some((alias) => headingsMatch(section.normalizedHeading, alias))
    ));

    if (matchIndex >= 0) {
      coverage.push({
        block,
        section: sections[matchIndex]
      });
    }
  });

  return coverage;
}

export function getMissingSemanticBlocks(source: string, blocks = REQUIRED_SEMANTIC_BLOCKS) {
  const coverage = findSemanticBlockCoverage(source, blocks);
  const coveredKeys = new Set(coverage.map((entry) => entry.block.key));
  return blocks.filter((block) => !coveredKeys.has(block.key));
}

export function getManuscriptMetrics(source: string) {
  return {
    sourceChars: source.length,
    wordCount: countManuscriptWords(source),
    referencedAssetIds: extractReferencedAssetIds(source)
  };
}
