import { execFileSync } from 'node:child_process';
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

const [sourcePath, outputDirectory] = process.argv.slice(2);

if (!sourcePath || !outputDirectory) {
  throw new Error('Usage: node render-cuda-figures.mjs <source.tex> <output-directory>');
}

const source = await readFile(sourcePath, 'utf8');
const figurePattern = /\\begin\{figure\}(?:\[[^\]]*\])?([\s\S]*?)\\end\{figure\}/g;
const figures = [];

for (const match of source.matchAll(figurePattern)) {
  const figure = match[0];
  const tikzStart = figure.indexOf('\\begin{tikzpicture}');
  const tikzEndMarker = '\\end{tikzpicture}';
  const tikzEnd = figure.indexOf(tikzEndMarker);
  if (tikzStart < 0 || tikzEnd < 0) continue;

  const label = figure.match(/\\label\{fig:([^}]+)\}/)?.[1];
  if (!label) throw new Error('A CUDA TikZ figure is missing its fig: label');

  figures.push({
    label,
    tikz: figure.slice(tikzStart, tikzEnd + tikzEndMarker.length),
  });
}

if (figures.length === 0) throw new Error('No CUDA TikZ figures found');

const buildDirectory = await mkdtemp(join(tmpdir(), 'cuda-note-figures-'));
const texPath = join(buildDirectory, 'cuda-figures.tex');
const pdfPath = join(buildDirectory, 'cuda-figures.pdf');

const tex = String.raw`\documentclass[multi=tikzpicture,border=4pt]{standalone}
\usepackage{amsmath,amssymb}
\usepackage{xcolor}
\usepackage{tikz}
\usetikzlibrary{arrows.meta,calc,decorations.pathreplacing,fit,positioning}
\definecolor{nvidiagreen}{HTML}{76B900}
\newcommand{\code}[1]{\texttt{#1}}
\newcommand{\CUDA}{\textsc{Cuda}}
\newcommand{\CPU}{\textsc{Cpu}}
\newcommand{\GPU}{\textsc{Gpu}}
\newcommand{\bigO}{\mathcal{O}}
\begin{document}
${figures.map(({ tikz }) => tikz).join('\n\n')}
\end{document}
`;

await mkdir(resolve(outputDirectory), { recursive: true });
await writeFile(texPath, tex);

try {
  execFileSync(
    'pdflatex',
    ['-interaction=batchmode', '-halt-on-error', '-output-directory', buildDirectory, texPath],
    { stdio: 'pipe' },
  );

  const pagePattern = join(buildDirectory, 'page-%d.pdf');
  execFileSync('pdfseparate', [pdfPath, pagePattern], { stdio: 'pipe' });

  for (const [index, { label }] of figures.entries()) {
    const pagePath = join(buildDirectory, `page-${index + 1}.pdf`);
    const svgPath = resolve(outputDirectory, `${label}.svg`);
    execFileSync('pdftocairo', ['-svg', pagePath, svgPath], { stdio: 'pipe' });
  }
} catch (error) {
  const details = [error.stdout, error.stderr]
    .filter(Boolean)
    .map(buffer => buffer.toString())
    .join('\n');
  throw new Error(`Could not render CUDA TikZ figures\n${details}`, { cause: error });
} finally {
  await rm(buildDirectory, { recursive: true, force: true });
}

process.stdout.write(`Rendered ${figures.length} CUDA TikZ figures to ${outputDirectory}.\n`);
