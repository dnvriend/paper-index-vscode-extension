import { spawn } from 'child_process';
import { Paper, Quote, PaperIndexResult } from '../types';
import { getCacheService } from './cacheService';

const COMMAND_TIMEOUT_MS = 30000;

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
   * Get paper metadata by ID
   */
  async getPaper(paperId: string): Promise<Paper | undefined> {
    const cacheKey = `paper:${paperId}`;
    const cache = getCacheService();

    const cached = cache.get<Paper>(cacheKey);
    if (cached) {
      return cached;
    }

    try {
      const result = await this.executeCommand(['paper', 'show', paperId, '--format', 'json']);
      const paper = JSON.parse(result) as Paper;
      cache.set(cacheKey, paper);
      return paper;
    } catch (error) {
      console.error(`Failed to get paper ${paperId}:`, error);
      return undefined;
    }
  }

  /**
   * Get quotes for a paper
   */
  async getQuotes(paperId: string): Promise<Quote[]> {
    const cacheKey = `quotes:${paperId}`;
    const cache = getCacheService();

    const cached = cache.get<Quote[]>(cacheKey);
    if (cached) {
      return cached;
    }

    try {
      const result = await this.executeCommand(['paper', 'quotes', paperId, '--format', 'json']);
      const parsed = JSON.parse(result) as { quotes: Quote[]; id: string };
      const quotes = parsed.quotes || [];
      cache.set(cacheKey, quotes);
      return quotes;
    } catch (error) {
      console.error(`Failed to get quotes for ${paperId}:`, error);
      return [];
    }
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
