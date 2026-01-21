import * as vscode from 'vscode';

/**
 * Represents a parsed citation from a Markdown document
 */
export interface Citation {
  /** The citation key (e.g., "author2023") */
  key: string;
  /** Full citation text as it appears in the document */
  fullText: string;
  /** Range in the document where this citation appears */
  range: vscode.Range;
  /** Optional page reference */
  pageRef?: string;
  /** Citation type */
  type: 'bracket' | 'inline';
}

/**
 * Represents a paragraph containing one or more citations
 */
export interface Paragraph {
  /** The full paragraph text */
  text: string;
  /** Range in the document */
  range: vscode.Range;
  /** Citations found in this paragraph */
  citations: Citation[];
}

/**
 * Paper metadata from paper-index-tool CLI
 */
export interface Paper {
  id: string;
  title: string;
  author: string;
  year?: number;
  abstract?: string;
  journal?: string;
  volume?: string;
  issue?: string;
  pages?: string;
  doi?: string;
  url?: string | null;
  keywords?: string;
  question?: string;
  method?: string;
  gaps?: string;
  results?: string;
  interpretation?: string;
  claims?: string;
  quotes?: Quote[];
  peer_reviewed?: boolean;
}

/**
 * Quote from a paper
 */
export interface Quote {
  text: string;
  page?: number;
}

/**
 * Fragment from BM25 search query
 */
export interface Fragment {
  line_start: number;
  line_end: number;
  lines: string[];
  matched_line_numbers: number[];
}

/**
 * Search result with fragments
 */
export interface SearchResult {
  id: string;
  type: string;
  score: number;
  title: string;
  fragments: Fragment[];
}

/**
 * Result from paper-index-tool CLI
 */
export interface PaperIndexResult {
  paper?: Paper;
  quotes?: Quote[];
  error?: string;
}

/**
 * Validation status levels
 */
export type ValidationStatus = 'supported' | 'partial' | 'not_supported';

/**
 * Result of validating a citation against paper content
 */
export interface ValidationResult {
  /** The citation being validated */
  citation: Citation;
  /** Validation status */
  status: ValidationStatus;
  /** Confidence score (0-1) */
  confidence: number;
  /** Explanation from LLM */
  explanation: string;
  /** Supporting quotes found */
  supportingQuotes?: Quote[];
  /** The paragraph context */
  paragraphText: string;
  /** Paper metadata if found */
  paper?: Paper;
  /** Model ID used for validation */
  modelId?: string;
  /** Suggested rephrase to improve confidence (only for supported/partial) */
  rephrase?: string;
  /** Token usage from LLM call */
  tokenUsage?: TokenUsage;
  /** Estimated cost in USD */
  costUsd?: number;
}

/**
 * Configuration for the extension
 */
export interface ExtensionConfig {
  cliPath: string;
  bedrock: {
    region: string;
    model: string;
    profile?: string;
  };
  validateOnSave: boolean;
  cache: {
    ttlSeconds: number;
  };
  validation: {
    confidenceThresholds: {
      supported: number;
      partial: number;
    };
  };
}

/**
 * Cache entry with TTL support
 */
export interface CacheEntry<T> {
  value: T;
  expiresAt: number;
}

/**
 * LLM validation request
 */
export interface ValidationRequest {
  paragraphText: string;
  citationKey: string;
  paperTitle: string;
  paperAbstract?: string;
  quotes: Quote[];
  /** Full file content (e.g., chapter markdown) when citation has page reference */
  fileContent?: string;
  /** Extended paper metadata for richer context */
  paperAuthor?: string;
  paperYear?: number;
  paperDoi?: string;
  paperJournal?: string;
  paperPeerReviewed?: boolean;
  paperClaims?: string;
  paperMethod?: string;
  paperResults?: string;
  paperQuestion?: string;
  paperInterpretation?: string;
  /** Keyword search fragments from BM25 query */
  keywordFragments?: Fragment[];
}

/**
 * Token usage from LLM response
 */
export interface TokenUsage {
  inputTokens: number;
  outputTokens: number;
}

/**
 * LLM validation response
 */
export interface LLMValidationResponse {
  status: ValidationStatus;
  confidence: number;
  explanation: string;
  supportingQuoteIndices?: number[];
  /** Suggested rephrase to improve confidence (only for supported/partial) */
  rephrase?: string;
  /** Token usage from the LLM call */
  tokenUsage?: TokenUsage;
}
