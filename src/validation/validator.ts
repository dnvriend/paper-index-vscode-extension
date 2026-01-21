import * as vscode from 'vscode';
import { Citation, Paragraph, ValidationResult, Quote } from '../types';
import { getPaperIndexService } from '../services/paperIndexService';
import { getBedrockService } from '../services/bedrockService';
import { getCacheService } from '../services/cacheService';
import { getConfig } from '../config/settings';

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

    // Get paper data
    const paperIndexService = getPaperIndexService(config.cliPath);
    const { paper, quotes, error } = await paperIndexService.getPaperWithQuotes(citation.key);

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
      });

      // Map supporting quote indices (1-based) to actual quotes
      const supportingQuotes = llmResponse.supportingQuoteIndices
        ? llmResponse.supportingQuoteIndices
            .map((idx) => quotes?.[idx - 1])
            .filter((q): q is Quote => q !== undefined)
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
