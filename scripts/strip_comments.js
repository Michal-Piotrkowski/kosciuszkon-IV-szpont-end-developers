#!/usr/bin/env node
// strips comments from source files across the repo
// Usage:
//   node scripts/strip_comments.js --dry-run    # show files that would change
//   node scripts/strip_comments.js --apply      # modify files in-place (creates .bak files)
// WARNING: This permanently modifies files when run with --apply (backups created with .bak)

const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const args = process.argv.slice(2);
const apply = args.includes('--apply');
const dryRun = !apply;

const exts = ['.ts', '.js', '.jsx', '.tsx', '.py', '.html', '.css', '.json'];
const excludeDirs = ['node_modules', '.git', 'dist', 'build', 'coverage', 'venv', '__pycache__'];

function isTextFile(filePath) {
  return exts.includes(path.extname(filePath).toLowerCase());
}

function walk(dir, files=[]) {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const e of entries) {
    if (excludeDirs.includes(e.name)) continue;
    const full = path.join(dir, e.name);
    if (e.isDirectory()) {
      walk(full, files);
    } else if (e.isFile() && isTextFile(full)) {
      files.push(full);
    }
  }
  return files;
}

function stripComments(content, ext) {
  // preserve shebang
  let shebang = '';
  if (content.startsWith('#!')) {
    const idx = content.indexOf('\n');
    shebang = content.slice(0, idx + 1);
    content = content.slice(idx + 1);
  }

  // Remove JS/TS/CSS/HTML style comments
  if (ext === '.js' || ext === '.ts' || ext === '.jsx' || ext === '.tsx' || ext === '.css') {
    // remove /* */ including multiline
    content = content.replace(/\/\*[\s\S]*?\*\//g, '');
    // remove // comments
    content = content.replace(/(^|\n)\s*\/\/[^
]*/g, '\n');
  }

  // Remove HTML comments
  if (ext === '.html') {
    content = content.replace(/<!--([\s\S]*?)-->/g, '');
  }

  // Remove Python comments (# ...) and triple-quoted docstrings
  if (ext === '.py') {
    // remove triple-quoted strings used as docstrings (""" or ''') at top level or after def/class
    content = content.replace(/(^|\n)\s*('''|\"\"\")[\s\S]*?\2/g, '\n');
    // remove # comments
    content = content.replace(/(^|\n)\s*#.*$/g, '\n');
  }

  // For JSON, don't remove anything (comments are not allowed)
  if (ext === '.json') {
    return shebang + content;
  }

  // Normalize multiple blank lines
  content = content.replace(/\n{3,}/g, '\n\n');
  return shebang + content;
}

function main() {
  console.log(`Scanning ${root} for source files...`);
  const files = walk(root, []);
  const changed = [];

  for (const f of files) {
    try {
      const ext = path.extname(f).toLowerCase();
      const original = fs.readFileSync(f, 'utf8');
      const stripped = stripComments(original, ext);
      if (stripped !== original) {
        changed.push({ file: f, originalSize: original.length, newSize: stripped.length });
        if (apply) {
          // create backup
          fs.writeFileSync(f + '.bak', original, 'utf8');
          fs.writeFileSync(f, stripped, 'utf8');
        }
      }
    } catch (e) {
      console.error('Error processing', f, e.message);
    }
  }

  if (changed.length === 0) {
    console.log('No comment changes detected.');
    return;
  }

  console.log(`Found ${changed.length} files with comment removals:`);
  for (const c of changed) {
    console.log(` - ${path.relative(root, c.file)} (${c.originalSize} → ${c.newSize} bytes)`);
  }

  if (dryRun) {
    console.log('\nDry-run mode. To apply changes run:');
    console.log('  node scripts/strip_comments.js --apply');
  } else {
    console.log('\nApplied changes. Backups saved as <file>.bak');
  }
}

main();
