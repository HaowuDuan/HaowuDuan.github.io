import { readFile, writeFile } from 'node:fs/promises';

const [inputPath, outputPath] = process.argv.slice(2);

if (!inputPath || !outputPath) {
  throw new Error('Usage: node prepare-cuda-source.mjs <input.tex> <output.tex>');
}

const source = await readFile(inputPath, 'utf8');
const figurePattern = /\\begin\{figure\}(?:\[[^\]]*\])?([\s\S]*?)\\end\{figure\}/g;

function normalizeTabularx(input) {
  const marker = '\\begin{tabularx}{\\textwidth}{';
  const endMarker = '\\end{tabularx}';
  let cursor = 0;
  let normalized = '';

  while (true) {
    const start = input.indexOf(marker, cursor);
    if (start < 0) return normalized + input.slice(cursor);

    const specificationStart = start + marker.length;
    let depth = 1;
    let specificationEnd = specificationStart;
    while (depth > 0 && specificationEnd < input.length) {
      const character = input[specificationEnd];
      if (character === '{') depth += 1;
      if (character === '}') depth -= 1;
      specificationEnd += 1;
    }
    if (depth !== 0) throw new Error('Unbalanced tabularx column specification');

    const tableEnd = input.indexOf(endMarker, specificationEnd);
    if (tableEnd < 0) throw new Error('A tabularx environment is not closed');

    const body = input.slice(specificationEnd, tableEnd);
    const columnCount = Math.max(
      ...body
        .split(/\\\\/g)
        .map(row => (row.match(/(?<!\\)&/g) ?? []).length + 1),
    );
    const columns = 'l'.repeat(columnCount);

    normalized += input.slice(cursor, start);
    normalized += `\\begin{tabular}{${columns}}${body}\\end{tabular}`;
    cursor = tableEnd + endMarker.length;
  }
}

const prepared = normalizeTabularx(source)
  .replace('\\begin{abstract}', '')
  .replace('\\end{abstract}', '')
  .replace(figurePattern, figure => {
    const tikzStart = figure.indexOf('\\begin{tikzpicture}');
    const tikzEndMarker = '\\end{tikzpicture}';
    const tikzEnd = figure.indexOf(tikzEndMarker);
    if (tikzStart < 0 || tikzEnd < 0) return figure;

    const label = figure.match(/\\label\{fig:([^}]+)\}/)?.[1];
    if (!label) throw new Error('A CUDA TikZ figure is missing its fig: label');

    const image = `\\includegraphics[width=\\textwidth]{assets/cuda/${label}.svg}`;
    const resizeMarker = '\\resizebox{\\textwidth}{!}{%';
    const resizeStart = figure.lastIndexOf(resizeMarker, tikzStart);

    if (resizeStart >= 0) {
      const afterTikz = tikzEnd + tikzEndMarker.length;
      const resizeClose = figure.slice(afterTikz).match(/^%?\s*\}/)?.[0];
      if (!resizeClose) throw new Error(`Could not remove resizebox around ${label}`);
      return `${figure.slice(0, resizeStart)}${image}${figure.slice(afterTikz + resizeClose.length)}`;
    }

    return `${figure.slice(0, tikzStart)}${image}${figure.slice(tikzEnd + tikzEndMarker.length)}`;
  })
  .replaceAll('figures/nvidia-ga100-full-gpu.png', 'assets/cuda/nvidia-ga100-full-gpu.png')
  .replaceAll('figures/nvidia-ga100-sm.png', 'assets/cuda/nvidia-ga100-sm.png')
  .replaceAll('figures/rtx3090-roofline.pdf', 'assets/cuda/rtx3090-roofline.png');

await writeFile(outputPath, prepared);
