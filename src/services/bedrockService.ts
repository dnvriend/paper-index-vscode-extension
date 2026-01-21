import {
  BedrockRuntimeClient,
  InvokeModelCommand,
  InvokeModelCommandInput,
} from '@aws-sdk/client-bedrock-runtime';
import { STSClient, GetCallerIdentityCommand } from '@aws-sdk/client-sts';
import { fromIni } from '@aws-sdk/credential-providers';
import { ValidationRequest, LLMValidationResponse } from '../types';
import { buildValidationPrompt, parseValidationResponse } from '../validation/promptBuilder';

/**
 * Service for interacting with AWS Bedrock Claude
 */
export class BedrockService {
  private client: BedrockRuntimeClient | null = null;
  private stsClient: STSClient | null = null;
  private region: string;
  private modelId: string;
  private profile?: string;
  private accountId: string | null = null;

  constructor(region: string, modelId: string, profile?: string) {
    this.region = region;
    this.modelId = modelId;
    this.profile = profile;
  }

  /**
   * Update configuration
   */
  configure(region: string, modelId: string, profile?: string): void {
    this.region = region;
    this.modelId = modelId;
    this.profile = profile;
    this.client = null; // Force client recreation
    this.stsClient = null;
    this.accountId = null; // Reset account ID cache
  }

  /**
   * Get credentials config based on profile
   */
  private getCredentialsConfig(): { credentials?: ReturnType<typeof fromIni> } {
    if (this.profile) {
      return { credentials: fromIni({ profile: this.profile }) };
    }
    return {};
  }

  /**
   * Get or create the Bedrock client
   */
  private getClient(): BedrockRuntimeClient {
    if (!this.client) {
      this.client = new BedrockRuntimeClient({
        region: this.region,
        ...this.getCredentialsConfig(),
      });
    }
    return this.client;
  }

  /**
   * Get or create the STS client
   */
  private getStsClient(): STSClient {
    if (!this.stsClient) {
      this.stsClient = new STSClient({
        region: this.region,
        ...this.getCredentialsConfig(),
      });
    }
    return this.stsClient;
  }

  /**
   * Get AWS account ID from credentials
   */
  private async getAccountId(): Promise<string> {
    if (this.accountId) {
      return this.accountId;
    }

    const stsClient = this.getStsClient();
    const command = new GetCallerIdentityCommand({});
    const response = await stsClient.send(command);

    if (!response.Account) {
      throw new Error('Could not determine AWS account ID');
    }

    this.accountId = response.Account;
    return this.accountId;
  }

  /**
   * Build the full model ID or inference profile ARN
   *
   * If the model ID starts with "global." it's an inference profile
   * and we need to construct the full ARN.
   */
  private async resolveModelId(): Promise<string> {
    // If it's an inference profile (starts with "global.")
    if (this.modelId.startsWith('global.')) {
      const accountId = await this.getAccountId();
      return `arn:aws:bedrock:${this.region}:${accountId}:inference-profile/${this.modelId}`;
    }

    // Regular model ID, return as-is
    return this.modelId;
  }

  /**
   * Validate a citation against paper content
   */
  async validateCitation(request: ValidationRequest): Promise<LLMValidationResponse> {
    const prompt = buildValidationPrompt(request);

    const response = await this.invokeModel(prompt);
    return parseValidationResponse(response);
  }

  /**
   * Invoke the Claude model
   */
  private async invokeModel(prompt: string): Promise<string> {
    const client = this.getClient();
    const resolvedModelId = await this.resolveModelId();

    // Debug: Log the prompt being sent
    console.log('=== BEDROCK REQUEST ===');
    console.log('Model:', resolvedModelId);
    console.log('Prompt:\n', prompt);
    console.log('=== END PROMPT ===');

    const body = JSON.stringify({
      anthropic_version: 'bedrock-2023-05-31',
      max_tokens: 1024,
      messages: [
        {
          role: 'user',
          content: prompt,
        },
      ],
    });

    const input: InvokeModelCommandInput = {
      modelId: resolvedModelId,
      contentType: 'application/json',
      accept: 'application/json',
      body: new TextEncoder().encode(body),
    };

    const command = new InvokeModelCommand(input);
    const response = await client.send(command);

    const responseBody = new TextDecoder().decode(response.body);
    const parsed = JSON.parse(responseBody);

    // Debug: Log the raw response
    console.log('=== BEDROCK RESPONSE ===');
    console.log('Raw JSON:', responseBody);
    console.log('=== END RESPONSE ===');

    // Extract content from Claude's response format
    if (parsed.content && Array.isArray(parsed.content) && parsed.content.length > 0) {
      const text = parsed.content[0].text;
      console.log('=== EXTRACTED TEXT ===');
      console.log(text);
      console.log('=== END EXTRACTED ===');
      return text;
    }

    throw new Error('Unexpected response format from Bedrock');
  }

  /**
   * Check if the service is configured and accessible
   */
  async isAvailable(): Promise<boolean> {
    try {
      // Just try to create the client - actual validation would require a test invocation
      this.getClient();
      return true;
    } catch {
      return false;
    }
  }
}

// Singleton instance
let serviceInstance: BedrockService | null = null;

/**
 * Get or create the Bedrock service singleton
 */
export function getBedrockService(
  region?: string,
  modelId?: string,
  profile?: string
): BedrockService {
  if (!serviceInstance) {
    serviceInstance = new BedrockService(
      region || 'us-east-1',
      modelId || 'global.anthropic.claude-sonnet-4-20250514-v1:0',
      profile
    );
  } else if (region !== undefined && modelId !== undefined) {
    serviceInstance.configure(region, modelId, profile);
  }
  return serviceInstance;
}

/**
 * Reset the service singleton (mainly for testing)
 */
export function resetBedrockService(): void {
  serviceInstance = null;
}
