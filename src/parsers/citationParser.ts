import * as vscode from 'vscode';
import { Citation } from '../types';

/**
 * Regex patterns for Pandoc citation formats
 *
 * Bracket citations: [@author2023], [@author2023, p. 42], [@author2023; @smith2024]
 * Inline citations: @author2023, @smith2024
 */

// Matches a single citation key: @author2023
const CITATION_KEY_PATTERN = /@([a-zA-Z][a-zA-Z0-9_:-]*)/g;

// Matches bracket citations: [@key], [@key, p. 42], [@key; @key2]
const BRACKET_CITATION_PATTERN = /\[([^\]]*@[a-zA-Z][a-zA-Z0-9_:-]*[^\]]*)\]/g;

// Matches page reference within a citation: p. 42, pp. 42-45, page 42
const PAGE_REF_PATTERN = /(?:pp?\.|pages?)\s*(\d+(?:\s*[-–]\s*\d+)?)/i;

/**
 * Parse all citations from a document
 */
export function parseCitations(document: vscode.TextDocument): Citation[] {
  const text = document.getText();
  const citations: Citation[] = [];

  // Track positions we've already captured to avoid duplicates
  const capturedRanges: Set<string> = new Set();

  // First, find all bracket citations
  let match: RegExpExecArray | null;
  BRACKET_CITATION_PATTERN.lastIndex = 0;

  while ((match = BRACKET_CITATION_PATTERN.exec(text)) !== null) {
    const fullMatch = match[0];
    const innerContent = match[1];
    const startOffset = match.index;
    const endOffset = startOffset + fullMatch.length;

    const startPos = document.positionAt(startOffset);
    const endPos = document.positionAt(endOffset);
    const range = new vscode.Range(startPos, endPos);
    const rangeKey = `${startOffset}-${endOffset}`;

    // Extract individual citation keys from the bracket
    const keyMatches = innerContent.matchAll(/@([a-zA-Z][a-zA-Z0-9_:-]*)/g);

    for (const keyMatch of keyMatches) {
      const key = keyMatch[1];
      const pageRef = extractPageRef(innerContent);

      // Mark this range as captured
      capturedRanges.add(rangeKey);

      citations.push({
        key,
        fullText: fullMatch,
        range,
        pageRef,
        type: 'bracket',
      });
    }
  }

  // Then, find inline citations (not inside brackets)
  CITATION_KEY_PATTERN.lastIndex = 0;

  while ((match = CITATION_KEY_PATTERN.exec(text)) !== null) {
    const fullMatch = match[0];
    const key = match[1];
    const startOffset = match.index;
    const endOffset = startOffset + fullMatch.length;

    // Check if this citation is inside a bracket citation we already captured
    const isInsideBracket = isCitationInsideBracket(text, startOffset);

    if (!isInsideBracket) {
      const startPos = document.positionAt(startOffset);
      const endPos = document.positionAt(endOffset);
      const range = new vscode.Range(startPos, endPos);

      citations.push({
        key,
        fullText: fullMatch,
        range,
        type: 'inline',
      });
    }
  }

  return citations;
}

/**
 * Extract page reference from citation text
 */
function extractPageRef(citationText: string): string | undefined {
  const match = PAGE_REF_PATTERN.exec(citationText);
  return match ? match[1] : undefined;
}

/**
 * Check if a position is inside a bracket
 */
function isCitationInsideBracket(text: string, position: number): boolean {
  // Look backwards for [ and forwards for ]
  let bracketDepth = 0;

  // Check backwards
  for (let i = position - 1; i >= 0; i--) {
    if (text[i] === ']') {
      bracketDepth++;
    } else if (text[i] === '[') {
      if (bracketDepth === 0) {
        // Found opening bracket, now check if there's a closing bracket after position
        for (let j = position; j < text.length; j++) {
          if (text[j] === '[') {
            break;
          }
          if (text[j] === ']') {
            return true;
          }
        }
        return false;
      }
      bracketDepth--;
    }
  }

  return false;
}

/**
 * Get all unique citation keys from a document
 */
export function getUniqueCitationKeys(citations: Citation[]): string[] {
  return [...new Set(citations.map((c) => c.key))];
}

/**
 * Find citation at a specific position
 */
export function findCitationAtPosition(
  citations: Citation[],
  position: vscode.Position
): Citation | undefined {
  return citations.find((c) => c.range.contains(position));
}

/**
 * Group citations by their key
 */
export function groupCitationsByKey(citations: Citation[]): Map<string, Citation[]> {
  const grouped = new Map<string, Citation[]>();

  for (const citation of citations) {
    const existing = grouped.get(citation.key) || [];
    existing.push(citation);
    grouped.set(citation.key, existing);
  }

  return grouped;
}
