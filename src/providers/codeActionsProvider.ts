import * as vscode from 'vscode';
import { ValidationResult } from '../types';
import { parseCitations, findCitationAtPosition } from '../parsers/citationParser';

/**
 * Provides code actions for citations
 */
export class CodeActionsProvider implements vscode.CodeActionProvider {
  private validationResults: Map<string, ValidationResult[]> = new Map();

  static readonly providedCodeActionKinds = [
    vscode.CodeActionKind.QuickFix,
    vscode.CodeActionKind.RefactorRewrite,
  ];

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
   * Provide code actions
   */
  provideCodeActions(
    document: vscode.TextDocument,
    range: vscode.Range | vscode.Selection,
    _context: vscode.CodeActionContext,
    _token: vscode.CancellationToken
  ): vscode.CodeAction[] {
    const actions: vscode.CodeAction[] = [];

    // Check if we're on a citation
    const citations = parseCitations(document);
    const citation = findCitationAtPosition(citations, range.start);

    if (!citation) {
      return actions;
    }

    // Get validation result if available
    const results = this.validationResults.get(document.uri.toString());
    const validationResult = results?.find(
      (r) =>
        r.citation.key === citation.key &&
        r.citation.range.start.line === citation.range.start.line
    );

    // Always offer validation action
    const validateAction = new vscode.CodeAction(
      `Validate @${citation.key}`,
      vscode.CodeActionKind.QuickFix
    );
    validateAction.command = {
      command: 'paperIndex.validateCurrentCitation',
      title: 'Validate Citation',
      arguments: [citation.key],
    };
    actions.push(validateAction);

    // If validated and has supporting quotes, offer to insert quote
    if (validationResult?.supportingQuotes?.length) {
      for (const quote of validationResult.supportingQuotes.slice(0, 3)) {
        const insertQuoteAction = new vscode.CodeAction(
          `Insert supporting quote`,
          vscode.CodeActionKind.RefactorRewrite
        );

        const pageRef = quote.page ? ` (p. ${quote.page})` : '';
        const quoteText = `\n\n> "${quote.text}"${pageRef} ${citation.fullText}\n`;

        insertQuoteAction.edit = new vscode.WorkspaceEdit();
        insertQuoteAction.edit.insert(
          document.uri,
          new vscode.Position(citation.range.end.line + 1, 0),
          quoteText
        );
        actions.push(insertQuoteAction);
        break; // Only add one quote action for now
      }
    }

    // If not supported, offer to check paper index
    if (validationResult?.status === 'not_supported') {
      const checkPaperAction = new vscode.CodeAction(
        `Search paper index for @${citation.key}`,
        vscode.CodeActionKind.QuickFix
      );
      checkPaperAction.command = {
        command: 'paperIndex.searchPaper',
        title: 'Search Paper Index',
        arguments: [citation.key],
      };
      actions.push(checkPaperAction);
    }

    return actions;
  }

  /**
   * Dispose of resources
   */
  dispose(): void {
    this.validationResults.clear();
  }
}
