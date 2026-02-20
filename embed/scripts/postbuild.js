#!/usr/bin/env node
/**
 * Copies index.production.html to dist/index.html after vite build.
 * Edit index.production.html in the repo; it is the test page served at / in production.
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.join(__dirname, '..');
const srcFile = path.join(rootDir, 'index.production.html');
const distDir = path.join(rootDir, 'dist');
const destFile = path.join(distDir, 'index.html');

if (!fs.existsSync(distDir)) {
  console.error('postbuild: dist/ not found. Run vite build first.');
  process.exit(1);
}
if (!fs.existsSync(srcFile)) {
  console.error('postbuild: index.production.html not found.');
  process.exit(1);
}

fs.copyFileSync(srcFile, destFile);
console.log('postbuild: copied index.production.html → dist/index.html');
