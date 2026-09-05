import { readFile, writeFile } from 'node:fs/promises';

const [htmlPath, texPath] = process.argv.slice(2);

if (!htmlPath || !texPath) {
  throw new Error('Usage: node prepare-rl-note.mjs <html> <tex>');
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
      if (!number) throw new Error(`Unknown RL bibliography key: ${key}`);
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
html = html.replaceAll('\\mbox{', '\\text{');

const figureLabel = 'fig:actor-critic-interface';
const figurePattern = new RegExp(`(<figure id="${figureLabel}"[^>]*>)\\s*`);
if (!figurePattern.test(html)) {
  throw new Error(`Pandoc output is missing ${figureLabel}`);
}
html = html.replace(
  figurePattern,
  '$1\n<img src="assets/rl/actor-critic-interface.svg" alt="A fixed prompt-and-response prefix feeding separate policy and value transformers, which produce a token distribution and scalar value estimate." />\n',
);

html = html.replace(/\s+data-latex-placement="[^"]*"/g, '');
html = html.replace(/\s+data-reference-(?:type|reference)="[^"]*"/g, '');

const bibliographyPattern = /<div class="thebibliography">([\s\S]*?)<\/div>/;
const bibliographyMatch = html.match(bibliographyPattern);
if (!bibliographyMatch) throw new Error('Pandoc did not emit the RL bibliography');

const bibliographyParagraphs = [
  ...bibliographyMatch[1].matchAll(/<p>([\s\S]*?)<\/p>/g),
].map(match => match[1]);

if (bibliographyParagraphs[0]?.includes('<span>99</span>')) {
  bibliographyParagraphs.shift();
}

if (bibliographyParagraphs.length !== allBibliographyKeys.length) {
  throw new Error(
    `RL bibliography mismatch: ${bibliographyParagraphs.length} entries for ${allBibliographyKeys.length} keys`,
  );
}

const bibliography = allBibliographyKeys
  .map((key, index) => ({ key, entry: bibliographyParagraphs[index] }))
  .filter(({ key }) => citedKeySet.has(key))
  .map(({ key, entry }) => `<li id="ref-${key}">${entry}</li>`)
  .join('\n');

html = html.replace(
  bibliographyPattern,
  `<section class="references" aria-labelledby="rl-references-heading">
<h2 id="rl-references-heading">References</h2>
<ol>
${bibliography}
</ol>
</section>`,
);

html = html.replace(/[ \t]+$/gm, '');

await writeFile(htmlPath, html);
process.stdout.write(
  `${htmlPath}: linked ${bibliographyKeys.length} references and mapped the actor–critic figure\n`,
);
