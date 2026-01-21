import * as vscode from 'vscode';
import { ValidationResult } from '../types';
import { parseCitations, findCitationAtPosition } from '../parsers/citationParser';

/**
 * Provides hover information for citations
 */
export class HoverProvider implements vscode.HoverProvider {
  private validationResults: Map<string, ValidationResult[]> = new Map();

  /**
   * Update validation results for a document
   */
  setValidationResults(documentUri: string, results: ValidationResult[]): void {
    this.validationResults.set(documentUri, results);
  }

  /**
   * Clear validation results for a document
   */
  clearValidationResults(documentUri: string): void {
    this.validationResults.delete(documentUri);
  }

  /**
   * Provide hover information
   */
  provideHover(
    document: vscode.TextDocument,
    position: vscode.Position,
    _token: vscode.CancellationToken
  ): vscode.Hover | undefined {
    // Check if position is on a citation
    const citations = parseCitations(document);
    const citation = findCitationAtPosition(citations, position);

    if (!citation) {
      return undefined;
    }

    // Look for validation result
    const results = this.validationResults.get(document.uri.toString());
    const validationResult = results?.find(
      (r) =>
        r.citation.key === citation.key &&
        r.citation.range.start.line === citation.range.start.line
    );

    if (validationResult) {
      return new vscode.Hover(this.createValidatedHover(validationResult), citation.range);
    }

    // No validation yet, show basic info
    return new vscode.Hover(this.createUnvalidatedHover(citation.key), citation.range);
  }

  /**
   * Create hover content for validated citation
   */
  private createValidatedHover(result: ValidationResult): vscode.MarkdownString {
    const md = new vscode.MarkdownString();
    md.isTrusted = true;

    const statusIcon = this.getStatusIcon(result.status);
    const confidence = Math.round(result.confidence * 100);

    md.appendMarkdown(`### ${statusIcon} Citation: \`@${result.citation.key}\`\n\n`);
    md.appendMarkdown(`**Status:** ${this.formatStatus(result.status)} (${confidence}%)\n\n`);
    md.appendMarkdown(`${result.explanation}\n\n`);

    if (result.paper) {
      md.appendMarkdown(`---\n\n`);
      md.appendMarkdown(`**📄 ${result.paper.title}**\n\n`);
      if (result.paper.author) {
        md.appendMarkdown(`*${result.paper.author}*\n\n`);
      }
      if (result.paper.year) {
        md.appendMarkdown(`Year: ${result.paper.year}\n\n`);
      }
    }

    if (result.supportingQuotes?.length) {
      md.appendMarkdown(`---\n\n`);
      md.appendMarkdown(`**Supporting Evidence:**\n\n`);
      for (const quote of result.supportingQuotes.slice(0, 3)) {
        const pageRef = quote.page ? ` *(p. ${quote.page})*` : '';
        md.appendMarkdown(`> "${quote.text}"${pageRef}\n\n`);
      }
      if (result.supportingQuotes.length > 3) {
        md.appendMarkdown(`*...and ${result.supportingQuotes.length - 3} more quotes*\n\n`);
      }
    }

    // Show model used for validation
    if (result.modelId) {
      md.appendMarkdown(`---\n\n`);
      md.appendMarkdown(`*Model: \`${this.formatModelId(result.modelId)}\`*\n`);
    }

    return md;
  }

  /**
   * Format model ID for display (extract readable name)
   */
  private formatModelId(modelId: string): string {
    // Extract model name from full ID
    // e.g., "global.anthropic.claude-sonnet-4-20250514-v1:0" → "claude-sonnet-4"
    const match = modelId.match(/claude-[a-z0-9-]+/i);
    return match ? match[0] : modelId;
  }

  /**
   * Create hover content for unvalidated citation
   */
  private createUnvalidatedHover(key: string): vscode.MarkdownString {
    const md = new vscode.MarkdownString();
    md.isTrusted = true;

    md.appendMarkdown(`### Citation: \`@${key}\`\n\n`);
    md.appendMarkdown(`*Not yet validated*\n\n`);
    md.appendMarkdown(
      `[$(beaker) Validate](command:paperIndex.validateCurrentCitation?${encodeURIComponent(JSON.stringify([key]))})`
    );

    return md;
  }

  /**
   * Get status icon
   */
  private getStatusIcon(status: string): string {
    switch (status) {
      case 'supported':
        return '✅';
      case 'partial':
        return '⚠️';
      case 'not_supported':
        return '❌';
      default:
        return '❓';
    }
  }

  /**
   * Format status text
   */
  private formatStatus(status: string): string {
    switch (status) {
      case 'supported':
        return 'Supported';
      case 'partial':
        return 'Partially Supported';
      case 'not_supported':
        return 'Not Supported';
      default:
        return 'Unknown';
    }
  }

  /**
   * Dispose of resources
   */
  dispose(): void {
    this.validationResults.clear();
  }
}
