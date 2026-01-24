import * as vscode from 'vscode';
import { Citation, Paragraph, ValidationResult, Quote, TokenUsage, Fragment } from '../types';
import { getPaperIndexService } from '../services/paperIndexService';
import { getBedrockService } from '../services/bedrockService';
import { getCacheService } from '../services/cacheService';
import { getConfig } from '../config/settings';
import { getKeywordExtractor } from '../services/keywordExtractor';
import { logger } from '../services/logger';

/**
 * Model pricing per million tokens (USD)
 */
const MODEL_PRICING: Record<string, { input: number; output: number }> = {
  // Opus
  'claude-opus': { input: 5, output: 25 },
  'anthropic.claude-opus': { input: 5, output: 25 },
  // Sonnet
  'claude-sonnet': { input: 3, output: 15 },
  'anthropic.claude-sonnet': { input: 3, output: 15 },
  // Haiku
  'claude-haiku': { input: 1, output: 5 },
  'anthropic.claude-haiku': { input: 1, output: 5 },
};

/**
 * Calculate cost in USD based on token usage and model ID
 */
function calculateCost(tokenUsage: TokenUsage, modelId: string): number {
  // Find matching pricing by checking if modelId contains the key
  const modelIdLower = modelId.toLowerCase();
  let pricing = { input: 3, output: 15 }; // Default to Sonnet pricing

  for (const [key, value] of Object.entries(MODEL_PRICING)) {
    if (modelIdLower.includes(key)) {
      pricing = value;
      break;
    }
  }

  const inputCost = (tokenUsage.inputTokens / 1_000_000) * pricing.input;
  const outputCost = (tokenUsage.outputTokens / 1_000_000) * pricing.output;

  return inputCost + outputCost;
}

/**
 * Main validation orchestrator
 */
export class Validator {
  /**
   * Validate a single citation within its paragraph context
   */
  async validateCitation(citation: Citation, paragraph: Paragraph): Promise<ValidationResult> {
    const config = getConfig();
    const cache = getCacheService();
    const cacheKey = `validation:${citation.key}:${hashText(paragraph.text)}`;

    // Check cache
    const cached = cache.get<ValidationResult>(cacheKey);
    if (cached) {
      return cached;
    }

    const paperIndexService = getPaperIndexService(config.cliPath);
    const keywordExtractor = getKeywordExtractor(config.bedrock.region, config.bedrock.profile);

    // Run paper fetch and keyword extraction in parallel
    const [paperResult, extractedKeywords] = await Promise.all([
      paperIndexService.getPaperWithQuotes(citation.key),
      keywordExtractor.extractKeywords(paragraph.text),
    ]);

    const { paper, quotes, error } = paperResult;

    if (error || !paper) {
      const result: ValidationResult = {
        citation,
        status: 'not_supported',
        confidence: 0,
        explanation: error || `Paper not found: ${citation.key}`,
        paragraphText: paragraph.text,
      };
      return result;
    }

    // Combine English and Dutch keywords
    const allKeywords = [...extractedKeywords.english, ...extractedKeywords.dutch];

    // Fetch file content, keyword fragments, and semantic fragments in parallel
    const [fileContent, keywordFragments, semanticFragments] = await Promise.all([
      citation.pageRef ? paperIndexService.getFileContent(citation.key) : Promise.resolve(undefined),
      allKeywords.length > 0
        ? paperIndexService.queryEntryWithKeywords(citation.key, allKeywords)
        : Promise.resolve([] as Fragment[]),
      paperIndexService.semanticQueryEntry(citation.key, paragraph.text),
    ]);

    // Combine and deduplicate keyword + semantic fragments by line_start
    const seenLineStarts = new Set<number>();
    const combinedFragments: Fragment[] = [];

    for (const fragment of [...keywordFragments, ...semanticFragments]) {
      if (!seenLineStarts.has(fragment.line_start)) {
        seenLineStarts.add(fragment.line_start);
        combinedFragments.push(fragment);
      }
    }

    // Sort by line_start for consistent ordering
    combinedFragments.sort((a, b) => a.line_start - b.line_start);

    logger.info(`Combined ${combinedFragments.length} unique fragments (${keywordFragments.length} keyword + ${semanticFragments.length} semantic) for ${citation.key}`);

    // Validate with LLM
    const bedrockService = getBedrockService(
      config.bedrock.region,
      config.bedrock.model,
      config.bedrock.profile
    );

    try {
      const llmResponse = await bedrockService.validateCitation({
        paragraphText: paragraph.text,
        citationKey: citation.key,
        paperTitle: paper.title,
        paperAbstract: paper.abstract,
        quotes: quotes || [],
        fileContent,
        // Extended metadata
        paperAuthor: paper.author,
        paperYear: paper.year,
        paperDoi: paper.doi,
        paperJournal: paper.journal,
        paperPeerReviewed: paper.peer_reviewed,
        paperClaims: paper.claims,
        paperMethod: paper.method,
        paperResults: paper.results,
        paperQuestion: paper.question,
        paperInterpretation: paper.interpretation,
        paperEntryType: paper.entryType,
        keywordFragments: combinedFragments,
      });

      // Map supporting quote indices (1-based) to actual quotes
      const supportingQuotes = llmResponse.supportingQuoteIndices
        ? llmResponse.supportingQuoteIndices
            .map((idx) => quotes?.[idx - 1])
            .filter((q): q is Quote => q !== undefined)
        : undefined;

      // Calculate cost if token usage is available
      const costUsd = llmResponse.tokenUsage
        ? calculateCost(llmResponse.tokenUsage, config.bedrock.model)
        : undefined;

      // Use the LLM's status directly - confidence represents how certain
      // the LLM is about its status assessment, not how "supported" the citation is
      const result: ValidationResult = {
        citation,
        status: llmResponse.status,
        confidence: llmResponse.confidence,
        explanation: llmResponse.explanation,
        supportingQuotes,
        paragraphText: paragraph.text,
        paper,
        modelId: config.bedrock.model,
        rephrase: llmResponse.rephrase,
        tokenUsage: llmResponse.tokenUsage,
        costUsd,
      };

      cache.set(cacheKey, result);
      return result;
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Unknown error during validation';
      return {
        citation,
        status: 'not_supported',
        confidence: 0,
        explanation: `Validation failed: ${errorMessage}`,
        paragraphText: paragraph.text,
        paper,
        modelId: config.bedrock.model,
      };
    }
  }

  /**
   * Validate all citations in a document concurrently
   */
  async validateDocument(
    citations: Citation[],
    paragraphs: Paragraph[],
    progress?: vscode.Progress<{ message?: string; increment?: number }>
  ): Promise<ValidationResult[]> {
    const total = citations.length;
    let completed = 0;

    // Create validation tasks preserving order
    const validationTasks = citations.map((citation) => {
      const paragraph = paragraphs.find((p) => p.range.contains(citation.range));

      if (!paragraph) {
        // Return a resolved promise for citations without paragraph context
        return Promise.resolve<ValidationResult>({
          citation,
          status: 'not_supported',
          confidence: 0,
          explanation: 'Could not determine paragraph context',
          paragraphText: '',
        });
      }

      // Return validation promise
      return this.validateCitation(citation, paragraph).then((result) => {
        completed++;
        if (progress) {
          progress.report({
            message: `Validated ${completed}/${total}: @${citation.key}`,
            increment: (1 / total) * 100,
          });
        }
        return result;
      });
    });

    // Execute all validations concurrently, Promise.all preserves order
    const results = await Promise.all(validationTasks);

    return results;
  }

  /**
   * Validate all citations with controlled concurrency
   * Use this if you need to limit concurrent API calls
   */
  async validateDocumentWithConcurrencyLimit(
    citations: Citation[],
    paragraphs: Paragraph[],
    concurrencyLimit: number = 5,
    progress?: vscode.Progress<{ message?: string; increment?: number }>
  ): Promise<ValidationResult[]> {
    const total = citations.length;
    const results: ValidationResult[] = new Array(total);
    let completed = 0;

    // Process in batches
    for (let i = 0; i < total; i += concurrencyLimit) {
      const batch = citations.slice(i, Math.min(i + concurrencyLimit, total));
      const batchStartIndex = i;

      const batchPromises = batch.map((citation, batchIndex) => {
        const paragraph = paragraphs.find((p) => p.range.contains(citation.range));

        if (!paragraph) {
          return Promise.resolve<ValidationResult>({
            citation,
            status: 'not_supported',
            confidence: 0,
            explanation: 'Could not determine paragraph context',
            paragraphText: '',
          });
        }

        return this.validateCitation(citation, paragraph);
      });

      const batchResults = await Promise.all(batchPromises);

      // Store results in correct positions
      batchResults.forEach((result, batchIndex) => {
        results[batchStartIndex + batchIndex] = result;
        completed++;
        if (progress) {
          progress.report({
            message: `Validated ${completed}/${total}: @${result.citation.key}`,
            increment: (1 / total) * 100,
          });
        }
      });
    }

    return results;
  }

  /**
   * Validate citations for a specific key (all occurrences)
   */
  async validateCitationKey(
    key: string,
    citations: Citation[],
    paragraphs: Paragraph[]
  ): Promise<ValidationResult[]> {
    const keyCitations = citations.filter((c) => c.key === key);
    return this.validateDocument(keyCitations, paragraphs);
  }
}


/**
 * Simple hash for cache key generation
 */
function hashText(text: string): string {
  let hash = 0;
  for (let i = 0; i < text.length; i++) {
    const char = text.charCodeAt(i);
    hash = (hash << 5) - hash + char;
    hash = hash & hash;
  }
  return hash.toString(36);
}

// Singleton
let validatorInstance: Validator | null = null;

export function getValidator(): Validator {
  if (!validatorInstance) {
    validatorInstance = new Validator();
  }
  return validatorInstance;
}
