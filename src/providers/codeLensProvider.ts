import * as vscode from 'vscode';
import { Citation } from '../types';
import { parseCitations, groupCitationsByKey } from '../parsers/citationParser';

/**
 * Provides CodeLens for validating citations
 */
export class CodeLensProvider implements vscode.CodeLensProvider {
  private _onDidChangeCodeLenses = new vscode.EventEmitter<void>();
  public readonly onDidChangeCodeLenses = this._onDidChangeCodeLenses.event;

  /**
   * Refresh code lenses
   */
  refresh(): void {
    this._onDidChangeCodeLenses.fire();
  }

  /**
   * Provide code lenses for a document
   */
  provideCodeLenses(
    document: vscode.TextDocument,
    _token: vscode.CancellationToken
  ): vscode.CodeLens[] {
    if (document.languageId !== 'markdown') {
      return [];
    }

    const citations = parseCitations(document);
    const grouped = groupCitationsByKey(citations);
    const codeLenses: vscode.CodeLens[] = [];

    // Add a "Validate All" lens at the top of the document
    if (citations.length > 0) {
      const firstLine = new vscode.Range(0, 0, 0, 0);
      codeLenses.push(
        new vscode.CodeLens(firstLine, {
          title: `$(beaker) Validate All Citations (${grouped.size} unique)`,
          command: 'paperIndex.validateCitations',
          tooltip: 'Validate all citations in this document',
        })
      );
    }

    // Add individual "Validate" lens for each unique citation (at first occurrence)
    for (const [key, citationList] of grouped) {
      const firstCitation = citationList[0];
      const count = citationList.length;
      const countText = count > 1 ? ` (${count} occurrences)` : '';

      codeLenses.push(
        new vscode.CodeLens(firstCitation.range, {
          title: `$(beaker) Validate @${key}${countText}`,
          command: 'paperIndex.validateCurrentCitation',
          arguments: [key],
          tooltip: `Validate citation @${key}`,
        })
      );
    }

    return codeLenses;
  }

  /**
   * Dispose of resources
   */
  dispose(): void {
    this._onDidChangeCodeLenses.dispose();
  }
}
