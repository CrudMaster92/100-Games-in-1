#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');

const registryDir = __dirname;
const sourcePath = path.join(registryDir, 'applets.json');
const outputPath = path.join(registryDir, 'applets-inline.js');

const header = `// Auto-generated from applets.json by build-inline.js.\n// Supports offline test cabinet fallback when the dashboard is opened via the file:// protocol.\n`;

function main() {
  const source = fs.readFileSync(sourcePath, 'utf8');
  const parsed = JSON.parse(source);
  const serialized = JSON.stringify(parsed, null, 2);

  const script = `${header}(function() {\n  window.__APPLET_REGISTRY__ = ${serialized};\n})();\n`;

  fs.writeFileSync(outputPath, script, 'utf8');
  process.stdout.write(`Wrote ${path.relative(process.cwd(), outputPath)}\n`);
}

main();
