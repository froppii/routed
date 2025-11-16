import fs from 'fs';
import path from 'path';
import Papa from 'papaparse';

export function readGTFSFile(fileName) {
  const filePath = path.join(process.cwd(), 'data', fileName);

  if (!fs.existsSync(filePath)) {
    throw new Error(`GTFS file not found: ${filePath}`);
  }

  const text = fs.readFileSync(filePath, 'utf8');

  const parsed = Papa.parse(text, {
    header: true,
    skipEmptyLines: true
  });

  return parsed.data;
}
