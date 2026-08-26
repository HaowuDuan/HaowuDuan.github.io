import { readFile, writeFile } from 'node:fs/promises';

const [htmlPath] = process.argv.slice(2);

if (!htmlPath) {
  throw new Error('Usage: node prepare-architecture-note.mjs <html>');
}

let html = await readFile(htmlPath, 'utf8');

const figureAltText = new Map([
  ['fig:token-lattice', 'A token sequence represented as a one-dimensional lattice of vector-valued sites.'],
  ['fig:decoder-block-dataflow', 'Data flow through the attention and feed-forward residual updates of a decoder block.'],
  ['fig:gqa-example', 'Grouped-query attention with eight query heads sharing two key and value heads.'],
  ['fig:norm-placement', 'Comparison of pre-norm, post-norm, and sandwich-norm residual updates.'],
  ['fig:norm-depth-stack', 'A sequence of decoder updates used to analyze normalization through model depth.'],
  ['fig:dense-versus-moe', 'Comparison of a dense feed-forward network with a sparsely routed mixture-of-experts layer.'],
  ['fig:swiglu-expert', 'The full SwiGLU expert map and its component projections and activation.'],
  ['fig:moe-topk-example', 'A top-two routing example in which one token selects two of four experts.'],
]);

for (const [label, alt] of figureAltText) {
  const filename = `${label.replace(/^fig:/, '')}.svg`;
  const figurePattern = new RegExp(`(<figure id="${label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}"[^>]*>)\\s*`);
  if (!figurePattern.test(html)) {
    throw new Error(`Pandoc output is missing ${label}`);
  }
  html = html.replace(
    figurePattern,
    `$1\n<img src="assets/architecture/${filename}" alt="${alt}">\n`,
  );
}

html = html.replace(/\s+data-latex-placement="[^"]*"/g, '');
html = html.replace(/\s+data-reference-(?:type|reference)="[^"]*"/g, '');
html = html.replace(/<h5/g, '<h4').replace(/<\/h5>/g, '</h4>');

const referencesStart = html.indexOf('<div id="refs"');
if (referencesStart === -1) {
  throw new Error('Pandoc did not emit the architecture bibliography');
}

const referencesTail = html.slice(referencesStart);
const entries = [...referencesTail.matchAll(
  /<div id="ref-([^"]+)" class="csl-entry"[^>]*>([\s\S]*?)<\/div>/g,
)];
if (entries.length === 0) {
  throw new Error('Pandoc emitted an empty architecture bibliography');
}

const lastEntry = entries.at(-1);
const lastEntryEnd = lastEntry.index + lastEntry[0].length;
const referencesEndRelative = referencesTail.indexOf('</div>', lastEntryEnd);
if (referencesEndRelative === -1) {
  throw new Error('Could not locate the end of the architecture bibliography');
}

const bibliography = entries
  .map(entry => `<li id="ref-${entry[1]}">${entry[2].trim()}</li>`)
  .join('\n');
const referencesSection = `<section class="references" aria-labelledby="architecture-references-heading">
<h2 id="architecture-references-heading">References</h2>
<ol>
${bibliography}
</ol>
</section>`;

html = html.slice(0, referencesStart)
  + referencesSection
  + referencesTail.slice(referencesEndRelative + '</div>'.length);

html = html.replace(/[ \t]+$/gm, '');
await writeFile(htmlPath, html);
process.stdout.write(
  `${htmlPath}: mapped ${figureAltText.size} figures and normalized ${entries.length} references\n`,
);
