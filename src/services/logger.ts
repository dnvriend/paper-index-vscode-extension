import * as vscode from 'vscode';

/**
 * Logger service using VS Code OutputChannel
 */
class Logger {
  private outputChannel: vscode.OutputChannel | null = null;
  private readonly channelName = 'Paper Index';

  /**
   * Initialize the output channel - must be called during extension activation
   */
  initialize(context: vscode.ExtensionContext): void {
    this.outputChannel = vscode.window.createOutputChannel(this.channelName);
    context.subscriptions.push(this.outputChannel);
  }

  /**
   * Log an info message
   */
  info(message: string, ...args: unknown[]): void {
    this.log('INFO', message, ...args);
  }

  /**
   * Log a debug message
   */
  debug(message: string, ...args: unknown[]): void {
    this.log('DEBUG', message, ...args);
  }

  /**
   * Log a warning message
   */
  warn(message: string, ...args: unknown[]): void {
    this.log('WARN', message, ...args);
  }

  /**
   * Log an error message
   */
  error(message: string, ...args: unknown[]): void {
    this.log('ERROR', message, ...args);
  }

  /**
   * Show the output channel
   */
  show(): void {
    this.outputChannel?.show();
  }

  private log(level: string, message: string, ...args: unknown[]): void {
    const timestamp = new Date().toISOString();
    let formattedMessage = `[${timestamp}] [${level}] ${message}`;

    // Append any additional arguments
    if (args.length > 0) {
      const argsStr = args
        .map((arg) => {
          if (typeof arg === 'object') {
            try {
              return JSON.stringify(arg);
            } catch {
              return String(arg);
            }
          }
          return String(arg);
        })
        .join(' ');
      formattedMessage += ' ' + argsStr;
    }

    if (this.outputChannel) {
      this.outputChannel.appendLine(formattedMessage);
    } else {
      // Fallback to console if not initialized
      console.log(formattedMessage);
    }
  }
}

// Singleton instance
export const logger = new Logger();
