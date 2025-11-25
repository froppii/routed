import express from "express";
import cors from "cors";
import fetch from "node-fetch";
import compression from "compression";
import gtfsRealtimeBindings from "gtfs-realtime-bindings";
import simplify from 'simplify-js';

import { readGTFSFile } from "./gtfsParser.js";
import { downloadGTFS, extractGTFS } from "./gtfsService.js";

const app = express();
app.use(compression());
app.use(cors());
const PORT = process.env.PORT || 46039;

let cachedShapes = null;

function buildShapesCache() {
  console.log("Building shapes cache...");

  const shapes = readGTFSFile("shapes.txt");
  const trips = readGTFSFile("trips.txt");

  const shapesById = {};
  for (const pt of shapes) {
    if (!shapesById[pt.shape_id]) shapesById[pt.shape_id] = [];
    shapesById[pt.shape_id].push(pt);
  }

  for (const id in shapesById) {
    shapesById[id].sort(
      (a, b) => Number(a.shape_pt_sequence) - Number(b.shape_pt_sequence)
    );
  }

  const routeDirShapes = {};
  const processedShapeKeys = new Set();

  for (const trip of trips) {
    const { route_id, shape_id, direction_id } = trip;
    if (!route_id || !shape_id) continue;
    if (!shapesById[shape_id]) continue;

    const dir = direction_id ?? "0";

    if (!routeDirShapes[route_id]) routeDirShapes[route_id] = {};
    if (!routeDirShapes[route_id][dir]) routeDirShapes[route_id][dir] = [];

    // Skip duplicate shapes for the same route+direction
    const processedKey = `${route_id}|${dir}|${shape_id}`;
    if (processedShapeKeys.has(processedKey)) continue;
    processedShapeKeys.add(processedKey);

    // Convert to {x, y} format for simplify-js
    const pts = shapesById[shape_id].map(p => ({
      x: Number(p.shape_pt_lon),
      y: Number(p.shape_pt_lat),
    }));

    // Simplify with tolerance 0.0005 degrees (~50m)
    const simplifiedPts = simplify(pts, 0.0005, true);

    // Convert back to [lon, lat] arrays
    const simplifiedCoords = simplifiedPts.map(pt => [
      Number(pt.x.toFixed(5)),
      Number(pt.y.toFixed(5)),
    ]);

    routeDirShapes[route_id][dir].push(simplifiedCoords);
  }

  // Build GeoJSON
  const features = [];
  for (const routeId in routeDirShapes) {
    for (const dir in routeDirShapes[routeId]) {
      features.push({
        type: "Feature",
        properties: { route_id: routeId, direction_id: dir },
        geometry: {
          type: "MultiLineString",
          coordinates: routeDirShapes[routeId][dir],
        },
      });
    }
  }

  cachedShapes = {
    type: "FeatureCollection",
    features,
  };

  console.log("Shapes cache built.");
}

// =========================================================
//  SHAPES ENDPOINT
// =========================================================

app.get("/api/shapes_merged", (req, res) => {
  if (!cachedShapes) return res.status(500).json({ error: "Shapes not loaded" });

  // Allow caching for clients/CDN but keep ETag support for validation
  res.setHeader("Cache-Control", "public, max-age=86400, s-maxage=86400");
  // Express will still emit ETag; clients/CDN can validate and revalidate as needed

  return res.json(cachedShapes);
});


const FEED_URLS = [
  "https://api-endpoint.mta.info/Dataservice/mtagtfsfeeds/nyct%2Fgtfs-ace",
  "https://api-endpoint.mta.info/Dataservice/mtagtfsfeeds/nyct%2Fgtfs-bdfm",
  "https://api-endpoint.mta.info/Dataservice/mtagtfsfeeds/nyct%2Fgtfs-g",
  "https://api-endpoint.mta.info/Dataservice/mtagtfsfeeds/nyct%2Fgtfs-jz",
  "https://api-endpoint.mta.info/Dataservice/mtagtfsfeeds/nyct%2Fgtfs-l",
  "https://api-endpoint.mta.info/Dataservice/mtagtfsfeeds/nyct%2Fgtfs-nqrw",
  "https://api-endpoint.mta.info/Dataservice/mtagtfsfeeds/nyct%2Fgtfs-7",
  "https://api-endpoint.mta.info/Dataservice/mtagtfsfeeds/nyct%2Fgtfs-si"

];

app.get("/api/vehicles", async (req, res) => {
  if (FEED_URLS.length === 0) {
    return res.status(500).json({
      error: "No GTFS-RT feed configured",
      vehicles: [],
    });
  }

  const vehicles = [];

  try {
    await Promise.all(
      FEED_URLS.map(async url => {
        try {
          const response = await fetch(url);
          if (!response.ok) throw new Error(`HTTP ${response.status}`);

          const buffer = await response.arrayBuffer();
          const feed = gtfsRealtimeBindings.FeedMessage.decode(
            new Uint8Array(buffer)
          );

          for (const ent of feed.entity) {
            if (!ent.vehicle || !ent.vehicle.position) continue;

            const v = ent.vehicle;
            vehicles.push({
              id: ent.id ?? v.vehicle?.id ?? Math.random(),
              lat: v.position.latitude,
              lon: v.position.longitude,
              bearing: v.position.bearing,
              timestamp: v.timestamp,
              routeId: v.trip?.routeId,
              tripId: v.trip?.tripId,
            });
          }
        } catch (innerErr) {
          console.error("Vehicle feed error:", url, innerErr.message);
        }
      })
    );

    res.json({ ok: true, vehicles });
  } catch (err) {
    console.error("Vehicle fetch failed:", err.message);
    res.status(500).json({ ok: false, error: err.message, vehicles: [] });
  }
});

async function init() {
  try {
    await downloadGTFS();
    extractGTFS();
    buildShapesCache();

    app.listen(PORT, () =>
      console.log(`Server running at http://localhost:${PORT}`)
    );
  } catch (err) {
    console.error(err);
  }
}

init();
