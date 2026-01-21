import { spawn } from 'child_process';
import { readFile } from 'fs/promises';
import { Paper, Quote, PaperIndexResult, Fragment, SearchResult } from '../types';
import { getCacheService } from './cacheService';
import { logger } from './logger';

const COMMAND_TIMEOUT_MS = 30000;

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

/** Entry types supported by paper-index-tool */
type EntryType = 'paper' | 'book' | 'media';
const ENTRY_TYPES: EntryType[] = ['paper', 'book', 'media'];

/**
 * Service for interacting with paper-index-tool CLI
 */
export class PaperIndexService {
  private cliPath: string;

  constructor(cliPath: string = 'paper-index-tool') {
    this.cliPath = cliPath;
  }

  /**
   * Update the CLI path
   */
  setCliPath(cliPath: string): void {
    this.cliPath = cliPath;
  }

  /**
   * Get entry metadata by ID, searching across paper, book, and media
   */
  async getPaper(entryId: string): Promise<Paper | undefined> {
    const cacheKey = `entry:${entryId}`;
    const cache = getCacheService();

    const cached = cache.get<Paper>(cacheKey);
    if (cached) {
      return cached;
    }

    // Try each entry type until we find a match
    for (const entryType of ENTRY_TYPES) {
      try {
        const result = await this.executeCommand([entryType, 'show', entryId, '--format', 'json']);
        const entry = JSON.parse(result) as Paper;
        cache.set(cacheKey, entry);
        return entry;
      } catch {
        // Entry not found in this type, try next
        continue;
      }
    }

    logger.warn(`Entry not found in paper, book, or media: ${entryId}`);
    return undefined;
  }

  /**
   * Get quotes for an entry, searching across paper, book, and media
   */
  async getQuotes(entryId: string): Promise<Quote[]> {
    const cacheKey = `quotes:${entryId}`;
    const cache = getCacheService();

    const cached = cache.get<Quote[]>(cacheKey);
    if (cached) {
      return cached;
    }

    // Try each entry type until we find a match
    for (const entryType of ENTRY_TYPES) {
      try {
        const result = await this.executeCommand([entryType, 'quotes', entryId, '--format', 'json']);
        const parsed = JSON.parse(result) as { quotes: Quote[]; id: string };
        const quotes = parsed.quotes || [];
        cache.set(cacheKey, quotes);
        return quotes;
      } catch {
        // Entry not found in this type, try next
        continue;
      }
    }

    logger.warn(`Quotes not found for entry: ${entryId}`);
    return [];
  }

  /**
   * Get paper and quotes together
   */
  async getPaperWithQuotes(paperId: string): Promise<PaperIndexResult> {
    const [paper, quotes] = await Promise.all([this.getPaper(paperId), this.getQuotes(paperId)]);

    if (!paper) {
      return { error: `Paper not found: ${paperId}` };
    }

    return { paper, quotes };
  }

  /**
   * Get full file content from the markdown file associated with an entry.
   * Returns undefined if no markdown file path is set or file cannot be read.
   */
  async getFileContent(entryId: string): Promise<string | undefined> {
    const cacheKey = `filecontent:${entryId}`;
    const cache = getCacheService();

    const cached = cache.get<string>(cacheKey);
    if (cached) {
      return cached;
    }

    // Get the paper to find the markdown file path
    const paper = await this.getPaper(entryId);
    if (!paper) {
      return undefined;
    }

    // Check for file_path_markdown field (may be on paper object from CLI)
    const filePath = (paper as { file_path_markdown?: string }).file_path_markdown;
    if (!filePath) {
      return undefined;
    }

    try {
      const content = await readFile(filePath, 'utf-8');
      cache.set(cacheKey, content);
      return content;
    } catch (error) {
      logger.error(`Failed to read markdown file for ${entryId}:`, error);
      return undefined;
    }
  }

  /**
   * Search for papers by query
   */
  async searchPapers(query: string): Promise<Paper[]> {
    const cacheKey = `search:${query}`;
    const cache = getCacheService();

    const cached = cache.get<Paper[]>(cacheKey);
    if (cached) {
      return cached;
    }

    try {
      const result = await this.executeCommand(['query', query, '--all', '--format', 'json']);
      const papers = JSON.parse(result) as Paper[];
      cache.set(cacheKey, papers);
      return papers;
    } catch (error) {
      logger.error(`Failed to search papers with query "${query}":`, error);
      return [];
    }
  }

  /**
   * Query a specific paper/book/media for keyword matches and return fragments
   */
  async queryEntry(entryId: string, keyword: string): Promise<Fragment[]> {
    const cacheKey = `query:${entryId}:${keyword}`;
    const cache = getCacheService();

    const cached = cache.get<Fragment[]>(cacheKey);
    if (cached) {
      logger.debug(`Cache hit for query: ${entryId} "${keyword}"`);
      return cached;
    }

    logger.info(`Querying ${entryId} for keyword: "${keyword}"`);

    // Try each entry type until we find a match
    for (const entryType of ENTRY_TYPES) {
      try {
        const result = await this.executeCommand([
          entryType,
          'query',
          entryId,
          keyword,
          '--fragments',
          '--format',
          'json',
        ]);
        const searchResults = JSON.parse(result) as SearchResult[];
        if (searchResults.length > 0 && searchResults[0].fragments) {
          const fragments = searchResults[0].fragments;
          logger.info(`Found ${fragments.length} fragment(s) for "${keyword}" in ${entryId}`);
          cache.set(cacheKey, fragments);
          return fragments;
        }
      } catch {
        // Entry not found in this type, try next
        continue;
      }
    }

    logger.debug(`No fragments found for "${keyword}" in ${entryId}`);
    return [];
  }

  /**
   * Query a paper with multiple keywords and combine unique fragments
   */
  async queryEntryWithKeywords(entryId: string, keywords: string[]): Promise<Fragment[]> {
    if (keywords.length === 0) {
      return [];
    }

    logger.info(`Querying ${entryId} with ${keywords.length} keywords:`, keywords);

    // Query all keywords in parallel
    const fragmentArrays = await Promise.all(
      keywords.map((keyword) => this.queryEntry(entryId, keyword))
    );

    // Combine and deduplicate fragments by line_start
    const seenLineStarts = new Set<number>();
    const uniqueFragments: Fragment[] = [];

    for (const fragments of fragmentArrays) {
      for (const fragment of fragments) {
        if (!seenLineStarts.has(fragment.line_start)) {
          seenLineStarts.add(fragment.line_start);
          uniqueFragments.push(fragment);
        }
      }
    }

    // Sort by line_start for consistent ordering
    uniqueFragments.sort((a, b) => a.line_start - b.line_start);

    logger.info(`Combined ${uniqueFragments.length} unique fragment(s) for ${entryId}`);

    return uniqueFragments;
  }

  /**
   * Semantic search: query a paper with full paragraph text using vector embeddings
   */
  async semanticQueryEntry(entryId: string, paragraphText: string, contextLines: number = 3): Promise<Fragment[]> {
    const cacheKey = `semantic:${entryId}:${hashText(paragraphText)}`;
    const cache = getCacheService();

    const cached = cache.get<Fragment[]>(cacheKey);
    if (cached) {
      logger.debug(`Cache hit for semantic query: ${entryId}`);
      return cached;
    }

    logger.info(`Semantic search on ${entryId} with paragraph (${paragraphText.length} chars)`);

    try {
      const result = await this.executeCommand([
        'query',
        paragraphText,
        '--paper',
        entryId,
        '-s',
        '--fragments',
        '-C',
        contextLines.toString(),
        '--format',
        'json',
      ]);
      const searchResults = JSON.parse(result) as SearchResult[];
      if (searchResults.length > 0 && searchResults[0].fragments) {
        const fragments = searchResults[0].fragments;
        logger.info(`Semantic search found ${fragments.length} fragment(s) for ${entryId}`);
        cache.set(cacheKey, fragments);
        return fragments;
      }
    } catch (error) {
      logger.error(`Semantic search failed for ${entryId}:`, error);
    }

    logger.debug(`No semantic fragments found for ${entryId}`);
    return [];
  }

  /**
   * Check if the CLI is available
   */
  async isAvailable(): Promise<boolean> {
    try {
      await this.executeCommand(['--version']);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Execute a CLI command
   */
  private executeCommand(args: string[]): Promise<string> {
    const commandStr = `${this.cliPath} ${args.map(a => a.includes(' ') ? `"${a}"` : a).join(' ')}`;
    logger.debug(`Executing: ${commandStr}`);

    return new Promise((resolve, reject) => {
      const process = spawn(this.cliPath, args, {
        timeout: COMMAND_TIMEOUT_MS,
      });

      let stdout = '';
      let stderr = '';

      process.stdout.on('data', (data) => {
        stdout += data.toString();
      });

      process.stderr.on('data', (data) => {
        stderr += data.toString();
      });

      process.on('close', (code) => {
        if (code === 0) {
          logger.debug(`Command succeeded, output length: ${stdout.length} chars`);
          resolve(stdout.trim());
        } else {
          logger.error(`Command failed with code ${code}`);
          logger.error(`stderr: ${stderr}`);
          reject(new Error(`CLI command failed with code ${code}: ${stderr}`));
        }
      });

      process.on('error', (error) => {
        logger.error(`Command spawn error:`, error);
        reject(error);
      });
    });
  }
}

// Singleton instance
let serviceInstance: PaperIndexService | null = null;

/**
 * Get or create the paper index service singleton
 */
export function getPaperIndexService(cliPath?: string): PaperIndexService {
  if (!serviceInstance) {
    serviceInstance = new PaperIndexService(cliPath);
  } else if (cliPath !== undefined) {
    serviceInstance.setCliPath(cliPath);
  }
  return serviceInstance;
}

/**
 * Reset the service singleton (mainly for testing)
 */
export function resetPaperIndexService(): void {
  serviceInstance = null;
}
