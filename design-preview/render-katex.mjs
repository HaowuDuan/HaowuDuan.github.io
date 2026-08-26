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

function equationMetadata(tex, equationNumber) {
  const environment = tex.match(/\\begin\{(equation|align)(\*)?\}/);
  const numbered = Boolean(environment && !environment[2]);
  const label = tex.match(/\\label\{([^}]+)\}/)?.[1] ?? null;

  return {
    label,
    number: numbered ? equationNumber + 1 : null,
    nextNumber: numbered ? equationNumber + 1 : equationNumber,
  };
}

function normalizeTex(tex) {
  return tex
    .replace(/\\label\{[^}]+\}/g, "")
    .replace(/\\nonumber/g, "")
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
    if (equation.label && equation.number) {
      equationLabels.set(equation.label, equation.number);
    }
    return equation;
  });
  let formulaIndex = 0;

  const rendered = source.replace(mathPattern, (match, display, encodedTex, offset) => {
    const tex = decodeHtml(encodedTex.trim());
    const renderTex = normalizeTex(tex);
    const equation = metadata[formulaIndex];
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
      const renderedMath = equation?.number
        ? `<span class="equation-block"${equation.label ? ` id="${equation.label}"` : ''}>${katexHtml}<span class="equation-number" aria-hidden="true">(${equation.number})</span></span>`
        : katexHtml;

      return withProseBoundarySpacing(source, offset, match.length, renderedMath);
    } catch (error) {
      throw new Error(`${file}: KaTeX could not render formula ${count}: ${renderTex}`, {
        cause: error,
      });
    }
  });

  const linked = rendered.replace(
    /<a\s+([^>]*data-reference-type="eqref"[^>]*)>[\s\S]*?<\/a>/g,
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
    `${file}: rendered ${count} formulas with KaTeX and numbered ${equationNumber} equation blocks\n`,
  );
}

for (const file of process.argv.slice(2)) {
  await renderFile(file);
}
