import { Quote, ValidationRequest, Fragment } from '../types';

/**
 * Build the validation prompt for Claude
 */
export function buildValidationPrompt(request: ValidationRequest): string {
  const quotesSection = formatQuotes(request.quotes);
  const fileContentSection = request.fileContent
    ? `\n## Full Source Content\nThe complete source document is provided below for thorough validation:\n\n${request.fileContent}\n`
    : '';

  // Build paper metadata section
  const metadataLines: string[] = [];
  metadataLines.push(`Title: ${request.paperTitle}`);
  if (request.paperAuthor) {
    metadataLines.push(`Author: ${request.paperAuthor}`);
  }
  if (request.paperYear) {
    metadataLines.push(`Year: ${request.paperYear}`);
  }
  if (request.paperJournal) {
    metadataLines.push(`Journal: ${request.paperJournal}`);
  }
  if (request.paperDoi) {
    metadataLines.push(`DOI: ${request.paperDoi}`);
  }
  if (request.paperPeerReviewed !== undefined) {
    metadataLines.push(`Peer Reviewed: ${request.paperPeerReviewed ? 'Yes' : 'No'}`);
  }
  if (request.paperEntryType) {
    metadataLines.push(`Source Type: ${request.paperEntryType}`);
  }

  // Build extended evidence sections
  const abstractSection = request.paperAbstract ? `\n### Abstract\n${request.paperAbstract}\n` : '';
  const questionSection = request.paperQuestion ? `\n### Research Question\n${request.paperQuestion}\n` : '';
  const methodSection = request.paperMethod ? `\n### Method\n${request.paperMethod}\n` : '';
  const resultsSection = request.paperResults ? `\n### Results\n${request.paperResults}\n` : '';
  const interpretationSection = request.paperInterpretation ? `\n### Interpretation\n${request.paperInterpretation}\n` : '';
  const claimsSection = request.paperClaims ? `\n### Key Claims\n${request.paperClaims}\n` : '';

  // Build keyword fragments section
  const fragmentsSection = formatFragments(request.keywordFragments);

  return `You are a strict academic citation validator. Your task is to determine if a cited paper supports the claims made about it.

## Citation to Validate
Paper: "${request.paperTitle}" (citation key: @${request.citationKey})

## Claim Context (paragraph containing the citation)
${request.paragraphText}

## Evidence from the Paper

### Metadata
${metadataLines.join('\n')}
${abstractSection}${questionSection}${methodSection}${resultsSection}${interpretationSection}${claimsSection}
### Indexed Quotes
${quotesSection || 'No quotes indexed for this paper.'}
${fragmentsSection}${fileContentSection}

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

### Step 3: Determine Final Status (adjusted by source type)

The source type affects how strictly you evaluate the claim:

**For paper (peer-reviewed)**: Strictest evaluation
- Claim must closely match what the paper actually states
- Confidence 0.85+ required for "supported"
- Generalizations or interpretations beyond the data → partial

**For book**: Moderate evaluation
- Broader interpretations acceptable
- Confidence 0.75+ required for "supported"
- Author's opinions/frameworks can support claims about those frameworks

**For media (video/podcast/blog)**: Most lenient evaluation
- Illustrative use is acceptable ("X demonstrates..." or "X shows...")
- Confidence 0.60+ required for "supported"
- First-person statements from the subject are strong evidence
- Example: Nadella saying "I believe in empathy" in an interview supports claims about his empathic leadership style

### Claim Type Considerations
- **Factual claim** ("X published Y in Z"): Requires exact match regardless of source type
- **Illustrative claim** ("X demonstrates Y"): Source type thresholds apply
- **Theoretical claim** ("Research shows X"): Requires academic source (paper/book)

### Status Definitions

**"supported"** - You found:
- Direct quotes or abstract text that explicitly state what the paragraph claims
- Clear, unambiguous evidence supporting the specific claim
- Confidence threshold met for the source type

**"partial"** - You found:
- The source discusses related concepts but doesn't directly make the claimed argument
- Some aspects of the claim are supported, others are not
- The connection requires reasonable inference

**"not_supported"** (confidence 0.0-0.39) - If:
- The source's topic is unrelated to the claim
- No evidence connects the source's content to what is claimed about it
- The paragraph mischaracterizes what the source is about

## Response Format
Return ONLY a JSON object:
{
  "status": "supported" | "partial" | "not_supported",
  "confidence": <number 0.0-1.0>,
  "explanation": "<your reasoning - if not_supported, explain why the paper doesn't match the claim>",
  "supportingQuoteIndices": [<1-based quote indices that support the claim, empty array [] if none>],
  "rephrase": "<ONLY for supported/partial: suggest how to rephrase the claim to achieve higher confidence or full support. Omit this field entirely for not_supported.>"
}

### Rephrase Guidelines
- For **supported**: If confidence < 1.0, suggest minor refinements to make the claim more precise and boost confidence
- For **partial**: Suggest how to rephrase the claim so it accurately reflects what the paper actually says, aiming for "supported" status
- For **not_supported**: Do NOT include a rephrase field - the citation is simply wrong for this claim`;
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
 * Format keyword search fragments for the prompt
 */
function formatFragments(fragments?: Fragment[]): string {
  if (!fragments || fragments.length === 0) {
    return '';
  }

  const formattedFragments = fragments
    .map((fragment, index) => {
      const text = fragment.lines.join('\n');
      return `[Fragment ${index + 1}] (lines ${fragment.line_start}-${fragment.line_end})
${text}`;
    })
    .join('\n\n');

  return `\n### Keyword Search Fragments (from full text)
The following text fragments were found by searching the paper for keywords related to the claim:

${formattedFragments}
`;
}

/**
 * Parse the LLM response
 */
export function parseValidationResponse(response: string): {
  status: 'supported' | 'partial' | 'not_supported';
  confidence: number;
  explanation: string;
  supportingQuoteIndices?: number[];
  rephrase?: string;
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
    rephrase: parsed.rephrase,
  };
}
