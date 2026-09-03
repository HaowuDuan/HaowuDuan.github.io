import { execFileSync } from 'node:child_process';
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { basename, join } from 'node:path';
import { tmpdir } from 'node:os';

const [texPath, outputDirectory] = process.argv.slice(2);

if (!texPath || !outputDirectory) {
  throw new Error('Usage: node render-architecture-figures.mjs <tex> <output-directory>');
}

const source = await readFile(texPath, 'utf8');

function deriveEquationNumbers(tex) {
  const withoutComments = tex.replace(/(^|[^\\])%.*$/gm, '$1');
  const numbers = new Map();
  let equationNumber = 0;
  const environments = /\\begin\{(equation|align)(\*)?\}([\s\S]*?)\\end\{(?:equation|align)\*?\}/g;

  for (const match of withoutComments.matchAll(environments)) {
    const [, kind, starred, body] = match;
    if (starred) continue;

    const rows = kind === 'align'
      ? body.split(/\\\\(?:\s*\[[^\]]*\])?/g).filter(row => row.trim())
      : [body];

    for (const row of rows) {
      const numbered = !/\\(?:nonumber|notag)\b/.test(row);
      if (numbered) equationNumber += 1;
      for (const labelMatch of row.matchAll(/\\label\{([^}]+)\}/g)) {
        if (!numbered) {
          throw new Error(`Equation label ${labelMatch[1]} is attached to an unnumbered row`);
        }
        numbers.set(labelMatch[1], String(equationNumber));
      }
    }
  }

  return numbers;
}

const equationNumbers = deriveEquationNumbers(source);

const figures = [...source.matchAll(/\\begin\{figure\}(?:\[[^\]]*\])?([\s\S]*?)\\end\{figure\}/g)]
  .map(match => {
    const body = match[1];
    const label = body.match(/\\label\{(fig:[^}]+)\}/)?.[1];
    const tikz = body.match(/\\begin\{tikzpicture\}[\s\S]*?\\end\{tikzpicture\}/)?.[0];
    if (!label || !tikz) throw new Error('Every architecture figure must have one label and one TikZ picture');
    return { label, tikz };
  });

if (figures.length !== 11) {
  throw new Error(`Expected 11 architecture figures, found ${figures.length}`);
}

const temporaryDirectory = await mkdtemp(join(tmpdir(), 'architecture-figures-'));
await mkdir(outputDirectory, { recursive: true });

const preamble = String.raw`\documentclass[tikz,border=8pt]{standalone}
\usepackage{amsmath,amssymb,mathtools}
\usepackage{bm}
\usepackage{xcolor}
\usepackage{tikz}
\usetikzlibrary{arrows.meta,positioning,calc}
\newcommand{\R}{\mathbb{R}}
\newcommand{\softmax}{\operatorname{softmax}}
\newcommand{\TopK}{\operatorname{TopK}}
\newcommand{\RMSNorm}{\operatorname{RMSNorm}}
\newcommand{\LN}{\operatorname{LN}}
\newcommand{\SiLU}{\operatorname{SiLU}}
`;

try {
  for (const { label, tikz } of figures) {
    const name = label.replace(/^fig:/, '').replace(/[^a-zA-Z0-9-]+/g, '-');
    const resolvedTikz = tikz.replace(/\\eqref\{([^}]+)\}/g, (_, reference) => {
      const number = equationNumbers.get(reference);
      if (!number) throw new Error(`Figure ${label} references unknown equation ${reference}`);
      return `(${number})`;
    });
    const figureTexPath = join(temporaryDirectory, `${name}.tex`);
    const figurePdfPath = join(temporaryDirectory, `${name}.pdf`);
    const figureSvgPath = join(outputDirectory, `${name}.svg`);
    await writeFile(
      figureTexPath,
      `${preamble}\n\\begin{document}\n${resolvedTikz}\n\\end{document}\n`,
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

process.stdout.write(`Rendered ${figures.length} Modern LLM Architecture figures to ${outputDirectory}.\n`);
