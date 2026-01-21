/**
 * Mock VS Code API for unit testing
 */

export class Position {
  constructor(
    public readonly line: number,
    public readonly character: number
  ) {}
}

export class Range {
  constructor(
    public readonly start: Position,
    public readonly end: Position
  ) {}

  static fromPositions(start: Position, end: Position): Range {
    return new Range(start, end);
  }

  contains(positionOrRange: Position | Range): boolean {
    if (positionOrRange instanceof Position) {
      const pos = positionOrRange;
      return (
        (pos.line > this.start.line ||
          (pos.line === this.start.line && pos.character >= this.start.character)) &&
        (pos.line < this.end.line ||
          (pos.line === this.end.line && pos.character <= this.end.character))
      );
    }
    return false;
  }
}

export class TextDocument {
  constructor(
    private content: string,
    public readonly languageId: string = 'markdown'
  ) {}

  getText(): string {
    return this.content;
  }

  positionAt(offset: number): Position {
    const text = this.content.substring(0, offset);
    const lines = text.split('\n');
    const line = lines.length - 1;
    const character = lines[lines.length - 1].length;
    return new Position(line, character);
  }
}

export const workspace = {
  getConfiguration: () => ({
    get: (key: string, defaultValue: unknown) => defaultValue,
  }),
  onDidChangeConfiguration: () => ({ dispose: () => {} }),
};

export const DiagnosticSeverity = {
  Error: 0,
  Warning: 1,
  Information: 2,
  Hint: 3,
};

export class MarkdownString {
  isTrusted = false;
  private content = '';

  appendMarkdown(value: string): this {
    this.content += value;
    return this;
  }

  toString(): string {
    return this.content;
  }
}

export const ThemeColor = class {
  constructor(public readonly id: string) {}
};
