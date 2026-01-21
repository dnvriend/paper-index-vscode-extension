.PHONY: help install build clean test lint package install-ext uninstall-ext reinstall dev

# Extension info
NAME := paper-index-vscode-extension
VERSION := $(shell node -p "require('./package.json').version")
VSIX := $(NAME)-$(VERSION).vsix

help: ## Show this help
	@grep -E '^[a-zA-Z_-]+:.*?## .*$$' $(MAKEFILE_LIST) | sort | awk 'BEGIN {FS = ":.*?## "}; {printf "\033[36m%-15s\033[0m %s\n", $$1, $$2}'

install: ## Install npm dependencies
	npm install

build: ## Build the extension
	npm run build

clean: ## Clean build artifacts
	rm -rf dist out *.vsix node_modules/.cache

test: ## Run unit tests
	npm test

lint: ## Run linter
	npm run lint

package: build ## Package extension as VSIX
	npx @vscode/vsce package --no-dependencies
	@echo "Created: $(VSIX)"

install-ext: package ## Install extension in VS Code
	code --install-extension $(VSIX)
	@echo "Installed. Reload VS Code: Cmd+Shift+P -> 'Developer: Reload Window'"

uninstall-ext: ## Uninstall extension from VS Code
	code --uninstall-extension undefined_publisher.$(NAME) || true

reinstall: package ## Reinstall extension (uninstall + install)
	code --uninstall-extension undefined_publisher.$(NAME) || true
	code --install-extension $(VSIX) --force
	@echo "Reinstalled. Reload VS Code: Cmd+Shift+P -> 'Developer: Reload Window'"

dev: ## Open VS Code for F5 debugging
	code .

all: clean install build test package ## Full build pipeline
