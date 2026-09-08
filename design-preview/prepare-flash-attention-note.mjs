import { readFile, writeFile } from 'node:fs/promises';

const [htmlPath, texPath] = process.argv.slice(2);

if (!htmlPath || !texPath) {
  throw new Error('Usage: node prepare-flash-attention-note.mjs <html> <tex>');
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
      if (!number) throw new Error(`Unknown Flash Attention bibliography key: ${key}`);
      return `<a href="#ref-${key}">${number}</a>`;
    });
    return `<span class="citation">[${links.join(', ')}]</span>`;
  },
);

html = html.replace(/<h5/g, '<h4').replace(/<\/h5>/g, '</h4>');
html = html.replace(/\s+data-latex-placement="[^"]*"/g, '');
html = html.replace(/\s+data-reference(?:-type)?="[^"]*"/g, '');

const figureLabel = 'fig:flashattention-tile-dataflow';
const figurePattern = new RegExp(`(<figure id="${figureLabel}"[^>]*>)\\s*`);
if (!figurePattern.test(html)) {
  throw new Error(`Pandoc output is missing ${figureLabel}`);
}
html = html.replace(
  figurePattern,
  '$1\n<img src="assets/flash-attention/flashattention-tile-dataflow.svg" alt="A tiled attention score grid and the data flow from high-bandwidth memory through shared memory and registers into the online-softmax state." />\n',
);

const bibliographyPattern = /<div class="thebibliography">([\s\S]*?)<\/div>/;
const bibliographyMatch = html.match(bibliographyPattern);
if (!bibliographyMatch) {
  throw new Error('Pandoc did not emit the Flash Attention bibliography');
}

const bibliographyParagraphs = [
  ...bibliographyMatch[1].matchAll(/<p>([\s\S]*?)<\/p>/g),
].map(match => match[1]);

if (bibliographyParagraphs[0]?.includes('<span>9</span>')) {
  bibliographyParagraphs.shift();
}
if (bibliographyParagraphs.length !== allBibliographyKeys.length) {
  throw new Error(
    `Flash Attention bibliography mismatch: ${bibliographyParagraphs.length} entries for ${allBibliographyKeys.length} keys`,
  );
}

const bibliography = allBibliographyKeys
  .map((key, index) => ({ key, entry: bibliographyParagraphs[index] }))
  .filter(({ key }) => citedKeySet.has(key))
  .map(({ key, entry }) => `<li id="ref-${key}">${entry}</li>`)
  .join('\n');

html = html.replace(
  bibliographyPattern,
  `<section class="references" aria-labelledby="flash-attention-references-heading">
<h2 id="flash-attention-references-heading">References</h2>
<ol>
${bibliography}
</ol>
</section>`,
);

html = html.replace(/[ \t]+$/gm, '');
await writeFile(htmlPath, html);
process.stdout.write(
  `${htmlPath}: linked ${bibliographyKeys.length} references and mapped the tile-dataflow figure\n`,
);
