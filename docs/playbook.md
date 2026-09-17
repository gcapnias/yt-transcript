# **Agent Playbook: TypeScript CLI Repository Initialization**

**Target Audience:** Automated Coding Agents & Developers

**Purpose:** Standardized workflow for scaffolding a modern TypeScript CLI tool executable via npx (locally or directly from GitHub `github:owner/repo`) and capable of standalone binary compilation via Bun.

## **1. Environment & Context Resolution**

### **Prerequisites**

* Node.js >= 20.0.0  
* Bun >= 1.1.0  
* Package Manager: npm  
* System Tools: curl, git

### **Variable Definitions**

Before executing the initialization steps, resolve the following environment variables:

```bash
export PROJECT_NAME="my-cli-tool"      # Package name (lowercase, kebab-case)  
export CLI_CMD="my-cli"                # Executable command handle  
export PROJECT_DESC="TypeScript CLI"   # Project description
```

## **2. Playbook Execution Steps**

### **Step 2.1: Directory Scaffolding & Git Setup**

```bash
# Create directory structure  
mkdir -p "$PROJECT_NAME"/src "$PROJECT_NAME"/tests "$PROJECT_NAME"/.github/workflows  
cd "$PROJECT_NAME"

# Initialize Git repository  
git init

# Fetch production .gitignore from Toptal API  
curl -sL https://www.toptal.com/developers/gitignore/api/node,typescript,visualstudiocode,bun > .gitignore
```

### **Step 2.2: Package Metadata Configuration (npm pkg set)**

Initialize package.json and programmatically configure metadata using native npm pkg set:

```bash
npm init -y

# Core Package Metadata  
npm pkg set name="$PROJECT_NAME"  
npm pkg set description="$PROJECT_DESC"  
npm pkg set type="module"  
npm pkg set main="./dist/index.js"  
npm pkg set bin."$CLI_CMD"="./dist/index.js"

# Scripts  
npm pkg set scripts.build="tsup"  
npm pkg set scripts.build:binary="bun build --compile --target=bun ./src/index.ts --outfile dist/$CLI_CMD"  
npm pkg set scripts.dev="tsup --watch"  
npm pkg set scripts.typecheck="tsc --noEmit"  
npm pkg set scripts.lint="eslint ."  
npm pkg set scripts.format="prettier --write ."  
npm pkg set scripts.format:check="prettier --check ."  
npm pkg set scripts.test="vitest run"  
npm pkg set scripts.prepare="npm run build"

# Engines & Published Files  
npm pkg set engines.node=">=20.0.0"  
npm pkg set files='["dist"]' --json
```

**Note on prepare hook:** The "prepare": "npm run build" hook guarantees that when executed via npx github:owner/repo, npm compiles the binary artifacts in dist/ on the fly without tracking build outputs in git.

### **Step 2.3: Dependency Installation**

Install development tooling, runtime CLI libraries, and Bun type definitions:

```bash
# Developer Dependencies  
npm install -D typescript @types/node @types/bun tsup vitest eslint @eslint/js typescript-eslint prettier eslint-config-prettier

# Production Dependencies  
npm install commander
```

### **Step 2.4: Code Quality & Formatter Setup**

Create **.prettierrc**:

```json
{  
  "semi": true,  
  "singleQuote": true,  
  "tabWidth": 2,  
  "trailingComma": "es5",  
  "printWidth": 100,  
  "endOfLine": "lf"  
}
```

Create **.prettierignore**:

```json
dist/  
node_modules/  
coverage/  
*.log
```

Create **eslint.config.js** (Flat Configuration):

```javascript
import js from '@eslint/js';  
import tseslint from 'typescript-eslint';  
import eslintConfigPrettier from 'eslint-config-prettier';

export default tseslint.config(  
  js.configs.recommended,  
  ...tseslint.configs.recommended,  
  eslintConfigPrettier,  
  {  
    ignores: ['dist/', 'node_modules/'],  
  }  
);
```

### **Step 2.5: Build & TypeScript Configuration**

Create **tsconfig.json**:

```json
{  
  "compilerOptions": {  
    "target": "ES2023",  
    "module": "NodeNext",  
    "moduleResolution": "NodeNext",  
    "lib": ["ES2023"],  
    "types": ["bun-types", "node"],  
    "outDir": "./dist",  
    "rootDir": "./src",  
    "strict": true,  
    "esModuleInterop": true,  
    "skipLibCheck": true,  
    "forceConsistentCasingInFileNames": true,  
    "declaration": true  
  },  
  "include": ["src/**/*"]  
}
```

Create **tsup.config.ts**:

```typescript
import { defineConfig } from 'tsup';

export default defineConfig({  
  entry: ['src/index.ts'],  
  format: ['esm'],  
  target: 'node20',  
  clean: true,  
  dts: true,  
  banner: {  
    js: '#!/usr/bin/env node',  
  },  
});
```

### **Step 2.6: Source Code & Test Boilerplate**

Create **src/index.ts** (Reads package metadata dynamically at runtime without bundler injection hacks):

```typescript
import { createRequire } from 'node:module';  
import { Command } from 'commander';

const require = createRequire(import.meta.url);  
const pkg = require('../package.json');

const program = new Command();

program  
  .name(pkg.name)  
  .description(pkg.description || '')  
  .version(pkg.version);

program  
  .command('status')  
  .description('Check CLI operational status')  
  .action(() => {  
    console.log(`${pkg.name} v${pkg.version} is active.`);  
  });

program.parse(process.argv);
```

Create **tests/index.test.ts**:

```typescript
import { describe, it, expect } from 'vitest';

describe('CLI execution test', () => {  
  it('passes base assertion', () => {  
    expect(true).toBe(true);  
  });  
});
```

### **Step 2.7: Continuous Integration Setup**

Create **.github/workflows/ci.yml**:

```yaml
name: CI

on:  
  push:  
    branches: [main]  
  pull_request:  
    branches: [main]

jobs:  
  verify:  
    runs-on: ubuntu-latest  
    strategy:  
      matrix:  
        node-version: [20, 22]

    steps:  
      - name: Checkout Repository  
        uses: actions/checkout@v4

      - name: Setup Node.js  
        uses: actions/setup-node@v4  
        with:  
          node-version: ${{ matrix.node-version }}  
          cache: 'npm'

      - name: Setup Bun  
        uses: oven-sh/setup-bun@v2  
        with:  
          bun-version: latest

      - name: Install Dependencies  
        run: npm ci

      - name: Typecheck  
        run: npm run typecheck

      - name: Lint  
        run: npm run lint

      - name: Check Formatting  
        run: npm run format:check

      - name: Run Tests  
        run: npm run test

      - name: Build JS Output  
        run: npm run build

      - name: Build Standalone Bun Binary  
        run: npm run build:binary
```

## **3. Post-Execution Verification Protocol**

The coding agent must execute the following commands in sequence and confirm that every command exits with code 0:

1. **Format Codebase:**  

    ```bash
    npm run format
    ```

2. **Verify Code Formatting:**  

    ```bash
    npm run format:check
    ```

3. **Verify Type Safety:**  

    ```bash
    npm run typecheck
    ```

4. **Lint Codebase:**  

    ```bash
    npm run lint
    ```

5. **Execute Tests:**  

    ```bash
    npm run test
    ```

6. **Build Node ESM Binary:**  

    ```bash
    npm run build
    ```

7. **Test Local npx Execution:**  

    ```bash
    npx . status
    ```

8. **Compile Standalone Bun Binary:**  

    ```bash
    npm run build:binary
    ```

9. **Test Direct Bun Binary Execution:**  

    ```bash
    ./dist/$CLI_CMD status 
    ```
