import * as vscode from 'vscode';
import { getConfig, onConfigurationChanged } from './config/settings';
import { parseCitations } from './parsers/citationParser';
import { parseParagraphs, associateCitationsWithParagraphs } from './parsers/paragraphParser';
import { getPaperIndexService } from './services/paperIndexService';
import { getBedrockService } from './services/bedrockService';
import { getCacheService } from './services/cacheService';
import { getValidator } from './validation/validator';
import { DiagnosticsProvider } from './providers/diagnosticsProvider';
import { DecorationsProvider } from './providers/decorationsProvider';
import { CodeLensProvider } from './providers/codeLensProvider';
import { HoverProvider } from './providers/hoverProvider';
import { CodeActionsProvider } from './providers/codeActionsProvider';
import { ValidationResult } from './types';

let diagnosticsProvider: DiagnosticsProvider;
let decorationsProvider: DecorationsProvider;
let codeLensProvider: CodeLensProvider;
let hoverProvider: HoverProvider;
let codeActionsProvider: CodeActionsProvider;

export function activate(context: vscode.ExtensionContext): void {
  console.log('Paper Index extension activating...');

  // Initialize configuration
  const config = getConfig();

  // Initialize services
  getPaperIndexService(config.cliPath);
  getBedrockService(config.bedrock.region, config.bedrock.model, config.bedrock.profile);
  getCacheService(config.cache.ttlSeconds);

  // Initialize providers
  diagnosticsProvider = new DiagnosticsProvider();
  decorationsProvider = new DecorationsProvider();
  codeLensProvider = new CodeLensProvider();
  hoverProvider = new HoverProvider();
  codeActionsProvider = new CodeActionsProvider();

  // Register providers
  context.subscriptions.push(
    vscode.languages.registerCodeLensProvider({ language: 'markdown' }, codeLensProvider),
    vscode.languages.registerHoverProvider({ language: 'markdown' }, hoverProvider),
    vscode.languages.registerCodeActionsProvider(
      { language: 'markdown' },
      codeActionsProvider,
      {
        providedCodeActionKinds: CodeActionsProvider.providedCodeActionKinds,
      }
    )
  );

  // Register commands
  context.subscriptions.push(
    vscode.commands.registerCommand('paperIndex.validateCitations', validateAllCitations),
    vscode.commands.registerCommand(
      'paperIndex.validateCurrentCitation',
      validateCurrentCitation
    ),
    vscode.commands.registerCommand('paperIndex.clearCache', clearCache),
    vscode.commands.registerCommand('paperIndex.searchPaper', searchPaper),
    vscode.commands.registerCommand('paperIndex.copyRephrase', copyRephrase)
  );

  // Listen for configuration changes
  context.subscriptions.push(
    onConfigurationChanged((newConfig) => {
      getPaperIndexService(newConfig.cliPath);
      getBedrockService(
        newConfig.bedrock.region,
        newConfig.bedrock.model,
        newConfig.bedrock.profile
      );
      getCacheService(newConfig.cache.ttlSeconds);
    })
  );

  // Listen for document save (optional validation)
  context.subscriptions.push(
    vscode.workspace.onDidSaveTextDocument((document) => {
      if (document.languageId === 'markdown' && getConfig().validateOnSave) {
        validateAllCitations();
      }
    })
  );

  // Listen for active editor changes
  context.subscriptions.push(
    vscode.window.onDidChangeActiveTextEditor((editor) => {
      if (editor && editor.document.languageId === 'markdown') {
        codeLensProvider.refresh();
      }
    })
  );

  // Clean up on deactivate
  context.subscriptions.push(
    diagnosticsProvider,
    decorationsProvider,
    codeLensProvider,
    hoverProvider,
    codeActionsProvider
  );

  console.log('Paper Index extension activated');
}

export function deactivate(): void {
  getCacheService().clear();
  console.log('Paper Index extension deactivated');
}

/**
 * Validate all citations in the active document
 */
async function validateAllCitations(): Promise<void> {
  const editor = vscode.window.activeTextEditor;
  if (!editor || editor.document.languageId !== 'markdown') {
    vscode.window.showWarningMessage('Please open a Markdown file to validate citations.');
    return;
  }

  const document = editor.document;
  const citations = parseCitations(document);

  if (citations.length === 0) {
    vscode.window.showInformationMessage('No citations found in this document.');
    return;
  }

  await vscode.window.withProgress(
    {
      location: vscode.ProgressLocation.Notification,
      title: 'Validating citations...',
      cancellable: true,
    },
    async (progress, token) => {
      const paragraphs = parseParagraphs(document);
      const paragraphsWithCitations = associateCitationsWithParagraphs(paragraphs, citations);
      const validator = getValidator();

      const results = await validator.validateDocument(
        citations,
        paragraphsWithCitations,
        progress
      );

      if (token.isCancellationRequested) {
        return;
      }

      applyValidationResults(document, results);

      const summary = summarizeResults(results);
      vscode.window.showInformationMessage(
        `Validation complete: ${summary.supported} supported, ${summary.partial} partial, ${summary.notSupported} not supported`
      );
    }
  );
}

/**
 * Validate the citation at cursor or by key
 */
async function validateCurrentCitation(citationKey?: string): Promise<void> {
  const editor = vscode.window.activeTextEditor;
  if (!editor || editor.document.languageId !== 'markdown') {
    vscode.window.showWarningMessage('Please open a Markdown file to validate citations.');
    return;
  }

  const document = editor.document;
  const citations = parseCitations(document);

  let targetKey = citationKey;

  // If no key provided, try to find citation at cursor
  if (!targetKey) {
    const position = editor.selection.active;
    const citation = citations.find((c) => c.range.contains(position));
    if (citation) {
      targetKey = citation.key;
    }
  }

  if (!targetKey) {
    vscode.window.showWarningMessage('No citation found at cursor position.');
    return;
  }

  const targetCitations = citations.filter((c) => c.key === targetKey);

  if (targetCitations.length === 0) {
    vscode.window.showWarningMessage(`Citation @${targetKey} not found in document.`);
    return;
  }

  await vscode.window.withProgress(
    {
      location: vscode.ProgressLocation.Notification,
      title: `Validating @${targetKey}...`,
      cancellable: false,
    },
    async () => {
      const paragraphs = parseParagraphs(document);
      const paragraphsWithCitations = associateCitationsWithParagraphs(paragraphs, citations);
      const validator = getValidator();

      const results = await validator.validateCitationKey(
        targetKey!,
        citations,
        paragraphsWithCitations
      );

      applyValidationResults(document, results, true);

      if (results.length > 0) {
        const result = results[0];
        const confidence = Math.round(result.confidence * 100);
        vscode.window.showInformationMessage(
          `@${targetKey}: ${formatStatus(result.status)} (${confidence}%)`
        );
      }
    }
  );
}

/**
 * Clear the cache
 */
function clearCache(): void {
  getCacheService().clear();
  vscode.window.showInformationMessage('Paper Index cache cleared.');
}

/**
 * Search for a paper in the index
 */
async function searchPaper(query?: string): Promise<void> {
  if (!query) {
    query = await vscode.window.showInputBox({
      prompt: 'Enter paper ID or search terms',
      placeHolder: 'e.g., author2023 or "machine learning"',
    });
  }

  if (!query) {
    return;
  }

  const paperIndexService = getPaperIndexService();
  const paper = await paperIndexService.getPaper(query);

  if (paper) {
    vscode.window.showInformationMessage(
      `Found: ${paper.title} by ${paper.author || 'Unknown author'}`
    );
  } else {
    vscode.window.showWarningMessage(`Paper not found: ${query}`);
  }
}

/**
 * Copy rephrase suggestion to clipboard
 */
async function copyRephrase(rephrase: string): Promise<void> {
  await vscode.env.clipboard.writeText(rephrase);
  vscode.window.showInformationMessage('Rephrase suggestion copied to clipboard.');
}

/**
 * Apply validation results to the UI
 */
function applyValidationResults(
  document: vscode.TextDocument,
  results: ValidationResult[],
  merge: boolean = false
): void {
  const editor = vscode.window.visibleTextEditors.find(
    (e) => e.document.uri.toString() === document.uri.toString()
  );

  // Update diagnostics
  diagnosticsProvider.updateDiagnostics(document, results);

  // Update decorations
  if (editor) {
    decorationsProvider.applyDecorations(editor, results);
  }

  // Update hover provider
  hoverProvider.setValidationResults(document.uri.toString(), results);

  // Update code actions provider
  codeActionsProvider.setValidationResults(document.uri.toString(), results);

  // Refresh code lenses
  codeLensProvider.refresh();
}

/**
 * Summarize validation results
 */
function summarizeResults(results: ValidationResult[]): {
  supported: number;
  partial: number;
  notSupported: number;
} {
  return {
    supported: results.filter((r) => r.status === 'supported').length,
    partial: results.filter((r) => r.status === 'partial').length,
    notSupported: results.filter((r) => r.status === 'not_supported').length,
  };
}

/**
 * Format status for display
 */
function formatStatus(status: string): string {
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
