import * as cheerio from 'cheerio';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Configuration
const BUILD_FILE = path.join(__dirname, '../build/index.html');
const OUTPUT_FILE = path.join(__dirname, '../build/plastics-treaty-embed.html');
const TARGET_ID = 'plastics-treaty';

console.log('🔍 Extracting PlasticsTreaty component...');

// Check if build file exists
if (!fs.existsSync(BUILD_FILE)) {
  console.error(`❌ Build file not found: ${BUILD_FILE}`);
  console.error('   Please run "pnpm build" first');
  process.exit(1);
}

// Read the built HTML
const html = fs.readFileSync(BUILD_FILE, 'utf-8');
const $ = cheerio.load(html);

// ============================================
// STEP 1: Extract the target div
// ============================================
const targetDiv = $(`#${TARGET_ID}`);

if (targetDiv.length === 0) {
  console.error(`❌ Could not find element with id="${TARGET_ID}"`);
  process.exit(1);
}

console.log(`✅ Found #${TARGET_ID}`);

// ============================================
// STEP 2: Extract only relevant CSS
// ============================================
const allStyles = $('style').toArray();
const relevantStyles = [];

allStyles.forEach((styleTag) => {
  const cssContent = $(styleTag).html();

  // Keep styles that reference our component
  if (
    cssContent.includes(`#${TARGET_ID}`) ||
    cssContent.includes('.svelte-') || // Svelte scoped styles
    cssContent.includes(':root') || // CSS variables
    cssContent.includes('@import') || // Font imports
    cssContent.includes('@supports') || // Feature queries
    cssContent.includes('@media') // Media queries
  ) {
    relevantStyles.push(cssContent);
  }
});

console.log(`✅ Extracted ${relevantStyles.length} relevant style blocks`);

// ============================================
// STEP 3: Extract JavaScript
// ============================================
// SvelteKit bundles everything together, so we keep the full bundle
// It's already minified and optimized by Vite

const scripts = $('script').toArray();
let jsContent = '';

scripts.forEach((scriptTag) => {
  const content = $(scriptTag).html();
  if (content && content.trim()) {
    jsContent += content + '\n';
  }
});

console.log(`✅ Extracted JavaScript bundle`);

// ============================================
// STEP 4: Build the output HTML
// ============================================
const outputHtml = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Plastics Treaty</title>

  <!-- Extracted Styles -->
  <style>
${relevantStyles.join('\n\n')}
  </style>
</head>
<body>
  <!-- Extracted Component -->
  ${$.html(targetDiv)}

  <!-- Extracted JavaScript -->
  <script>
${jsContent}
  </script>
</body>
</html>
`;

// ============================================
// STEP 5: Write output
// ============================================
fs.writeFileSync(OUTPUT_FILE, outputHtml, 'utf-8');

const originalSize = Buffer.byteLength(html, 'utf-8');
const newSize = Buffer.byteLength(outputHtml, 'utf-8');
const savings = ((1 - newSize / originalSize) * 100).toFixed(1);

console.log(`\n📦 Output Statistics:`);
console.log(`   Original: ${(originalSize / 1024).toFixed(1)} KB`);
console.log(`   Extracted: ${(newSize / 1024).toFixed(1)} KB`);
console.log(`   Savings: ${savings}%`);
console.log(`\n✨ Saved to: ${OUTPUT_FILE}`);
console.log('\n💡 Tip: Open the file in a browser to test the extracted component');
