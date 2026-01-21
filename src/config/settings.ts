import * as vscode from 'vscode';
import { ExtensionConfig } from '../types';

const CONFIG_SECTION = 'paperIndex';

/**
 * Get the current extension configuration
 */
export function getConfig(): ExtensionConfig {
  const config = vscode.workspace.getConfiguration(CONFIG_SECTION);

  return {
    cliPath: config.get<string>('cliPath', 'paper-index-tool'),
    bedrock: {
      region: config.get<string>('bedrock.region', 'us-east-1'),
      model: config.get<string>('bedrock.model', 'global.anthropic.claude-sonnet-4-20250514-v1:0'),
      profile: config.get<string>('bedrock.profile', '') || undefined,
    },
    validateOnSave: config.get<boolean>('validateOnSave', false),
    cache: {
      ttlSeconds: config.get<number>('cache.ttlSeconds', 300),
    },
    validation: {
      confidenceThresholds: config.get<{ supported: number; partial: number }>(
        'validation.confidenceThresholds',
        { supported: 0.8, partial: 0.4 }
      ),
    },
  };
}

/**
 * Create a configuration change listener
 */
export function onConfigurationChanged(
  callback: (config: ExtensionConfig) => void
): vscode.Disposable {
  return vscode.workspace.onDidChangeConfiguration((e) => {
    if (e.affectsConfiguration(CONFIG_SECTION)) {
      callback(getConfig());
    }
  });
}
