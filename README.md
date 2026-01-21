# Paper Index VS Code Extension

A VS Code extension that validates Pandoc citations in Markdown files against indexed academic sources using `paper-index-tool` CLI and Amazon Bedrock Claude for LLM-based validation.

## Features

- **Citation Parsing**: Automatically detects Pandoc-style citations in Markdown files
  - Bracket citations: `[@author2023]`, `[@author2023, p. 42]`, `[@author2023; @smith2024]`
  - Inline citations: `@author2023`

- **Validation**: Uses LLM to assess whether citations properly support their claims
  - Three-tier validation: Supported (green), Partial (yellow), Not Supported (red)
  - Confidence scores with explanations

- **VS Code Integration**:
  - **Diagnostics**: Problems panel integration with errors/warnings/info
  - **Decorations**: Visual highlighting of citations based on validation status
  - **CodeLens**: "Validate" buttons above citations
  - **Hover**: Detailed validation information and supporting quotes
  - **Code Actions**: Quick fixes for inserting supporting quotes

## Requirements

- [paper-index-tool](https://github.com/dennisvriend/paper-index-tool) CLI installed and configured
- AWS credentials configured with Bedrock access
- VS Code 1.85.0 or later

## Installation

1. Build the extension:
   ```bash
   npm install
   npm run build
   ```

2. Install the `.vsix` file or run in development mode:
   ```bash
   # Development mode
   npm run watch
   # Then press F5 in VS Code to launch Extension Development Host
   ```

## Configuration

Configure the extension in VS Code settings:

| Setting | Default | Description |
|---------|---------|-------------|
| `paperIndex.cliPath` | `paper-index-tool` | Path to paper-index-tool CLI |
| `paperIndex.bedrock.region` | `us-east-1` | AWS region for Bedrock |
| `paperIndex.bedrock.model` | `anthropic.claude-sonnet-4-20250514-v1:0` | Bedrock model ID |
| `paperIndex.bedrock.profile` | `""` | AWS profile name (optional) |
| `paperIndex.validateOnSave` | `false` | Auto-validate on file save |
| `paperIndex.cache.ttlSeconds` | `300` | Cache TTL in seconds |
| `paperIndex.validation.confidenceThresholds.supported` | `0.8` | Threshold for "supported" status |
| `paperIndex.validation.confidenceThresholds.partial` | `0.4` | Threshold for "partial" status |

## Usage

1. Open a Markdown file with Pandoc citations
2. Run the command `Paper Index: Validate Citations` (or click the CodeLens)
3. View results:
   - Green decorations: Citation is well supported
   - Yellow decorations: Citation is partially supported
   - Red decorations: Citation is not supported
4. Hover over citations for detailed validation information
5. Check the Problems panel for a summary

## Commands

| Command | Description |
|---------|-------------|
| `Paper Index: Validate Citations` | Validate all citations in the active document |
| `Paper Index: Validate Current Citation` | Validate the citation at cursor position |
| `Paper Index: Clear Cache` | Clear the validation cache |

## Validation Status

| Status | Confidence | Visual | Diagnostic Level |
|--------|------------|--------|------------------|
| Supported | >= 0.8 | Green | Information |
| Partial | 0.4 - 0.8 | Yellow | Warning |
| Not Supported | < 0.4 | Red | Error |

## Architecture

```
┌─────────────────────────────────────────────────────────┐
│                  VS Code Extension                       │
├─────────────────────────────────────────────────────────┤
│  extension.ts ─► Parsers ─► Services ─► Providers       │
│                     │           │            │          │
│            citationParser  paperIndexSvc  diagnostics   │
│            paragraphParser bedrockSvc     decorations   │
│                            cacheSvc       codeLens      │
│                                           hover         │
│                                           codeActions   │
└─────────────────────────────────────────────────────────┘
         │                              │
         ▼                              ▼
┌─────────────────────┐    ┌─────────────────────────────┐
│  paper-index-tool   │    │      AWS Bedrock            │
│  CLI (Python)       │    │      Claude Sonnet          │
└─────────────────────┘    └─────────────────────────────┘
```

## Development

```bash
# Install dependencies
npm install

# Build
npm run build

# Watch mode
npm run watch

# Run tests
npm test

# Lint
npm run lint
```

## Project Structure

```
paper-index-vscode-extension/
├── src/
│   ├── extension.ts              # Entry point
│   ├── config/
│   │   └── settings.ts           # Configuration management
│   ├── parsers/
│   │   ├── citationParser.ts     # Parse [@key], @key citations
│   │   └── paragraphParser.ts    # Extract paragraphs with citations
│   ├── services/
│   │   ├── paperIndexService.ts  # CLI wrapper
│   │   ├── bedrockService.ts     # AWS Bedrock integration
│   │   └── cacheService.ts       # TTL cache
│   ├── providers/
│   │   ├── diagnosticsProvider.ts
│   │   ├── decorationsProvider.ts
│   │   ├── codeLensProvider.ts
│   │   ├── hoverProvider.ts
│   │   └── codeActionsProvider.ts
│   ├── validation/
│   │   ├── validator.ts          # Orchestration
│   │   └── promptBuilder.ts      # LLM prompts
│   └── types/
│       └── index.ts              # TypeScript interfaces
└── test/
    └── unit/
```

## License

MIT
