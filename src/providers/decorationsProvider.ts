import * as vscode from 'vscode';
import { ValidationResult } from '../types';

/**
 * Manages text decorations for citation validation results
 */
export class DecorationsProvider {
  private supportedDecoration: vscode.TextEditorDecorationType;
  private partialDecoration: vscode.TextEditorDecorationType;
  private notSupportedDecoration: vscode.TextEditorDecorationType;

  constructor() {
    this.supportedDecoration = vscode.window.createTextEditorDecorationType({
      backgroundColor: 'rgba(40, 167, 69, 0.25)', // Green
      border: '1px solid rgba(40, 167, 69, 0.6)',
      borderRadius: '3px',
    });

    this.partialDecoration = vscode.window.createTextEditorDecorationType({
      backgroundColor: 'rgba(255, 193, 7, 0.25)', // Yellow
      border: '1px solid rgba(255, 193, 7, 0.6)',
      borderRadius: '3px',
    });

    this.notSupportedDecoration = vscode.window.createTextEditorDecorationType({
      backgroundColor: 'rgba(220, 53, 69, 0.25)', // Red
      border: '1px solid rgba(220, 53, 69, 0.6)',
      borderRadius: '3px',
    });
  }

  /**
   * Apply decorations to the editor based on validation results
   */
  applyDecorations(editor: vscode.TextEditor, results: ValidationResult[]): void {
    const supported: vscode.DecorationOptions[] = [];
    const partial: vscode.DecorationOptions[] = [];
    const notSupported: vscode.DecorationOptions[] = [];

    for (const result of results) {
      // Only apply visual decoration, hover is handled by HoverProvider
      const decoration: vscode.DecorationOptions = {
        range: result.citation.range,
      };

      switch (result.status) {
        case 'supported':
          supported.push(decoration);
          break;
        case 'partial':
          partial.push(decoration);
          break;
        case 'not_supported':
          notSupported.push(decoration);
          break;
      }
    }

    editor.setDecorations(this.supportedDecoration, supported);
    editor.setDecorations(this.partialDecoration, partial);
    editor.setDecorations(this.notSupportedDecoration, notSupported);
  }

  /**
   * Clear all decorations from an editor
   */
  clearDecorations(editor: vscode.TextEditor): void {
    editor.setDecorations(this.supportedDecoration, []);
    editor.setDecorations(this.partialDecoration, []);
    editor.setDecorations(this.notSupportedDecoration, []);
  }

  /**
   * Dispose of resources
   */
  dispose(): void {
    this.supportedDecoration.dispose();
    this.partialDecoration.dispose();
    this.notSupportedDecoration.dispose();
  }
}
