import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock vscode before importing the parser
vi.mock('vscode', () => ({
  Position: class {
    constructor(
      public readonly line: number,
      public readonly character: number
    ) {}
  },
  Range: class {
    constructor(
      public readonly start: { line: number; character: number },
      public readonly end: { line: number; character: number }
    ) {}
    contains(pos: { line: number; character: number }): boolean {
      return (
        (pos.line > this.start.line ||
          (pos.line === this.start.line && pos.character >= this.start.character)) &&
        (pos.line < this.end.line ||
          (pos.line === this.end.line && pos.character <= this.end.character))
      );
    }
  },
}));

import {
  parseCitations,
  getUniqueCitationKeys,
  groupCitationsByKey,
} from '../../src/parsers/citationParser';

// Helper to create a mock document
function createMockDocument(content: string) {
  return {
    getText: () => content,
    positionAt: (offset: number) => {
      const text = content.substring(0, offset);
      const lines = text.split('\n');
      return {
        line: lines.length - 1,
        character: lines[lines.length - 1].length,
      };
    },
    languageId: 'markdown',
  } as any;
}

describe('citationParser', () => {
  describe('parseCitations', () => {
    it('should parse single bracket citation', () => {
      const doc = createMockDocument('This is a claim [@smith2023].');
      const citations = parseCitations(doc);

      expect(citations).toHaveLength(1);
      expect(citations[0].key).toBe('smith2023');
      expect(citations[0].type).toBe('bracket');
      expect(citations[0].fullText).toBe('[@smith2023]');
    });

    it('should parse bracket citation with page reference', () => {
      const doc = createMockDocument('According to the study [@jones2024, p. 42].');
      const citations = parseCitations(doc);

      expect(citations).toHaveLength(1);
      expect(citations[0].key).toBe('jones2024');
      expect(citations[0].pageRef).toBe('42');
    });

    it('should parse multiple citations in one bracket', () => {
      const doc = createMockDocument('Multiple studies support this [@smith2023; @jones2024].');
      const citations = parseCitations(doc);

      expect(citations).toHaveLength(2);
      expect(citations[0].key).toBe('smith2023');
      expect(citations[1].key).toBe('jones2024');
    });

    it('should parse inline citation', () => {
      const doc = createMockDocument('@smith2023 argues that this is true.');
      const citations = parseCitations(doc);

      expect(citations).toHaveLength(1);
      expect(citations[0].key).toBe('smith2023');
      expect(citations[0].type).toBe('inline');
    });

    it('should handle multiple paragraph with citations', () => {
      const doc = createMockDocument(
        'First paragraph [@author1].\n\nSecond paragraph with @author2 inline.'
      );
      const citations = parseCitations(doc);

      expect(citations).toHaveLength(2);
      expect(citations[0].key).toBe('author1');
      expect(citations[1].key).toBe('author2');
    });

    it('should parse citation keys with hyphens and colons', () => {
      const doc = createMockDocument('Citation [@smith-jones:2023].');
      const citations = parseCitations(doc);

      expect(citations).toHaveLength(1);
      expect(citations[0].key).toBe('smith-jones:2023');
    });

    it('should return empty array for document without citations', () => {
      const doc = createMockDocument('This is plain text without any citations.');
      const citations = parseCitations(doc);

      expect(citations).toHaveLength(0);
    });

    it('should parse page range references', () => {
      const doc = createMockDocument('Study findings [@author2023, pp. 42-45].');
      const citations = parseCitations(doc);

      expect(citations).toHaveLength(1);
      expect(citations[0].pageRef).toBe('42-45');
    });
  });

  describe('getUniqueCitationKeys', () => {
    it('should return unique keys', () => {
      const doc = createMockDocument(
        'First [@smith2023]. Second [@jones2024]. Third [@smith2023].'
      );
      const citations = parseCitations(doc);
      const keys = getUniqueCitationKeys(citations);

      expect(keys).toHaveLength(2);
      expect(keys).toContain('smith2023');
      expect(keys).toContain('jones2024');
    });
  });

  describe('groupCitationsByKey', () => {
    it('should group citations by key', () => {
      const doc = createMockDocument(
        'First [@smith2023]. Second [@jones2024]. Third [@smith2023].'
      );
      const citations = parseCitations(doc);
      const grouped = groupCitationsByKey(citations);

      expect(grouped.size).toBe(2);
      expect(grouped.get('smith2023')).toHaveLength(2);
      expect(grouped.get('jones2024')).toHaveLength(1);
    });
  });
});
