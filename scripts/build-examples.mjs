// Bakes the sample NDA texts into a TypeScript module so they are bundled
// by Next.js rather than read from disk at runtime (fs reads are not traced
// reliably on serverless). Re-run after changing the .txt files:
//   node scripts/build-examples.mjs
import fs from 'node:fs';
import path from 'node:path';

const dir = path.join(process.cwd(), 'src/lib/examples');
const files = [
  ['NDA_MUTUAL_STANDARD', 'NDA-01_Mutual_Standard_SG.txt'],
  ['NDA_SHORT_FORM', 'NDA-04_ShortForm_SG.txt'],
];

let out = `// GENERATED FILE - do not edit by hand.\n// Run: node scripts/build-examples.mjs\n\n`;
for (const [name, file] of files) {
  const text = fs.readFileSync(path.join(dir, file), 'utf8').trim();
  out += `export const ${name} = ${JSON.stringify(text)};\n\n`;
}
fs.writeFileSync(path.join(dir, 'generated.ts'), out);
console.log('wrote src/lib/examples/generated.ts');
