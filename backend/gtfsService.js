import fetch from 'node-fetch';
import AdmZip from 'adm-zip';
import fs from 'fs';
import path from 'path';
import { error } from 'console';

const DATA_DIR = path.join(process.cwd(), 'data');
const GTFS_URL = 'https://rrgtfsfeeds.s3.amazonaws.com/gtfs_subway.zip';
const GTFS_ZIP_PATH = path.join(DATA_DIR, 'gtfs_subway.zip');

export async function downloadGTFS() {
    if (!fs.existsSync(DATA_DIR)) {
        fs.mkdirSync(DATA_DIR);
    }

    console.log('Downloading latest GTFS data from MTA...');
    const response = await fetch(GTFS_URL);
    if (!response.ok) throw new Error('Failed to download GTFS data');

    const buffer = Buffer.from(await response.arrayBuffer());
    fs.writeFileSync(GTFS_ZIP_PATH, buffer);
    console.log('GTFS saved to', GTFS_ZIP_PATH);
}

export function extractGTFS() {
    console.log('Extracting GTFS...');
    const zip = new AdmZip(GTFS_ZIP_PATH);
    zip.extractAllTo(DATA_DIR, true);
    console.log('GTFS extracted to', DATA_DIR);
}