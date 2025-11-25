import 'leaflet/dist/leaflet.css';
import L from 'leaflet';
import { MapContainer, TileLayer, Marker, Polyline, Popup } from 'react-leaflet';
import { useEffect, useState } from 'react';

delete (L.Icon.Default.prototype as any)._getIconUrl;
import markerIcon from 'leaflet/dist/images/marker-icon.png';
import markerIcon2x from 'leaflet/dist/images/marker-icon-2x.png';
import markerShadow from 'leaflet/dist/images/marker-shadow.png';

L.Icon.Default.mergeOptions({
  iconRetinaUrl: markerIcon2x,
  iconUrl: markerIcon,
  shadowUrl: markerShadow,
});

type Vehicle = {
  id: string;
  lat: number;
  lon: number;
  bearing?: number;
  timestamp?: number;
  routeId?: string;
  tripId?: string;
};

type ShapeFeature = {
  type: string;
  properties: { route_id: string };
  geometry: { type: string; coordinates: [number, number][] };
};

export default function Map() {
  const [shapes, setShapes] = useState<ShapeFeature[]>([]);
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [loadingShapes, setLoadingShapes] = useState(true);
  const [loadingVehicles, setLoadingVehicles] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const BACKEND_URL = (import.meta.env.VITE_BACKEND_URL as string) || 'http://localhost:46039';

  // Load shapes once
  useEffect(() => {
    setLoadingShapes(true);
    const base = BACKEND_URL.replace(/\/$/, '');
    fetch(`${base}/api/shapes_merged`)
      .then(res => {
        if (!res.ok) throw new Error(`Shapes API HTTP ${res.status}`);
        return res.json();
      })
      .then(data => setShapes(data.features))
      .catch(err => setError(err.message))
      .finally(() => setLoadingShapes(false));
  }, []);

  // Fetch vehicles every 5 seconds
  useEffect(() => {
    const fetchVehicles = () => {
      setLoadingVehicles(true);
      const base = BACKEND_URL.replace(/\/$/, '');
      fetch(`${base}/api/vehicles`)
        .then(res => {
          if (!res.ok) throw new Error(`Vehicles API HTTP ${res.status}`);
          return res.json();
        })
        .then(data => setVehicles(data.vehicles || data))
        .catch(err => setError(err.message))
        .finally(() => setLoadingVehicles(false));
    };

    fetchVehicles();
    const interval = setInterval(fetchVehicles, 5000);
    return () => clearInterval(interval);
  }, []);

  const getColorFor = (id?: string) => {
    if (!id) return '#666';
    let h = 0;
    for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) % 360;
    return `hsl(${h} 80% 40%)`;
  };

  // Show loading indicator until shapes are loaded or if there is an error
  const showIndicator = loadingShapes || loadingVehicles || error;

  return (
    <div style={{ position: 'fixed', inset: 0, width: '100vw', height: '100vh', zIndex: 9999 }}>
      {showIndicator && (
        <div style={{
          position: 'absolute', top: 20, left: '50%', transform: 'translateX(-50%)',
          background: 'rgba(255,255,255,0.95)', padding: '8px 16px', borderRadius: 6,
          fontSize: 14, fontWeight: 500, zIndex: 1000
        }}>
          {error ? `Error loading subway data: ${error}` : 'Loading subway data...'}
        </div>
      )}

      <MapContainer
        center={[40.7128, -74.006]}
        zoom={12}
        style={{ width: '100%', height: '100%' }}
        preferCanvas={true}
      >
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />

        {shapes.map((f, i) => (
          <Polyline
            key={i}
            positions={f.geometry.coordinates.map(c => [c[1], c[0]])}
            pathOptions={{ color: getColorFor(f.properties.route_id), weight: 4, opacity: 0.8 }}
          />
        ))}

        {vehicles.map(v => (
          <Marker key={v.id} position={[v.lat, v.lon]}>
            <Popup>
              <div>
                <div><strong>Route:</strong> {v.routeId}</div>
                <div><strong>Trip:</strong> {v.tripId}</div>
                <div><strong>Time:</strong> {v.timestamp ? new Date(v.timestamp * 1000).toLocaleTimeString() : 'n/a'}</div>
              </div>
            </Popup>
          </Marker>
        ))}
      </MapContainer>
    </div>
  );
}
