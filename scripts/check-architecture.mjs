import {
  existsSync,
  readFileSync,
  readdirSync,
  statSync,
} from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const baselinePath = path.join(root, 'architecture-baseline.json');
const baseline = JSON.parse(readFileSync(baselinePath, 'utf8'));
const failures = [];

function relative(file) {
  return path.relative(root, file).split(path.sep).join('/');
}

function read(relativePath) {
  return readFileSync(path.join(root, relativePath), 'utf8');
}

function collectFiles(directory) {
  const absoluteDirectory = path.join(root, directory);
  const files = [];
  for (const entry of readdirSync(absoluteDirectory)) {
    const absolutePath = path.join(absoluteDirectory, entry);
    if (statSync(absolutePath).isDirectory()) {
      files.push(...collectFiles(relative(absolutePath)));
    } else {
      files.push(relative(absolutePath));
    }
  }
  return files;
}

function fail(message) {
  failures.push(message);
}

if (baseline.version !== 1) {
  fail('architecture-baseline.json must use version 1');
}

for (const key of ['legacyUtilityFiles', 'legacyGenericFiles']) {
  const entries = baseline[key];
  if (!Array.isArray(entries) || new Set(entries).size !== entries.length) {
    fail(`${key} must be a duplicate-free array`);
    continue;
  }
  for (const file of entries) {
    if (!existsSync(path.join(root, file))) {
      fail(`${file} was removed; shrink ${key} in architecture-baseline.json`);
    }
  }
}

const productionFiles = [
  ...collectFiles('app/src'),
  ...collectFiles('app/src-tauri/src'),
  ...collectFiles('extension/src'),
].filter(file => /\.(?:ts|tsx|rs)$/.test(file) && !file.endsWith('.test.ts'));

const utilityFiles = productionFiles.filter(file => file.startsWith('app/src/utils/'));
const allowedUtilities = new Set(baseline.legacyUtilityFiles);
for (const file of utilityFiles) {
  if (!allowedUtilities.has(file)) {
    fail(`${file}: new production owners must use a responsibility-named directory, not app/src/utils`);
  }
}

const allowedGenericFiles = new Set(baseline.legacyGenericFiles);
for (const file of productionFiles) {
  if (/^(?:helpers?|common|misc|utils?)\.(?:ts|tsx|rs)$/.test(path.basename(file))
      && !allowedGenericFiles.has(file)) {
    fail(`${file}: generic owner names are not allowed`);
  }
}

const contextImports = productionFiles.filter(file => /\.(?:ts|tsx)$/.test(file));
for (const file of contextImports) {
  const source = read(file);
  const imports = source.matchAll(/import\s+([^;]+?)\s+from\s+['"][^'"]*ProjectContext['"]/g);
  for (const match of imports) {
    const identifiers = match[1].match(/[A-Za-z_$][A-Za-z0-9_$]*/g) ?? [];
    const unsupported = identifiers.filter(identifier => (
      !['ProjectProvider', 'useProject', 'as'].includes(identifier)
    ));
    if (unsupported.length > 0) {
      fail(`${file}: ProjectContext only exposes ProjectProvider and useProject`);
    }
  }
}

const projectContext = read('app/src/ProjectContext.tsx');
if (/export\s+(?:interface|type)\s+/.test(projectContext)) {
  fail('app/src/ProjectContext.tsx must not own or re-export project data contracts');
}
if (projectContext.includes('@tauri-apps/plugin-store')) {
  fail('app/src/ProjectContext.tsx must delegate recent-project persistence');
}

for (const generatedConfig of ['app/vite.config.js', 'app/vite.config.d.ts']) {
  if (existsSync(path.join(root, generatedConfig))) {
    fail(`${generatedConfig}: vite.config.ts is the only maintained Vite configuration`);
  }
}

const typeOwners = new Map([
  ['ProjectState', 'app/src/project/model.ts'],
  ['PrintSettings', 'app/src/project/model.ts'],
  ['PublicationMetadata', 'app/src/project/model.ts'],
  ['ElectronicPdfSettings', 'app/src/project/model.ts'],
]);
for (const [typeName, owner] of typeOwners) {
  for (const file of productionFiles.filter(file => /\.(?:ts|tsx)$/.test(file))) {
    if (file !== owner && new RegExp(`\\b(?:interface|type)\\s+${typeName}\\b`).test(read(file))) {
      fail(`${file}: ${typeName} is owned by ${owner}`);
    }
  }
}

for (const file of productionFiles.filter(file => /\.(?:ts|tsx)$/.test(file))) {
  if (file !== 'app/src/story/script.ts') {
    const source = read(file);
    if (source.includes('Cover|封面')
        || source.includes('Title|扉页')
        || source.includes('Author|作者')) {
      fail(`${file}: story tag grammar is owned by app/src/story/script.ts`);
    }
  }
}

for (const file of productionFiles.filter(file => file.endsWith('.rs'))) {
  const source = read(file).split('#[cfg(test)]')[0];
  if (source.includes('"project.json"') && file !== 'app/src-tauri/src/project_storage.rs') {
    fail(`${file}: project.json access is owned by project_storage.rs`);
  }
  if (source.includes('tauri::generate_handler!')
      && file !== 'app/src-tauri/src/lib.rs') {
    fail(`${file}: Tauri command registration is owned by lib.rs`);
  }
  if (source.includes('.route("/api/')
      && file !== 'app/src-tauri/src/receiver.rs') {
    fail(`${file}: local receiver routes are owned by receiver.rs`);
  }
  if (source.includes('StreamableHttpService')
      && file !== 'app/src-tauri/src/mcp_server.rs') {
    fail(`${file}: MCP transport is owned by mcp_server.rs`);
  }
  if (source.includes('"app-server"')
      && file !== 'app/src-tauri/src/codex_polish.rs') {
    fail(`${file}: Codex App Server lifecycle is owned by codex_polish.rs`);
  }
}

for (const file of productionFiles) {
  const source = read(file).split('#[cfg(test)]')[0];
  if (source.includes('"external-project-update"')
      && ![
        'app/src-tauri/src/project_operations.rs',
        'app/src/ProjectContext.tsx',
      ].includes(file)) {
    fail(`${file}: external project update transport has an unexpected owner`);
  }
}

const nativeEntry = read('app/src-tauri/src/lib.rs');
for (const forbidden of ['use axum', 'use serde', 'use sha2', 'async fn ']) {
  if (nativeEntry.includes(forbidden)) {
    fail(`app/src-tauri/src/lib.rs must remain a composition root (${forbidden.trim()} found)`);
  }
}

if (read('app/src/PrintScreen.tsx').includes('function calculateImposition')) {
  fail('PrintScreen.tsx must delegate imposition policy to print/imposition.ts');
}
if (read('app/src/utils/storyPageRenderer.ts').includes('function parseStoryScript')) {
  fail('storyPageRenderer.ts must delegate script grammar to story/script.ts');
}
if (read('app/src/components/RightSidebar.tsx').includes('function DebouncedTextarea')) {
  fail('RightSidebar.tsx must delegate script editing to right-sidebar/ScriptPanel.tsx');
}

const fixtureReferences = [
  'app/src/project/migrate.test.ts',
  'app/src-tauri/src/project_model.rs',
];
for (const file of fixtureReferences) {
  if (!read(file).includes('fixtures/project-v2.json')) {
    fail(`${file}: project-v2.json must remain a shared cross-language contract fixture`);
  }
}

if (failures.length > 0) {
  console.error('Architecture checks failed:');
  failures.forEach(message => console.error(`- ${message}`));
  process.exit(1);
}

console.log(`Architecture checks passed (${productionFiles.length} production files).`);
