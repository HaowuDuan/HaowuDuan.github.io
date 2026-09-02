import { readFile, writeFile } from 'node:fs/promises';

const [htmlPath, texPath] = process.argv.slice(2);

if (!htmlPath || !texPath) {
  throw new Error('Usage: node prepare-cuda-note.mjs <html> <tex>');
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
      if (!number) throw new Error(`Unknown CUDA bibliography key: ${key}`);
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
  ['cpu-gpu-interaction.svg', 'Control and data movement between the CPU, host memory, GPU, and device memory.'],
  ['cuda-programming-model.svg', 'CUDA grid, block, thread, warp, and streaming-multiprocessor hierarchy.'],
  ['cuda-index-1d.svg', 'One-dimensional CUDA block and thread indexing.'],
  ['cuda-index-2d.svg', 'Two-dimensional CUDA indexing and row-major flattening.'],
  ['unified-memory.svg', 'Unified Memory movement between CPU and GPU.'],
  ['bandwidth-fusion.svg', 'Memory traffic before and after kernel fusion.'],
  ['transpose-tile-map.svg', 'CUDA thread mapping for a tiled matrix transpose.'],
  ['warp-divergence.svg', 'Warp execution with alternating branch choices.'],
  ['atomic-contention.svg', 'Direct and block-reduced atomic updates.'],
  ['latency-hiding.svg', 'Ready warps hiding memory latency on a streaming multiprocessor.'],
  ['launch-overhead.svg', 'GPU idle intervals between repeated small kernel launches.'],
  ['transfer-bound.svg', 'Repeated host-device transfers compared with keeping data on the GPU.'],
  ['nvidia-ga100-full-gpu.png', 'NVIDIA GA100 full-chip block diagram.'],
  ['nvidia-ga100-sm.png', 'NVIDIA GA100 streaming multiprocessor block diagram.'],
  ['rtx3090-roofline.png', 'Measured RTX 3090 roofline with memory-bound and compute-bound examples.'],
]);

for (const [filename, alt] of figureAltText) {
  const escapedFilename = filename.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const imagePattern = new RegExp(`<img src="(?:assets/cuda/)?${escapedFilename}"`);
  if (!imagePattern.test(html)) {
    throw new Error(`Pandoc output is missing CUDA figure ${filename}`);
  }
  html = html.replace(
    imagePattern,
    `<img src="assets/cuda/${filename}" alt="${alt}"`,
  );
}

const bibliographyPattern = /<div class="thebibliography">([\s\S]*?)<\/div>/;
const bibliographyMatch = html.match(bibliographyPattern);
if (!bibliographyMatch) throw new Error('Pandoc did not emit the CUDA bibliography');

const bibliographyParagraphs = [
  ...bibliographyMatch[1].matchAll(/<p>([\s\S]*?)<\/p>/g),
].map(match => match[1]);

if (bibliographyParagraphs[0]?.includes('<span>99</span>')) {
  bibliographyParagraphs.shift();
}

if (bibliographyParagraphs.length !== allBibliographyKeys.length) {
  throw new Error(
    `CUDA bibliography mismatch: ${bibliographyParagraphs.length} entries for ${allBibliographyKeys.length} keys`,
  );
}

const bibliography = allBibliographyKeys
  .map((key, index) => ({ key, entry: bibliographyParagraphs[index] }))
  .filter(({ key }) => citedKeySet.has(key))
  .map(({ key, entry }) => `<li id="ref-${key}">${entry}</li>`)
  .join('\n');

html = html.replace(
  /<h2 class="unnumbered" id="sources">Sources<\/h2>([\s\S]*?)<div class="thebibliography">[\s\S]*?<\/div>/,
  `<section class="references" aria-labelledby="sources">
<h2 id="sources">Sources</h2>$1
<ol>
${bibliography}
</ol>
</section>`,
);

html = html.replace(/[ \t]+$/gm, '');

await writeFile(htmlPath, html);
process.stdout.write(
  `${htmlPath}: linked ${bibliographyKeys.length} cited references and mapped ${figureAltText.size} figures\n`,
);
