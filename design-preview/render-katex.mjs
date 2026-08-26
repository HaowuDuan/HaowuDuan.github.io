import { readFile, writeFile } from "node:fs/promises";
import katex from "katex";

const mathPattern = /<math\s+display="(inline|block)"[^>]*>[\s\S]*?<annotation encoding="application\/x-tex">([\s\S]*?)<\/annotation>[\s\S]*?<\/math>/g;
const fallbackMathPattern = /<span\s+class="math (inline|display)">([\s\S]*?)<\/span>/g;
const proseCharacterPattern = /[\p{L}\p{N}]/u;

function decodeHtml(text) {
  return text
    .replace(/&#x([0-9a-f]+);/gi, (_, value) =>
      String.fromCodePoint(Number.parseInt(value, 16)),
    )
    .replace(/&#([0-9]+);/g, (_, value) =>
      String.fromCodePoint(Number.parseInt(value, 10)),
    )
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;|&#39;/g, "'")
    .replace(/&amp;/g, "&");
}

function normalizePandocFallbackMath(source) {
  return source.replace(fallbackMathPattern, (_, mode, encodedTex) => {
    let tex = encodedTex.trim();
    const delimiterLength = mode === 'display' ? 2 : 1;
    const delimiter = '$'.repeat(delimiterLength);

    if (tex.startsWith(delimiter) && tex.endsWith(delimiter)) {
      tex = tex.slice(delimiterLength, -delimiterLength).trim();
    }

    const display = mode === 'display' ? 'block' : 'inline';
    return `<math display="${display}"><annotation encoding="application/x-tex">${tex}</annotation></math>`;
  });
}

function splitAlignRows(tex) {
  const body = tex.match(
    /\\begin\{align\*?\}([\s\S]*?)\\end\{align\*?\}/,
  )?.[1] ?? '';

  return body
    .split(/\\\\(?:\s*\[[^\]]*\])?/g)
    .filter(row => row.trim().length > 0);
}

function labelsIn(tex) {
  return [...tex.matchAll(/\\label\{([^}]+)\}/g)].map(match => match[1]);
}

function equationMetadata(tex, equationNumber) {
  const environment = tex.match(/\\begin\{(equation|align)(\*)?\}/);
  const numbered = Boolean(environment && !environment[2]);

  if (!environment) {
    return {
      kind: null,
      labels: [],
      number: null,
      rows: [],
      nextNumber: equationNumber,
    };
  }

  if (environment[1] === 'align') {
    let nextNumber = equationNumber;
    const rows = splitAlignRows(tex).map(texRow => {
      const rowNumbered = numbered && !/\\(?:nonumber|notag)\b/.test(texRow);
      const number = rowNumbered ? ++nextNumber : null;
      return {
        tex: texRow,
        number,
        labels: labelsIn(texRow).map(label => ({ label, number })),
      };
    });

    return {
      kind: 'align',
      labels: rows.flatMap(row => row.labels),
      number: null,
      rows,
      nextNumber,
    };
  }

  const number = numbered ? equationNumber + 1 : null;
  return {
    kind: 'equation',
    labels: labelsIn(tex).map(label => ({ label, number })),
    number,
    rows: [],
    nextNumber: number ?? equationNumber,
  };
}

function stripEquationCommands(tex) {
  return tex
    .replace(/\\label\{[^}]+\}/g, "")
    .replace(/\\(?:nonumber|notag)\b/g, "")
    .trim();
}

function normalizeTex(tex, equation) {
  if (equation?.kind === 'align') {
    const rows = equation.rows.map(row => {
      const normalizedRow = stripEquationCommands(row.tex);
      const number = row.number ? ` && \\text{(${row.number})}` : '';
      return `${normalizedRow}${number}`;
    });

    return `\\begin{aligned}\n${rows.join('\\\\\n')}\n\\end{aligned}`;
  }

  return stripEquationCommands(tex)
    .replace(/\\begin\{equation\*?\}/g, "")
    .replace(/\\end\{equation\*?\}/g, "")
    .replace(/\\begin\{align\*?\}/g, "\\begin{aligned}")
    .replace(/\\end\{align\*?\}/g, "\\end{aligned}")
    .trim();
}

function withProseBoundarySpacing(source, offset, matchLength, html) {
  const previousCharacter = source[offset - 1] ?? '';
  const nextCharacter = source[offset + matchLength] ?? '';
  const leadingSpace = proseCharacterPattern.test(previousCharacter) ? ' ' : '';
  const trailingSpace = proseCharacterPattern.test(nextCharacter) ? ' ' : '';

  return `${leadingSpace}${html}${trailingSpace}`;
}

async function renderFile(file) {
  const source = normalizePandocFallbackMath(await readFile(file, "utf8"));
  let count = 0;
  let equationNumber = 0;
  const equationLabels = new Map();
  const metadata = [...source.matchAll(mathPattern)].map(match => {
    const display = match[1];
    const tex = decodeHtml(match[2].trim());
    if (display !== "block") return null;

    const equation = equationMetadata(tex, equationNumber);
    equationNumber = equation.nextNumber;
    for (const { label, number } of equation.labels) {
      if (number) equationLabels.set(label, number);
    }
    return equation;
  });
  let formulaIndex = 0;

  const rendered = source.replace(mathPattern, (match, display, encodedTex, offset) => {
    const tex = decodeHtml(encodedTex.trim());
    const equation = metadata[formulaIndex];
    const renderTex = normalizeTex(tex, equation);
    formulaIndex += 1;
    count += 1;

    try {
      const katexHtml = katex.renderToString(renderTex, {
        displayMode: display === "block",
        output: "html",
        throwOnError: true,
        strict: "warn",
        trust: false,
      });
      const numbered = equation?.number || equation?.rows.some(row => row.number);
      const labels = equation?.labels.map(item => item.label) ?? [];
      const primaryLabel = labels[0] ?? null;
      const additionalAnchors = labels
        .slice(1)
        .map(label => `<span class="equation-anchor" id="${label}" aria-hidden="true"></span>`)
        .join('');
      const multilineClass = equation?.kind === 'align'
        ? ' equation-block-multiline'
        : '';
      const equationNumbers = equation?.kind === 'align'
        ? equation.rows.flatMap(row => row.number ? [row.number] : [])
        : equation?.number ? [equation.number] : [];
      const renderedMath = numbered
        ? `<span class="equation-block${multilineClass}" data-equation-numbers="${equationNumbers.join(',')}"${primaryLabel ? ` id="${primaryLabel}"` : ''}>${additionalAnchors}${katexHtml}${equation?.number ? `<span class="equation-number" aria-hidden="true">(${equation.number})</span>` : ''}</span>`
        : katexHtml;

      return withProseBoundarySpacing(source, offset, match.length, renderedMath);
    } catch (error) {
      throw new Error(`${file}: KaTeX could not render formula ${count}: ${renderTex}`, {
        cause: error,
      });
    }
  });

  const linked = rendered.replace(
    /<a\s+([^>]*href="#[^"]+"[^>]*)>[\s\S]*?<\/a>/g,
    (match, attributes) => {
      const label = attributes.match(/href="#([^"]+)"/)?.[1];
      const number = label ? equationLabels.get(label) : null;
      return number
        ? `<a class="equation-reference" href="#${label}">(${number})</a>`
        : match;
    },
  );

  await writeFile(file, linked.replace(/[ \t]+$/gm, ''));
  process.stdout.write(
    `${file}: rendered ${count} formulas with KaTeX and ${equationNumber} equation numbers\n`,
  );
}

for (const file of process.argv.slice(2)) {
  await renderFile(file);
}
