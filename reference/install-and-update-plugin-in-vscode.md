# Installing and Updating the Extension in VS Code

## Prerequisites

- Node.js 18+
- VS Code
- `paper-index-tool` CLI installed
- AWS credentials configured (for Bedrock access)

## Initial Setup

```bash
# Install dependencies
npm install

# Build the extension
npm run build
```

## Development Mode (Recommended for Testing)

### Launch Extension Development Host

1. Open the project in VS Code
2. Press `F5` (or Run → Start Debugging)
3. A new VS Code window opens with the extension loaded
4. Test the extension in this window
5. Close the window to stop

### After Making Changes

1. Make your code changes
2. Press `Cmd+Shift+F5` (Restart Debugging) to reload
   - Or close the Extension Host window and press `F5` again

## Install as Local Extension (VSIX)

### Build VSIX Package

```bash
# Install vsce if not installed
npm install -g @vscode/vsce

# Package the extension
vsce package
```

This creates `paper-index-vscode-extension-0.1.0.vsix`.

### Install VSIX

**Option 1: Command Line**
```bash
code --install-extension paper-index-vscode-extension-0.1.0.vsix
```

**Option 2: VS Code UI**
1. Open VS Code
2. `Cmd+Shift+P` → "Extensions: Install from VSIX..."
3. Select the `.vsix` file

### Update After Changes

```bash
# Rebuild
npm run build

# Repackage
vsce package

# Reinstall (overwrites previous version)
code --install-extension paper-index-vscode-extension-0.1.0.vsix --force
```

Then reload VS Code: `Cmd+Shift+P` → "Developer: Reload Window"

## Quick Reference

| Task | Command |
|------|---------|
| Build | `npm run build` |
| Debug mode | `F5` in VS Code |
| Restart debug | `Cmd+Shift+F5` |
| Package VSIX | `vsce package` |
| Install VSIX | `code --install-extension *.vsix` |
| Reload window | `Cmd+Shift+P` → "Developer: Reload Window" |
| View logs | Help → Toggle Developer Tools → Console |

## Troubleshooting

### Extension Not Loading
- Check Output panel → "Extension Host" for errors
- Verify `npm run build` completed without errors

### Changes Not Reflected
- Ensure you rebuilt: `npm run build`
- Reload window: `Cmd+Shift+P` → "Developer: Reload Window"
- Clear extension cache: `Cmd+Shift+P` → "Paper Index: Clear Cache"

### Debug Logs
- Open Developer Tools: Help → Toggle Developer Tools
- Check Console tab for `=== BEDROCK REQUEST ===` and `=== BEDROCK RESPONSE ===` logs
