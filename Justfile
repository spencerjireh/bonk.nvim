# bonk.nvim task runner

default: lint test

# --- TypeScript ---

# Build the TypeScript server
build:
    cd server && npx tsc

# Run server in development mode with auto-rebuild
dev:
    cd server && npx tsx --watch src/index.ts

# Run TypeScript tests
test-ts:
    cd server && npx vitest run

# Run TypeScript tests in watch mode
test-ts-watch:
    cd server && npx vitest

# Lint TypeScript with Biome
lint-ts:
    cd server && npx biome check src/

# Fix TypeScript lint issues
lint-ts-fix:
    cd server && npx biome check --write src/

# Format TypeScript with Biome
format:
    cd server && npx biome format --write src/

# --- Lua ---

# Run Lua tests with plenary.nvim
test-lua:
    nvim --headless -u tests/lua/minimal_init.lua \
      -c "PlenaryBustedDirectory tests/lua/bonk/ {minimal_init = 'tests/lua/minimal_init.lua'}"

# Lint Lua with Selene
lint-lua:
    selene lua/

# --- Combined ---

# Run all tests
test: test-ts test-lua

# Run all linters
lint: lint-ts lint-lua

# Run all checks (lint + test)
check: lint test

# Install server dependencies
install:
    cd server && npm install

# Install test dependencies (plenary.nvim)
install-test-deps:
    mkdir -p .deps
    [ -d .deps/plenary.nvim ] || git clone --depth 1 https://github.com/nvim-lua/plenary.nvim .deps/plenary.nvim

# Clean build artifacts
clean:
    rm -rf server/dist

# --- Docs ---

# Start VitePress dev server
docs-dev:
    cd docs && npx vitepress dev

# Build documentation site
docs-build:
    cd docs && npx vitepress build

# Preview built documentation
docs-preview:
    cd docs && npx vitepress preview

# Install docs dependencies
docs-install:
    cd docs && npm install
