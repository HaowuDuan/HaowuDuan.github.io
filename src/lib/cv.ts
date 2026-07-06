import fs from 'node:fs';
import path from 'node:path';
import YAML from 'yaml';

export function getCV() {
  const cvPath = path.join(process.cwd(), 'src/data/cv.yml');
  const content = fs.readFileSync(cvPath, 'utf-8');
  return YAML.parse(content).cv;
}
