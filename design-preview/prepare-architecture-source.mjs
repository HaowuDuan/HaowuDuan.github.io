import { readFile, writeFile } from 'node:fs/promises';

const [architecturePath, linearAttentionPath, outputPath] = process.argv.slice(2);

if (!architecturePath || !linearAttentionPath || !outputPath) {
  throw new Error(
    'Usage: node prepare-architecture-source.mjs <architecture-tex> <linear-attention-tex> <output-tex>',
  );
}

const [architectureSource, linearAttentionSource] = await Promise.all([
  readFile(architecturePath, 'utf8'),
  readFile(linearAttentionPath, 'utf8'),
]);

const placeholder = /\\section\{Linear Attention and RNN\}\s*Coming soon\./;
if (!placeholder.test(architectureSource)) {
  throw new Error('The architecture source is missing the Linear Attention and RNN placeholder');
}

const documentBodyStart = linearAttentionSource.indexOf('\\maketitle');
const sectionStart = linearAttentionSource.indexOf(
  '\\section{RNN refresher and linear attention from full attention}',
);
const bibliographyStart = linearAttentionSource.indexOf('\\begin{thebibliography}');

if (documentBodyStart === -1 || sectionStart === -1 || bibliographyStart === -1) {
  throw new Error('Could not locate the publishable body of the linear-attention source');
}

const introduction = linearAttentionSource
  .slice(documentBodyStart + '\\maketitle'.length, sectionStart)
  .replace(/% ={5,}/g, '')
  .trim();
const bibliographyWrapperStart = linearAttentionSource.lastIndexOf('{\\small', bibliographyStart);
const sectionBodyEnd = bibliographyWrapperStart === -1 ? bibliographyStart : bibliographyWrapperStart;
const sectionBody = linearAttentionSource
  .slice(
    sectionStart + '\\section{RNN refresher and linear attention from full attention}'.length,
    sectionBodyEnd,
  )
  .replace(/% ={5,}/g, '')
  .trim();

const publishedSection = `\\section{Linear Attention and RNN}\n\n${introduction}\n\n${sectionBody}`;
let combined = architectureSource.replace(placeholder, publishedSection);

if (!combined.includes('\\usepackage{bm}')) {
  combined = combined.replace(
    '\\usepackage{amsmath,amssymb,mathtools}',
    '\\usepackage{amsmath,amssymb,mathtools}\n\\usepackage{bm}',
  );
}

await writeFile(outputPath, combined);
process.stdout.write(`${outputPath}: inserted the RNN and linear-attention section\n`);
