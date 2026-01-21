import * as vscode from 'vscode';
import { Citation, Paragraph } from '../types';

/**
 * Extract paragraphs from a Markdown document
 *
 * A paragraph is defined as a block of text separated by blank lines,
 * excluding code blocks, YAML frontmatter, and headings.
 */
export function parseParagraphs(document: vscode.TextDocument): Paragraph[] {
  const text = document.getText();
  const paragraphs: Paragraph[] = [];

  // Split by double newlines to get paragraph boundaries
  const lines = text.split('\n');
  let currentParagraph: string[] = [];
  let paragraphStartLine = 0;
  let inCodeBlock = false;
  let inFrontmatter = false;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const trimmedLine = line.trim();

    // Track YAML frontmatter
    if (i === 0 && trimmedLine === '---') {
      inFrontmatter = true;
      continue;
    }
    if (inFrontmatter) {
      if (trimmedLine === '---' || trimmedLine === '...') {
        inFrontmatter = false;
      }
      continue;
    }

    // Track code blocks
    if (trimmedLine.startsWith('```') || trimmedLine.startsWith('~~~')) {
      inCodeBlock = !inCodeBlock;
      // If we were building a paragraph, finalize it
      if (currentParagraph.length > 0 && !inCodeBlock) {
        paragraphs.push(createParagraph(document, currentParagraph, paragraphStartLine));
        currentParagraph = [];
      }
      continue;
    }

    if (inCodeBlock) {
      continue;
    }

    // Skip headings
    if (trimmedLine.startsWith('#')) {
      if (currentParagraph.length > 0) {
        paragraphs.push(createParagraph(document, currentParagraph, paragraphStartLine));
        currentParagraph = [];
      }
      continue;
    }

    // Empty line marks paragraph boundary
    if (trimmedLine === '') {
      if (currentParagraph.length > 0) {
        paragraphs.push(createParagraph(document, currentParagraph, paragraphStartLine));
        currentParagraph = [];
      }
      continue;
    }

    // Add line to current paragraph
    if (currentParagraph.length === 0) {
      paragraphStartLine = i;
    }
    currentParagraph.push(line);
  }

  // Don't forget the last paragraph
  if (currentParagraph.length > 0) {
    paragraphs.push(createParagraph(document, currentParagraph, paragraphStartLine));
  }

  return paragraphs;
}

/**
 * Create a Paragraph object from collected lines
 */
function createParagraph(
  document: vscode.TextDocument,
  lines: string[],
  startLine: number
): Paragraph {
  const endLine = startLine + lines.length - 1;
  const text = lines.join('\n');

  const range = new vscode.Range(
    new vscode.Position(startLine, 0),
    new vscode.Position(endLine, lines[lines.length - 1].length)
  );

  return {
    text,
    range,
    citations: [], // Will be populated later
  };
}

/**
 * Associate citations with their containing paragraphs
 */
export function associateCitationsWithParagraphs(
  paragraphs: Paragraph[],
  citations: Citation[]
): Paragraph[] {
  return paragraphs.map((paragraph) => ({
    ...paragraph,
    citations: citations.filter((citation) => paragraphContainsCitation(paragraph, citation)),
  }));
}

/**
 * Check if a paragraph contains a citation
 */
function paragraphContainsCitation(paragraph: Paragraph, citation: Citation): boolean {
  return paragraph.range.contains(citation.range);
}

/**
 * Get paragraphs that contain citations
 */
export function getParagraphsWithCitations(paragraphs: Paragraph[]): Paragraph[] {
  return paragraphs.filter((p) => p.citations.length > 0);
}

/**
 * Find the paragraph containing a specific position
 */
export function findParagraphAtPosition(
  paragraphs: Paragraph[],
  position: vscode.Position
): Paragraph | undefined {
  return paragraphs.find((p) => p.range.contains(position));
}
