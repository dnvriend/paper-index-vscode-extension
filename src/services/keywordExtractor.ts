import {
  BedrockRuntimeClient,
  InvokeModelCommand,
  InvokeModelCommandInput,
} from '@aws-sdk/client-bedrock-runtime';
import { fromIni } from '@aws-sdk/credential-providers';
import { logger } from './logger';

/**
 * Extracted keywords in both English and Dutch
 */
export interface ExtractedKeywords {
  english: string[];
  dutch: string[];
}

/**
 * Service for extracting search keywords from paragraph text using a fast/cheap model
 */
export class KeywordExtractor {
  private client: BedrockRuntimeClient | null = null;
  private region: string;
  private profile?: string;

  // Use Haiku for fast, cheap keyword extraction
  private readonly modelId = 'anthropic.claude-3-haiku-20240307-v1:0';

  constructor(region: string = 'us-east-1', profile?: string) {
    this.region = region;
    this.profile = profile;
  }

  private getClient(): BedrockRuntimeClient {
    if (!this.client) {
      this.client = new BedrockRuntimeClient({
        region: this.region,
        ...(this.profile ? { credentials: fromIni({ profile: this.profile }) } : {}),
      });
    }
    return this.client;
  }

  /**
   * Extract search keywords from a paragraph in both English and Dutch
   */
  async extractKeywords(paragraphText: string): Promise<ExtractedKeywords> {
    logger.info('Extracting keywords from paragraph:', paragraphText.substring(0, 100) + '...');

    const prompt = `Extract search keywords from this academic paragraph. Return keywords that would help find relevant content in research papers.

IMPORTANT: Return keywords in BOTH English AND Dutch (Nederlandse termen).

Paragraph:
${paragraphText}

Return ONLY a JSON object in this exact format:
{
  "english": ["keyword1", "keyword2", "keyword3"],
  "dutch": ["trefwoord1", "trefwoord2", "trefwoord3"]
}

Guidelines:
- Extract 3-6 keywords per language
- Focus on key concepts, not common words
- Include academic/scientific terms
- Dutch keywords should be translations or equivalents of the English terms
- Return ONLY the JSON, no other text`;

    try {
      const response = await this.invokeModel(prompt);
      const keywords = this.parseKeywords(response);
      logger.info('Extracted keywords:', { english: keywords.english, dutch: keywords.dutch });
      return keywords;
    } catch (error) {
      logger.error('Failed to extract keywords:', error);
      // Return empty arrays on failure - validation can still proceed without keywords
      return { english: [], dutch: [] };
    }
  }

  private async invokeModel(prompt: string): Promise<string> {
    const client = this.getClient();

    const body = JSON.stringify({
      anthropic_version: 'bedrock-2023-05-31',
      max_tokens: 256,
      messages: [
        {
          role: 'user',
          content: prompt,
        },
      ],
    });

    const input: InvokeModelCommandInput = {
      modelId: this.modelId,
      contentType: 'application/json',
      accept: 'application/json',
      body: new TextEncoder().encode(body),
    };

    const command = new InvokeModelCommand(input);
    const response = await client.send(command);

    const responseBody = new TextDecoder().decode(response.body);
    const parsed = JSON.parse(responseBody);

    if (parsed.content && Array.isArray(parsed.content) && parsed.content.length > 0) {
      return parsed.content[0].text;
    }

    throw new Error('Unexpected response format from Bedrock');
  }

  private parseKeywords(response: string): ExtractedKeywords {
    // Extract JSON from response (handles markdown code blocks)
    const jsonMatch = response.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      logger.warn('No JSON found in keyword extraction response');
      return { english: [], dutch: [] };
    }

    try {
      const parsed = JSON.parse(jsonMatch[0]);
      return {
        english: Array.isArray(parsed.english) ? parsed.english : [],
        dutch: Array.isArray(parsed.dutch) ? parsed.dutch : [],
      };
    } catch (error) {
      logger.error('Failed to parse keywords JSON:', error);
      return { english: [], dutch: [] };
    }
  }
}

// Singleton instance
let extractorInstance: KeywordExtractor | null = null;

/**
 * Get or create the keyword extractor singleton
 */
export function getKeywordExtractor(region?: string, profile?: string): KeywordExtractor {
  if (!extractorInstance) {
    extractorInstance = new KeywordExtractor(region, profile);
  }
  return extractorInstance;
}

/**
 * Reset the extractor singleton (mainly for testing)
 */
export function resetKeywordExtractor(): void {
  extractorInstance = null;
}
