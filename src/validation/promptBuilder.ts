import { Quote, ValidationRequest } from '../types';

/**
 * Build the validation prompt for Claude
 */
export function buildValidationPrompt(request: ValidationRequest): string {
  const quotesSection = formatQuotes(request.quotes);

  return `You are a strict academic citation validator. Your task is to determine if a cited paper supports the claims made about it.

## Citation to Validate
Paper: "${request.paperTitle}" (citation key: @${request.citationKey})

## Claim Context (paragraph containing the citation)
${request.paragraphText}

## Evidence from the Paper
Title: ${request.paperTitle}
${request.paperAbstract ? `Abstract: ${request.paperAbstract}\n` : ''}
${quotesSection ? `Indexed Quotes:\n${quotesSection}` : 'No quotes indexed for this paper.'}

## Validation Process

**START WITH "not_supported" AS THE DEFAULT. Then look for evidence to upgrade the status.**

### Step 1: Topic Relevance Check
First, check if the paper's subject matter (from title/abstract) is even relevant to the claim being made.
- If the paper is about a COMPLETELY DIFFERENT SUBJECT → STOP, return "not_supported"
- Example: Citing a paper about "Dark Triad personality traits" for a claim about "formal vs informal leadership" → not_supported
- Example: Citing a paper about "COVID-19 work-from-home effects" for a claim about "leadership definition" → not_supported

### Step 2: Search for Supporting Evidence
If the topic is relevant, actively search the quotes and abstract for evidence that supports the specific claim:
- Look for direct statements that match what the paragraph claims
- Look for indirect support or related concepts
- Be generous in interpretation but honest about the strength of evidence

### Step 3: Determine Final Status

**"supported"** (confidence 0.8-1.0) - ONLY if you found:
- Direct quotes or abstract text that explicitly state what the paragraph claims
- Clear, unambiguous evidence supporting the specific claim

**"partial"** (confidence 0.4-0.79) - If you found:
- The paper discusses related concepts but doesn't directly make the claimed argument
- Some aspects of the claim are supported, others are not
- The connection requires reasonable inference

**"not_supported"** (confidence 0.0-0.39) - If:
- The paper's topic is unrelated to the claim
- No evidence connects the paper's content to what is claimed about it
- The paragraph mischaracterizes what the paper is about

## Response Format
Return ONLY a JSON object:
{
  "status": "supported" | "partial" | "not_supported",
  "confidence": <number 0.0-1.0>,
  "explanation": "<your reasoning - if not_supported, explain why the paper doesn't match the claim>",
  "supportingQuoteIndices": [<1-based quote indices that support the claim, empty array [] if none>]
}`;
}

/**
 * Format quotes for the prompt
 */
function formatQuotes(quotes: Quote[]): string {
  if (quotes.length === 0) {
    return '';
  }

  return quotes
    .map((quote, index) => {
      const pageInfo = quote.page ? ` (p. ${quote.page})` : '';
      return `[Quote ${index + 1}]${pageInfo}
"${quote.text}"`;
    })
    .join('\n\n');
}

/**
 * Parse the LLM response
 */
export function parseValidationResponse(response: string): {
  status: 'supported' | 'partial' | 'not_supported';
  confidence: number;
  explanation: string;
  supportingQuoteIndices?: number[];
} {
  // Try to extract JSON from the response
  const jsonMatch = response.match(/\{[\s\S]*\}/);

  if (!jsonMatch) {
    throw new Error('No JSON found in response');
  }

  const parsed = JSON.parse(jsonMatch[0]);

  // Validate required fields
  if (!parsed.status || typeof parsed.confidence !== 'number' || !parsed.explanation) {
    throw new Error('Invalid response format: missing required fields');
  }

  // Validate status enum
  if (!['supported', 'partial', 'not_supported'].includes(parsed.status)) {
    throw new Error(`Invalid status value: ${parsed.status}`);
  }

  // Clamp confidence to [0, 1]
  const confidence = Math.max(0, Math.min(1, parsed.confidence));

  return {
    status: parsed.status,
    confidence,
    explanation: parsed.explanation,
    supportingQuoteIndices: parsed.supportingQuoteIndices,
  };
}
