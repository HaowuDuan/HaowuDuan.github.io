import { readFile, writeFile } from 'node:fs/promises';

const [htmlPath, texPath] = process.argv.slice(2);

if (!htmlPath || !texPath) {
  throw new Error('Usage: node prepare-optimization-note.mjs <html> <tex>');
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
      if (!number) throw new Error(`Unknown citation key: ${key}`);
      return `<a href="#ref-${key}">${number}</a>`;
    });
    return `<span class="citation">[${links.join(', ')}]</span>`;
  },
);

html = html.replace(
  /<nav id="TOC" role="doc-toc">/g,
  '<nav class="note-toc" aria-label="Contents">',
);
html = html.replace(/\s+id="toc-[^"]+"/g, '');
html = html.replace(/<h5/g, '<h4').replace(/<\/h5>/g, '</h4>');

const figureAltText = new Map([
  ['fig_local_update.png', 'A gradient-descent step shown as a tangent update on a smooth one-dimensional loss.'],
  ['fig_transport.png', 'Local tangent transport along a curved training trajectory with varying Hessian geometry.'],
  ['fig_learning_rate_schedule.png', 'Comparison of constant, warm-up, and warm-down learning-rate schedules.'],
  ['fig_learning_rate_warmup.png', 'Comparison of an early warm-up step with a larger constant-rate step on a local loss profile.'],
  ['fig_learning_rate_warmdown.png', 'Late-training stochastic updates under constant and decreasing learning rates.'],
]);

for (const [filename, alt] of figureAltText) {
  const imagePattern = new RegExp(`<img src="${filename.replace('.', '\\.')}"`);
  if (!imagePattern.test(html)) {
    throw new Error(`Pandoc output is missing ${filename}`);
  }
  html = html.replace(
    imagePattern,
    `<img src="assets/optimization/${filename}" alt="${alt}"`,
  );
}

const bibliographyPattern = /<div class="thebibliography">([\s\S]*?)<\/div>/;
const bibliographyMatch = html.match(bibliographyPattern);
if (!bibliographyMatch) throw new Error('Pandoc did not emit the bibliography');

const bibliographyParagraphs = [
  ...bibliographyMatch[1].matchAll(/<p>([\s\S]*?)<\/p>/g),
].map(match => match[1]);

if (bibliographyParagraphs[0]?.includes('<span>99</span>')) {
  bibliographyParagraphs.shift();
}

if (bibliographyParagraphs.length !== allBibliographyKeys.length) {
  throw new Error(
    `Bibliography mismatch: ${bibliographyParagraphs.length} entries for ${allBibliographyKeys.length} keys`,
  );
}

const bibliography = allBibliographyKeys
  .map((key, index) => ({ key, entry: bibliographyParagraphs[index] }))
  .filter(({ key }) => citedKeySet.has(key))
  .map(({ key, entry }) => `<li id="ref-${key}">${entry}</li>`)
  .join('\n');

html = html.replace(
  bibliographyPattern,
  bibliographyKeys.length > 0
    ? `<section class="references" aria-labelledby="optimization-references-heading">
<h2 id="optimization-references-heading">References</h2>
<ol>
${bibliography}
</ol>
</section>`
    : '',
);

html = html.replace(/[ \t]+$/gm, '');

await writeFile(htmlPath, html);
process.stdout.write(
  `${htmlPath}: linked ${bibliographyKeys.length} cited references and mapped ${figureAltText.size} figures\n`,
);
