#!/usr/bin/env bash
set -eu

cd "$(dirname "$0")"
mkdir -p assets
cp ../drafts/blog1/assets/roofline-demo.svg assets/roofline-demo.svg

mkdir -p vendor/katex/fonts
cp ../node_modules/katex/dist/katex.min.css vendor/katex/katex.min.css
cp ../node_modules/katex/dist/fonts/* vendor/katex/fonts/

sed '1d' ../drafts/blog1/draft_jimwlk.md | pandoc \
  --from=markdown+tex_math_dollars+fenced_code_blocks+pipe_tables \
  --to=html5 \
  --mathml \
  --toc \
  --toc-depth=3 \
  --template=article-template.html \
  --output=article.html

cp notes-template.html notes.html
node render-katex.mjs article.html notes.html
