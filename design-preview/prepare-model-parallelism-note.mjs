import { readFile, writeFile } from 'node:fs/promises';

const [htmlPath, texPath] = process.argv.slice(2);

if (!htmlPath || !texPath) {
  throw new Error('Usage: node prepare-model-parallelism-note.mjs <html> <tex>');
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
      if (!number) throw new Error(`Unknown model-parallelism bibliography key: ${key}`);
      return `<a href="#ref-${key}">${number}</a>`;
    });
    return `<span class="citation">[${links.join(', ')}]</span>`;
  },
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
html = html.replace(/\s+data-reference(?:-type)?="[^"]*"/g, '');
html = html.replaceAll(String.raw`@{\qquad\qquad}`, '');

const figureLabel = 'fig:olmo-parallel-construction';
const figurePattern = new RegExp(`(<figure id="${figureLabel}"[^>]*>)\\s*`);
if (!figurePattern.test(html)) {
  throw new Error(`Pandoc output is missing ${figureLabel}`);
}
html = html.replace(
  figurePattern,
  '$1\n<img src="assets/model-parallelism/olmo-parallel-construction.svg" alt="The order in which OLMo builds its process mesh, applies pipeline, context, tensor or expert, and data parallelism, initializes local parameters, and constructs the optimizer." />\n',
);

const bibliographyPattern = /<div class="thebibliography">([\s\S]*?)<\/div>/;
const bibliographyMatch = html.match(bibliographyPattern);
if (!bibliographyMatch) {
  throw new Error('Pandoc did not emit the model-parallelism bibliography');
}

const bibliographyParagraphs = [
  ...bibliographyMatch[1].matchAll(/<p>([\s\S]*?)<\/p>/g),
].map(match => match[1]);

if (bibliographyParagraphs[0]?.includes('<span>99</span>')) {
  bibliographyParagraphs.shift();
}
if (bibliographyParagraphs.length !== allBibliographyKeys.length) {
  throw new Error(
    `Model-parallelism bibliography mismatch: ${bibliographyParagraphs.length} entries for ${allBibliographyKeys.length} keys`,
  );
}

const bibliography = allBibliographyKeys
  .map((key, index) => ({ key, entry: bibliographyParagraphs[index] }))
  .filter(({ key }) => citedKeySet.has(key))
  .map(({ key, entry }) => `<li id="ref-${key}">${entry}</li>`)
  .join('\n');

html = html.replace(
  bibliographyPattern,
  `<section class="references" aria-labelledby="model-parallelism-references-heading">
<h2 id="model-parallelism-references-heading">References</h2>
<ol>
${bibliography}
</ol>
</section>`,
);

html = html.replace(/[ \t]+$/gm, '');
await writeFile(htmlPath, html);
process.stdout.write(
  `${htmlPath}: linked ${bibliographyKeys.length} references and mapped the OLMo construction figure\n`,
);
