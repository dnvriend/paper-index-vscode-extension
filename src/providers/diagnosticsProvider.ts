import * as vscode from 'vscode';
import { ValidationResult, ValidationStatus } from '../types';

const DIAGNOSTIC_SOURCE = 'Paper Index';

/**
 * Manages VS Code diagnostics for citation validation results
 */
export class DiagnosticsProvider {
  private diagnosticCollection: vscode.DiagnosticCollection;

  constructor() {
    this.diagnosticCollection = vscode.languages.createDiagnosticCollection(DIAGNOSTIC_SOURCE);
  }

  /**
   * Update diagnostics for a document based on validation results
   */
  updateDiagnostics(document: vscode.TextDocument, results: ValidationResult[]): void {
    const diagnostics: vscode.Diagnostic[] = results.map((result) =>
      this.createDiagnostic(result)
    );

    this.diagnosticCollection.set(document.uri, diagnostics);
  }

  /**
   * Clear diagnostics for a document
   */
  clearDiagnostics(document: vscode.TextDocument): void {
    this.diagnosticCollection.delete(document.uri);
  }

  /**
   * Clear all diagnostics
   */
  clearAll(): void {
    this.diagnosticCollection.clear();
  }

  /**
   * Dispose of resources
   */
  dispose(): void {
    this.diagnosticCollection.dispose();
  }

  /**
   * Create a diagnostic from a validation result
   */
  private createDiagnostic(result: ValidationResult): vscode.Diagnostic {
    const severity = this.mapStatusToSeverity(result.status);
    const message = this.formatMessage(result);

    const diagnostic = new vscode.Diagnostic(result.citation.range, message, severity);

    diagnostic.source = DIAGNOSTIC_SOURCE;
    diagnostic.code = result.citation.key;

    return diagnostic;
  }

  /**
   * Map validation status to diagnostic severity
   */
  private mapStatusToSeverity(status: ValidationStatus): vscode.DiagnosticSeverity {
    switch (status) {
      case 'supported':
        return vscode.DiagnosticSeverity.Information;
      case 'partial':
        return vscode.DiagnosticSeverity.Warning;
      case 'not_supported':
        return vscode.DiagnosticSeverity.Error;
    }
  }

  /**
   * Format the diagnostic message
   */
  private formatMessage(result: ValidationResult): string {
    const confidence = Math.round(result.confidence * 100);
    const statusLabel = this.formatStatus(result.status);
    const sourceType = result.paper?.entryType ? ` [${result.paper.entryType}]` : '';

    return `[${statusLabel}]${sourceType} @${result.citation.key} (${confidence}% confidence): ${result.explanation}`;
  }

  /**
   * Format status for display
   */
  private formatStatus(status: ValidationStatus): string {
    switch (status) {
      case 'supported':
        return 'Supported';
      case 'partial':
        return 'Partially Supported';
      case 'not_supported':
        return 'Not Supported';
    }
  }
}
