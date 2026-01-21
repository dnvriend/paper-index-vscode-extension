import { spawn } from 'child_process';
import { readFile } from 'fs/promises';
import { Paper, Quote, PaperIndexResult } from '../types';
import { getCacheService } from './cacheService';

const COMMAND_TIMEOUT_MS = 30000;

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

    console.error(`Entry not found in paper, book, or media: ${entryId}`);
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

    console.error(`Quotes not found for entry: ${entryId}`);
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
      console.error(`Failed to read markdown file for ${entryId}:`, error);
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
      console.error(`Failed to search papers with query "${query}":`, error);
      return [];
    }
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
          resolve(stdout.trim());
        } else {
          reject(new Error(`CLI command failed with code ${code}: ${stderr}`));
        }
      });

      process.on('error', (error) => {
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
