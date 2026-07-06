import fs from 'node:fs';
import path from 'node:path';

export interface Publication {
  key: string;
  author: string;
  title: string;
  journal: string;
  year: string;
  volume?: string;
  pages?: string;
  doi?: string;
  eprint?: string;
  abbr?: string;
  selected?: boolean;
  inspirehep_id?: string;
}

export function parseBibTeX(filePath: string): Publication[] {
  const content = fs.readFileSync(filePath, 'utf-8');
  const entries: Publication[] = [];
  const entryRegex = /@\w+\{([^,]+),([\s\S]*?)(?=\n@|\n*$)/g;
  let match;
  while ((match = entryRegex.exec(content)) !== null) {
    const key = match[1].trim();
    const body = match[2];
    const field = (name: string): string => {
      const re = new RegExp(`${name}\\s*=\\s*[{"']?([^}"'\\n]+)`, 'i');
      const m = body.match(re);
      return m ? m[1].trim().replace(/[{}]/g, '') : '';
    };
    entries.push({
      key,
      author: field('author'),
      title: field('title').replace(/[{}]/g, ''),
      journal: field('journal'),
      year: field('year'),
      volume: field('volume') || undefined,
      pages: field('pages') || undefined,
      doi: field('doi') || undefined,
      eprint: field('eprint') || undefined,
      abbr: field('abbr') || undefined,
      selected: field('selected') === 'true',
      inspirehep_id: field('inspirehep_id') || undefined,
    });
  }
  return entries;
}

export function getPublications(): Publication[] {
  const bibPath = path.join(process.cwd(), 'src/data/papers.bib');
  return parseBibTeX(bibPath);
}
