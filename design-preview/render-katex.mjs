import { readFile, writeFile } from "node:fs/promises";
import katex from "katex";

const mathPattern = /<math\s+display="(inline|block)"[^>]*>[\s\S]*?<annotation encoding="application\/x-tex">([\s\S]*?)<\/annotation>[\s\S]*?<\/math>/g;

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

async function renderFile(file) {
  const source = await readFile(file, "utf8");
  let count = 0;

  const rendered = source.replace(mathPattern, (_, display, encodedTex) => {
    const tex = decodeHtml(encodedTex.trim());
    count += 1;

    try {
      return katex.renderToString(tex, {
        displayMode: display === "block",
        output: "htmlAndMathml",
        throwOnError: true,
        strict: "warn",
        trust: false,
      });
    } catch (error) {
      throw new Error(`${file}: KaTeX could not render formula ${count}: ${tex}`, {
        cause: error,
      });
    }
  });

  await writeFile(file, rendered);
  process.stdout.write(`${file}: rendered ${count} formulas with KaTeX\n`);
}

for (const file of process.argv.slice(2)) {
  await renderFile(file);
}
