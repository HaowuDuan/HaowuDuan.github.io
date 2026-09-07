import { readFile, writeFile } from 'node:fs/promises';

const [htmlPath, texPath] = process.argv.slice(2);

if (!htmlPath || !texPath) {
  throw new Error('Usage: node prepare-data-note.mjs <html> <tex>');
}

const [sourceHtml, sourceTex] = await Promise.all([
  readFile(htmlPath, 'utf8'),
  readFile(texPath, 'utf8'),
]);

const allBibliographyKeys = [...sourceTex.matchAll(/\\bibitem\{([^}]+)\}/g)].map(
  match => match[1],
);
const citedKeySet = new Set(
  [...sourceTex.matchAll(/\\cite[a-zA-Z*]*(?:\[[^\]]*\])*\{([^}]+)\}/g)]
    .flatMap(match => match[1].split(','))
    .map(key => key.trim()),
);
const bibliographyKeys = allBibliographyKeys.filter(key => citedKeySet.has(key));
const citationNumbers = new Map(
  bibliographyKeys.map((key, index) => [key, index + 1]),
);

let html = sourceHtml.replace(
  /<span\s+class="citation"\s+data-cites="([^"]+)"><\/span>/g,
  (_, citedKeys) => {
    const links = citedKeys.split(/\s+/).map(key => {
      const number = citationNumbers.get(key);
      if (!number) throw new Error(`Unknown pre-training bibliography key: ${key}`);
      return `<a href="#ref-${key}">${number}</a>`;
    });
    return `<span class="citation">[${links.join(', ')}]</span>`;
  },
);

html = html.replace(
  /<header id="title-block-header">[\s\S]*?<\/header>\s*/,
  '',
);
html = html.replace(
  /<h2 id="from-a-standard-data-loader-to-get_batch">[\s\S]*?<\/h2>/,
  '<h2 id="data-pipeline">Data Pipeline</h2>',
);
html = html.replace(
  /<pre\s+data-basicstyle="[^"]*"><code>/g,
  '<pre class="code-block"><code class="language-python">',
);
html = html.replace(
  /(<pre class="code-block"><code class="language-python">)([\s\S]*?)(<\/code><\/pre>)/g,
  (_, opening, code, closing) => `${opening}${code
    .replaceAll('#', '&#35;')
    .replaceAll('\n', '&#10;')}${closing}`,
);
html = html.replace(/<h5/g, '<h4').replace(/<\/h5>/g, '</h4>');
html = html.replace(/\s+data-latex-placement="[^"]*"/g, '');
html = html.replace(/\s+data-reference-(?:type|reference)="[^"]*"/g, '');

const figures = [
  {
    label: 'fig:ddp-workflow',
    file: 'ddp-workflow.svg',
    alt: 'A global batch split across two model replicas whose gradients are averaged before identical optimizer updates.',
  },
  {
    label: 'fig:olmo-index-workflow',
    file: 'olmo-index-workflow.svg',
    alt: 'A global shuffled index order reshaped into batches and sliced into separate token batches for two ranks.',
  },
];

for (const { label, file, alt } of figures) {
  const figurePattern = new RegExp(`(<figure id="${label}"[^>]*>)\\s*`);
  if (!figurePattern.test(html)) throw new Error(`Pandoc output is missing ${label}`);
  html = html.replace(
    figurePattern,
    `$1\n<img src="assets/pre-training/${file}" alt="${alt}" />\n`,
  );
}

const centerFigures = [
  {
    file: 'zero-stage-memory.svg',
    alt: 'The progression from DDP through ZeRO stages 1, 2, and 3 as optimizer state, gradients, and parameters are sharded.',
    caption: 'Each ZeRO stage removes another replicated component of model state.',
  },
  {
    file: 'fsdp-layer-communication.svg',
    alt: 'Parameter shards are gathered for one layer, used for forward and backward computation, and reduce-scattered into gradient shards.',
    caption: 'FSDP gathers one layer for computation and then returns gradient shards to the owning ranks.',
  },
];

for (const { file, alt, caption } of centerFigures) {
  const emptyCenterPattern = /<div class="center">\s*<\/div>/;
  if (!emptyCenterPattern.test(html)) {
    throw new Error(`Pandoc output is missing the diagram position for ${file}`);
  }
  html = html.replace(
    emptyCenterPattern,
    `<figure>
<img src="assets/pre-training/${file}" alt="${alt}" />
<figcaption>${caption}</figcaption>
</figure>`,
  );
}

const bibliographyPattern = /<div class="thebibliography">([\s\S]*?)<\/div>/;
const bibliographyMatch = html.match(bibliographyPattern);
if (!bibliographyMatch) throw new Error('Pandoc did not emit the pre-training bibliography');

const bibliographyParagraphs = [
  ...bibliographyMatch[1].matchAll(/<p>([\s\S]*?)<\/p>/g),
].map(match => match[1]);

if (bibliographyParagraphs[0]?.includes('<span>99</span>')) {
  bibliographyParagraphs.shift();
}
if (bibliographyParagraphs.length !== allBibliographyKeys.length) {
  throw new Error(
    `Pre-training bibliography mismatch: ${bibliographyParagraphs.length} entries for ${allBibliographyKeys.length} keys`,
  );
}

const bibliography = allBibliographyKeys
  .map((key, index) => ({ key, entry: bibliographyParagraphs[index] }))
  .filter(({ key }) => citedKeySet.has(key))
  .map(({ key, entry }) => `<li id="ref-${key}">${entry}</li>`)
  .join('\n');

html = html.replace(
  bibliographyPattern,
  `<section class="references" aria-labelledby="pre-training-references-heading">
<h2 id="pre-training-references-heading">References</h2>
<ol>
${bibliography}
</ol>
</section>`,
);

html = html.replace(/[ \t]+$/gm, '');
await writeFile(htmlPath, html);
process.stdout.write(
  `${htmlPath}: linked ${bibliographyKeys.length} references and mapped 4 diagrams\n`,
);
