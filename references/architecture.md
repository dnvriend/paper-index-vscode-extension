# Architecture

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
