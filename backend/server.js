import express from 'express';
import cors from 'cors';
import fetch from 'node-fetch';
import unzipper from 'unzipper';
import { parse } from 'csv-parse/sync';
import { transit_realtime } from 'gtfs-realtime-bindings';

const app = express();
app.use(cors());

const MTA_KEY = process.env.MTA_API_KEY || "";
const STATIC_GTFS_ZIP_URL = process.env.GTFS_ZIP_URL || 'https://rrgtfsfeeds.s3.amazonaws.com/gtfs_supplemented.zip';
const CACHE_TTL = 1000 * 60 * 60; // 1 hour

let staticGtfsCache = { updatedAt: 0, data: null };

async function fetchStaticGtfsZip(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Failed to download GTFS zip: ${res.status}`);
  const buffer = Buffer.from(await res.arrayBuffer());
  const zip = await unzipper.Open.buffer(buffer);

  const entries = {};
  for (const f of zip.files) {
    const name = f.path.toLowerCase();
    if (name.endsWith('.txt')) {
      const buf = await f.buffer();
      entries[name] = parse(buf, { columns: true, skip_empty_lines: true });
    }
  }

  return {
    stops: entries['stops.txt'] || [],
    routes: entries['routes.txt'] || [],
    trips: entries['trips.txt'] || [],
    stop_times: entries['stop_times.txt'] || [],
    raw: entries
  };
}

async function getStaticGtfs(url = STATIC_GTFS_ZIP_URL) {
  const now = Date.now();
  if (staticGtfsCache.data && (now - staticGtfsCache.updatedAt) < CACHE_TTL) {
    return staticGtfsCache.data;
  }
  const data = await fetchStaticGtfsZip(url);
  staticGtfsCache = { updatedAt: now, data };
  return data;
}

getStaticGtfs().catch(err => console.error('Initial GTFS fetch failed:', err));
setInterval(() => getStaticGtfs().catch(err => console.error('GTFS refresh failed:', err)), CACHE_TTL);

const FEED_URL = `https://api-endpoint.mta.info/Dataservice/mtagtfsfeeds/nyct%2Fgtfs-ace`;

async function getRealtimeData() {
  if (!MTA_KEY) throw new Error('MTA_API_KEY not configured');
  const res = await fetch(FEED_URL, { headers: { 'x-api-key': MTA_KEY } });
  if (!res.ok) throw new Error(`Realtime fetch failed: ${res.status}`);
  const buffer = await res.arrayBuffer();
  const feed = transit_realtime.FeedMessage.decode(new Uint8Array(buffer));

  const trains = [];
  (feed.entity || []).forEach(entity => {
    if (entity.vehicle && entity.vehicle.position) {
      trains.push({
        id: entity.id,
        lat: entity.vehicle.position.latitude,
        lon: entity.vehicle.position.longitude,
        route: entity.vehicle.trip?.routeId || null,
        timestamp: entity.vehicle.timestamp || null
      });
    }
  });

  return trains;
}

app.get('/gtfs-static', async (req, res) => {
  try {
    const url = req.query.url || STATIC_GTFS_ZIP_URL;
    const data = await getStaticGtfs(url);
    res.json(data);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to fetch/parse static GTFS' });
  }
});

app.get('/trains', async (req, res) => {
  if (!MTA_KEY) {
    return res.status(501).json({
      error: 'MTA_API_KEY not set. GTFS-Realtime requires an MTA API key. Use /gtfs-static for static schedule data.'
    });
  }
  try {
    const data = await getRealtimeData();
    res.json({ trains: data });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Failed to fetch realtime train data' });
  }
});

app.listen(8080, () => {
  console.log('Server running on http://localhost:8080');
});