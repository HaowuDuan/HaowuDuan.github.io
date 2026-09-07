import { execFileSync } from 'node:child_process';
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { basename, join } from 'node:path';
import { tmpdir } from 'node:os';

const [texPath, outputDirectory] = process.argv.slice(2);

if (!texPath || !outputDirectory) {
  throw new Error('Usage: node render-data-figures.mjs <tex> <output-directory>');
}

const source = await readFile(texPath, 'utf8');
const names = [
  'ddp-workflow',
  'olmo-index-workflow',
  'zero-stage-memory',
  'fsdp-layer-communication',
];
const pictures = [...source.matchAll(/\\begin\{tikzpicture\}[\s\S]*?\\end\{tikzpicture\}/g)]
  .map(match => match[0]);

if (pictures.length !== names.length) {
  throw new Error(`Expected ${names.length} data-pipeline diagrams, found ${pictures.length}`);
}

const temporaryDirectory = await mkdtemp(join(tmpdir(), 'data-figures-'));
await mkdir(outputDirectory, { recursive: true });

const preamble = String.raw`\documentclass[tikz,border=8pt]{standalone}
\usepackage{amsmath}
\usepackage{xcolor}
\usepackage{tikz}
\usetikzlibrary{arrows.meta,positioning}
`;

try {
  for (const [index, tikz] of pictures.entries()) {
    const name = names[index];
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

process.stdout.write(`Rendered ${pictures.length} pre-training diagrams to ${outputDirectory}.\n`);
