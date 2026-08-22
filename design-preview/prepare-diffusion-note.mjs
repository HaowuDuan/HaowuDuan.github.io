import { readFile, writeFile } from 'node:fs/promises';

const [htmlPath, texPath] = process.argv.slice(2);

if (!htmlPath || !texPath) {
  throw new Error('Usage: node prepare-diffusion-note.mjs <html> <tex>');
}

const [sourceHtml, sourceTex] = await Promise.all([
  readFile(htmlPath, 'utf8'),
  readFile(texPath, 'utf8'),
]);

const bibliographyKeys = [...sourceTex.matchAll(/\\bibitem\{([^}]+)\}/g)].map(
  match => match[1],
);
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

const bibliographyPattern = /<div class="thebibliography">([\s\S]*?)<\/div>/;
const bibliographyMatch = html.match(bibliographyPattern);
if (!bibliographyMatch) throw new Error('Pandoc did not emit the bibliography');

const bibliographyParagraphs = [
  ...bibliographyMatch[1].matchAll(/<p>([\s\S]*?)<\/p>/g),
].map(match => match[1]);

if (bibliographyParagraphs[0]?.includes('<span>99</span>')) {
  bibliographyParagraphs.shift();
}

if (bibliographyParagraphs.length !== bibliographyKeys.length) {
  throw new Error(
    `Bibliography mismatch: ${bibliographyParagraphs.length} entries for ${bibliographyKeys.length} keys`,
  );
}

const bibliography = bibliographyParagraphs
  .map(
    (entry, index) =>
      `<li id="ref-${bibliographyKeys[index]}">${entry}</li>`,
  )
  .join('\n');

html = html.replace(
  bibliographyPattern,
  `<section class="references" aria-labelledby="references-heading">
<h2 id="references-heading">References</h2>
<ol>
${bibliography}
</ol>
</section>`,
);

const emptyTikzContainer = /<div class="center">\s*<\/div>/;
if (!emptyTikzContainer.test(html)) {
  throw new Error('Pandoc output no longer contains the expected TikZ position');
}

html = html.replace(
  emptyTikzContainer,
  `<figure class="distribution-paths-figure">
<img src="assets/diffusion-distribution-paths.svg" alt="Three different paths connecting the data distribution P zero to the terminal distribution P T">
<figcaption>Different distribution paths can share the same initial and terminal densities.</figcaption>
  </figure>`,
);

html = html.replace(/[ \t]+$/gm, '');

await writeFile(htmlPath, html);
process.stdout.write(
  `${htmlPath}: linked ${bibliographyKeys.length} references and restored the TikZ figure\n`,
);
