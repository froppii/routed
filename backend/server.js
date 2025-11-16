import express from 'express';
import cors from 'cors';
import { readGTFSFile } from './gtfsParser.js';
import { downloadGTFS, extractGTFS } from './gtfsService.js';


const app = express();
app.use(cors());

const PORT = process.env.PORT || 3001;

app.get('/api', (req, res) => {
    res.json({ message: 'Transit API is running' });
});

async function init() {
    try {
        await downloadGTFS();
        extractGTFS();

        app.get('/api/routes', (req, res) => {
            res.json({ message: 'GTFS downloaded and extracted successfully' });
        });

        app.listen(PORT, '0.0.0.0', () => {
            console.log(`Server is running on http://localhost:${PORT}`);
        });
    } catch (err) {
        console.error('Error initializing server:', err);
    }
}

app.get('/api/shapes_merged', (req, res) => {
  try {
    const shapes = readGTFSFile('shapes.txt');
    const trips = readGTFSFile('trips.txt');

    console.log("Loaded shapes:", shapes.length);
    console.log("Loaded trips:", trips.length);

    // Map shape_id → all its points
    const shapesById = {};
    for (const row of shapes) {
      const id = row.shape_id;
      if (!shapesById[id]) shapesById[id] = [];
      shapesById[id].push(row);
    }

    // Sort each shape by sequence
    for (const id in shapesById) {
      shapesById[id].sort(
        (a, b) => Number(a.shape_pt_sequence) - Number(b.shape_pt_sequence)
      );
    }

    // Map route_id → all coordinates from its shapes
    const routeShapes = {};
    for (const trip of trips) {
      const { route_id, shape_id } = trip;
      if (!route_id || !shape_id) continue;
      if (!shapesById[shape_id]) continue;
      if (!routeShapes[route_id]) routeShapes[route_id] = [];

      const coords = shapesById[shape_id].map(p => [
        Number(p.shape_pt_lon),
        Number(p.shape_pt_lat)
      ]);

      routeShapes[route_id].push(coords); // add as a separate line
    }

    const features = Object.entries(routeShapes).map(([routeId, lines]) => ({
      type: "Feature",
      properties: { route_id: routeId },
      geometry: {
        type: "MultiLineString",
        coordinates: lines
      }
    }));

    res.json({
      type: "FeatureCollection",
      features
    });

  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});


init();