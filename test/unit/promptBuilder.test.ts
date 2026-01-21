import { describe, it, expect } from 'vitest';
import {
  buildValidationPrompt,
  parseValidationResponse,
} from '../../src/validation/promptBuilder';
import { ValidationRequest, Quote } from '../../src/types';

describe('promptBuilder', () => {
  describe('buildValidationPrompt', () => {
    it('should build prompt with all fields', () => {
      const request: ValidationRequest = {
        paragraphText: 'Machine learning has transformed data analysis [@smith2023].',
        citationKey: 'smith2023',
        paperTitle: 'Advances in Machine Learning',
        paperAbstract: 'This paper explores recent advances in ML.',
        quotes: [
          {
            text: 'ML has fundamentally changed how we analyze data.',
            page: 15,
          },
        ],
      };

      const prompt = buildValidationPrompt(request);

      expect(prompt).toContain('smith2023');
      expect(prompt).toContain('Advances in Machine Learning');
      expect(prompt).toContain('Machine learning has transformed');
      expect(prompt).toContain('ML has fundamentally changed');
      expect(prompt).toContain('p. 15');
    });

    it('should handle empty quotes array', () => {
      const request: ValidationRequest = {
        paragraphText: 'Some claim [@author2024].',
        citationKey: 'author2024',
        paperTitle: 'Paper Title',
        quotes: [],
      };

      const prompt = buildValidationPrompt(request);

      expect(prompt).toContain('No quotes indexed for this paper');
    });

    it('should handle missing abstract', () => {
      const request: ValidationRequest = {
        paragraphText: 'Some claim [@author2024].',
        citationKey: 'author2024',
        paperTitle: 'Paper Title',
        quotes: [],
      };

      const prompt = buildValidationPrompt(request);

      expect(prompt).not.toContain('Abstract:');
    });
  });

  describe('parseValidationResponse', () => {
    it('should parse valid JSON response', () => {
      const response = JSON.stringify({
        status: 'supported',
        confidence: 0.85,
        explanation: 'The claim is well supported.',
        supportingQuoteIndices: [1, 2],
      });

      const result = parseValidationResponse(response);

      expect(result.status).toBe('supported');
      expect(result.confidence).toBe(0.85);
      expect(result.explanation).toBe('The claim is well supported.');
      expect(result.supportingQuoteIndices).toEqual([1, 2]);
    });

    it('should extract JSON from text with surrounding content', () => {
      const response = `Here is my analysis:

      {"status": "partial", "confidence": 0.6, "explanation": "Partially supported."}

      That concludes my assessment.`;

      const result = parseValidationResponse(response);

      expect(result.status).toBe('partial');
      expect(result.confidence).toBe(0.6);
    });

    it('should clamp confidence to valid range', () => {
      const response = JSON.stringify({
        status: 'supported',
        confidence: 1.5,
        explanation: 'Test',
      });

      const result = parseValidationResponse(response);

      expect(result.confidence).toBe(1);
    });

    it('should throw on missing required fields', () => {
      const response = JSON.stringify({
        status: 'supported',
        // missing confidence and explanation
      });

      expect(() => parseValidationResponse(response)).toThrow();
    });

    it('should throw on invalid status value', () => {
      const response = JSON.stringify({
        status: 'invalid_status',
        confidence: 0.5,
        explanation: 'Test',
      });

      expect(() => parseValidationResponse(response)).toThrow('Invalid status value');
    });

    it('should throw when no JSON found', () => {
      const response = 'This response contains no JSON';

      expect(() => parseValidationResponse(response)).toThrow('No JSON found');
    });
  });
});
