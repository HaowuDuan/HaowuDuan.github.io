import { execFileSync } from 'node:child_process';
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { basename, join } from 'node:path';
import { tmpdir } from 'node:os';

const [texPath, outputDirectory] = process.argv.slice(2);

if (!texPath || !outputDirectory) {
  throw new Error('Usage: node render-rl-figure.mjs <tex> <output-directory>');
}

const source = await readFile(texPath, 'utf8');
const figures = [...source.matchAll(/\\begin\{figure\}(?:\[[^\]]*\])?([\s\S]*?)\\end\{figure\}/g)]
  .map(match => {
    const body = match[1];
    const label = body.match(/\\label\{(fig:[^}]+)\}/)?.[1];
    const tikz = body.match(/\\begin\{tikzpicture\}[\s\S]*?\\end\{tikzpicture\}/)?.[0];
    if (!label || !tikz) throw new Error('Every RL figure must have one label and one TikZ picture');
    return { label, tikz };
  });

if (figures.length !== 1) {
  throw new Error(`Expected 1 RL figure, found ${figures.length}`);
}

const temporaryDirectory = await mkdtemp(join(tmpdir(), 'rl-figures-'));
await mkdir(outputDirectory, { recursive: true });

const preamble = String.raw`\documentclass[tikz,border=8pt]{standalone}
\usepackage{amsmath,amssymb,bm}
\usepackage{tikz}
\usetikzlibrary{arrows.meta,positioning}
`;

try {
  for (const { label, tikz } of figures) {
    const name = label.replace(/^fig:/, '').replace(/[^a-zA-Z0-9-]+/g, '-');
    const figureTexPath = join(temporaryDirectory, `${name}.tex`);
    const figurePdfPath = join(temporaryDirectory, `${name}.pdf`);
    const figureSvgPath = join(outputDirectory, `${name}.svg`);
    await writeFile(
      figureTexPath,
      `${preamble}\n\\begin{document}\n${tikz}\n\\end{document}\n`,
    );

    try {
      execFileSync('pdflatex', [
        '-interaction=batchmode',
        '-halt-on-error',
        `-output-directory=${temporaryDirectory}`,
        figureTexPath,
      ], { stdio: 'pipe' });
      execFileSync('pdftocairo', ['-svg', figurePdfPath, figureSvgPath], { stdio: 'pipe' });
    } catch (error) {
      const logPath = join(temporaryDirectory, `${name}.log`);
      let log = '';
      try { log = await readFile(logPath, 'utf8'); } catch {}
      throw new Error(`Could not render ${basename(figureTexPath)}\n${log.slice(-4000)}`, { cause: error });
    }
  }
} finally {
  await rm(temporaryDirectory, { recursive: true, force: true });
}

process.stdout.write(`Rendered ${figures.length} reinforcement-learning figure to ${outputDirectory}.\n`);
