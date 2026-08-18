# Personal Site Design Direction

This document tracks the visual redesign of the personal site. The aim is a
quiet, editorial, text-first website for long technical writing: carefully
designed, but without portfolio theatrics, image-heavy layouts, or generic
AI-product styling.

The local mock site lives in `design-preview/`. It is retained as a tracked
design reference so future iterations can be compared with the accepted
direction. The accepted decisions from Rounds 1–3 are implemented in the
production Astro site under `src/`.

## Design principles

1. Reading is the primary interaction.
2. Visual differences should communicate structural or semantic differences.
3. Typography and proportion do more work than decoration.
4. Figures appear when they explain technical content, not as decoration.
5. Repeated cards, pills, shadows, gradients, and animation require a concrete
   reason to exist.
6. Every design choice must work for equations, code, tables, citations, and
   long articles as well as for the home page.

## Ranked improvements

Impact is ranked for this site's actual content rather than for a generic
portfolio.

| Rank | ID | Change | Expected impact | Round 1 | Decision |
| ---: | --- | --- | --- | --- | --- |
| 1 | D1 | Constrain the site shell and article measure | Very high — fixes the loose feeling on wide displays and directly improves long-form reading | Included | Accepted in preview |
| 2 | D2 | Establish an editorial typography system | Very high — creates character and hierarchy without adding visual objects | Included | Accepted in preview |
| 3 | D3 | Rebuild vertical rhythm and type scale | Very high — makes headings, paragraphs, metadata, and sections feel deliberately related | Included | Accepted in preview |
| 4 | D4 | Style technical content as first-class material | High — equations, algorithms, code, tables, figures, and captions become comfortable to read | Included | Accepted in preview |
| 5 | D5 | Clarify the home-page information hierarchy | High — makes identity, research, writing, and publications easy to scan without a hero section | Included | Accepted in preview |
| 6 | D6 | Use a quiet paper-and-ink palette | Medium-high — removes the bright template-like blue/gray feeling while preserving a clear accent | Included | Accepted in preview |
| 7 | D7 | Simplify navigation and remove glass effects | Medium — makes the site feel more editorial and less like a product interface | Included lightly | Accepted in preview |
| 8 | D8 | Replace cards and pills with rules and spacing | Medium — helps the CV, publication list, and tags feel like documents rather than dashboard widgets | Round 2 | Accepted in preview |
| 9 | D9 | Refine article and book navigation | Medium — improves long-article orientation, linked sections, chapter access, and mobile reading | Round 3 | Accepted and implemented |
| 10 | D10 | Refine dark mode, favicon, and micro-details | Low initially — worthwhile after the main proportions are accepted | Deferred | Pending |

## Round 1: proportion and reading

Round 1 deliberately changes the high-impact foundation before redesigning
every component.

### Included

- A maximum site shell near 1184 px rather than a percentage-only width.
- A prose measure of approximately 74 characters after the first review found
  the initial 68-character measure too narrow.
- A serif reading face with a neutral sans-serif interface face, using local
  system fonts in the mock so it has no font-service dependency.
- A restrained type scale rather than oversized display headings.
- Consistent spacing relationships between headings and the text they govern.
- A warm neutral background, ink-like text, and one muted blue link color.
- Flat editorial lists on the home page.
- Full styling for the real draft article: math, code, tables, blockquotes,
  algorithms, figures, captions, and horizontal rules.
- Responsive home, article, and book-note layouts.

### Intentionally unchanged or deferred

- The site's existing route and content structure.
- The overall navigation vocabulary.
- Major CV and publication layout changes.
- Sidenotes, backlinks, reading-progress indicators, search, and other advanced
  writing features.
- Decorative imagery or a portrait.

## Proposed measurements

| Element | Round 1 value |
| --- | --- |
| Site shell | `74rem` maximum |
| Prose column | `74ch` maximum |
| Body text | `1.125rem` at `1.68` line height |
| Article text | `1.1875rem` at `1.72` line height |
| Navigation text | `0.9rem` |
| Small metadata | `0.875rem` |
| Book sidebar | `13.5rem` |

These values are starting points, not permanent rules. They should be judged on
the real article rather than in isolation.

## Content handling

- `src/content/blog/hello-world.md` is a placeholder and will be removed.
- `drafts/blog1/draft_jimwlk.md` remains a draft and is not copied into the
  production Astro collection.
- The tracked preview renders the draft so that design decisions can be tested
  against realistic technical content.
- Publication requires a separate explicit approval.

## Round 2: content-heavy pages

Round 2 applies the accepted foundation to the blog archive, publications, CV,
projects, and repositories. Cards, badges, and pill filters are replaced with
aligned metadata columns, flat lists, quiet topic links, and thin rules. The
purpose is to verify that the visual language can handle dense structured data
without becoming a dashboard.

### Included

- A blog archive with date, title, description, and plain-text topic labels.
- All current publications with aligned year/journal metadata and restrained
  external links.
- A CV with date columns and flat sections instead of rounded cards.
- Placeholder project and repository pages that establish the intended future
  list treatment without inventing content.
- Responsive single-column fallbacks for publication and CV entries.

## Review workflow

After reviewing `design-preview/index.html` and
`design-preview/article.html`, decisions can be recorded using the IDs above.
For example:

```text
Accept D1, D3, and D4.
Reject D6; keep a white background.
Revise D2 with sans-serif article text.
```

Accepted decisions are applied to the production Astro site. Rejected or
revised decisions stay documented so later rounds do not accidentally
reintroduce them.

## Production implementation

Rounds 1–3 are now represented by shared Astro layouts and production styles.
The Markdown pipeline renders LaTeX through KaTeX during the build and bundles
the KaTeX fonts locally. Long blog posts receive a responsive contents rail,
linked headings, technical-content overflow handling, and print styles. Book
notes use the accepted chapter rail and previous/next navigation.

`design-preview/` and `drafts/` are both repository content. The JIMWLK draft
remains outside `src/content/blog`, so tracking the draft does not publish it.

## Round 3: technical reading and navigation

Round 3 adds orientation and reference tools only where content is long enough
to require them. These controls should remain subordinate to the article.

### Included

- A right-hand contents rail for long articles on wide screens, using otherwise
  empty space without narrowing the accepted text measure.
- A compact native disclosure for article contents on smaller screens.
- Stable heading anchors, with link markers that appear only on hover or focus.
- Current-section indication in the article contents rail.
- A desktop chapter rail and compact mobile chapter disclosure for book notes.
- Previous/next chapter navigation.
- Consistent overflow behavior for wide code, tables, equations, and figures.
- Footnote, citation, and print treatments that preserve a linear reading order.

### Explicitly excluded

- Reading-progress bars, floating action buttons, copy buttons, animated page
  transitions, or always-visible link icons.
- A contents rail on short pages, the home page, CV, or publication archive.

## Decision log

| Date | Decision | Notes |
| --- | --- | --- |
| 2026-08-18 | Round 1 prepared | Initial direction awaiting review |
| 2026-08-18 | D1 revised | Increased the prose measure from `68ch` to `74ch`; the first pass felt too narrow |
| 2026-08-18 | D4 implementation revised | Preview equations now use native MathML instead of external MathJax |
| 2026-08-18 | D3 revised | Reduced the article-title maximum from `4.85rem` to `3.55rem`; it read as a hero rather than an essay title |
| 2026-08-18 | D2 revised | Increased regular text to 18px and article text to 19px, with matching increases for technical metadata, tables, code, and captions |
| 2026-08-18 | D2 revised | Justified direct article paragraphs with automatic English hyphenation to create a consistent text edge without stretching code, equations, or tables |
| 2026-08-18 | Round 1 accepted in preview | Proportion, typography, rhythm, technical content, home hierarchy, palette, and navigation direction approved for continued iteration |
| 2026-08-18 | Round 2 prepared | D8 applied to the blog archive, publications, CV, projects, and repositories for review |
| 2026-08-18 | Round 2 accepted in preview | Flat lists, metadata columns, topic links, and content-heavy page treatments approved |
| 2026-08-18 | Round 3 prepared | D9 article and book navigation features added for review |
| 2026-08-18 | Round 3 equation correction | Replaced hand-authored sample MathML in the LLM note with MathML generated from its LaTeX source |
| 2026-08-18 | Round 3 equation rendering revised | Replaced browser-native MathML presentation with build-time KaTeX, bundled fonts, and TeX-grade spacing; semantic MathML remains in the output for accessibility |
| 2026-08-18 | KaTeX display regression fixed | Removed a conflicting full-bleed centering rule that collapsed the visible display-equation container to zero width |
| 2026-08-18 | Rounds 1–3 implemented | Transferred the accepted editorial system, data-page layouts, book navigation, article contents, and local build-time KaTeX into the production Astro site |
| 2026-08-18 | Preview and drafts retained | Removed the preview ignore rule; both the design reference and writing drafts can be versioned without publishing draft content |
