import 'leaflet/dist/leaflet.css';
import L from 'leaflet';
import markerIcon from 'leaflet/dist/images/marker-icon.png';
import markerIcon2x from 'leaflet/dist/images/marker-icon-2x.png';
import markerShadow from 'leaflet/dist/images/marker-shadow.png';
import { MapContainer, TileLayer, Marker, Polyline, Popup } from 'react-leaflet';
import { useEffect, useState } from 'react';

delete (L.Icon.Default.prototype as any)._getIconUrl;
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
  feedUrl: string;
};

export default function Map({ feedUrls }: { feedUrls: string[] }) {
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [shapes, setShapes] = useState<any[]>([]);

  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const res = await fetch('http://localhost:3001/api/shapes_merged');
        if (res.ok) {
          const gj = await res.json();
          if (mounted && gj?.features) setShapes(gj.features);
        } else {
          setErrors((prev) => ({ ...prev, shapes: `HTTP ${res.status} loading shapes` }));
        }
      } catch (e: any) {
        setErrors((prev) => ({ ...prev, shapes: e?.message ?? String(e) }));
      }
    })();
    return () => {
      mounted = false;
    };
  }, []);

  useEffect(() => {
    let mounted = true;
    let intervalId: number | undefined;

    const fetchAll = async () => {
      const allVehicles: Vehicle[] = [];

      await Promise.all(
        feedUrls.map(async (url) => {
          try {
            const res = await fetch(url);
            if (!res.ok) throw new Error(`HTTP ${res.status}`);
            const buf = await res.arrayBuffer();

            const gtfs = await import('gtfs-realtime-bindings');
            const feed = gtfs.FeedMessage.decode(new Uint8Array(buf));

            (feed.entity || []).forEach((entity: any) => {
              const v = entity.vehicle;
              if (!v || !v.position) return;
              const pos = v.position;
              const lat = pos.latitude;
              const lon = pos.longitude;
              if (typeof lat !== 'number' || typeof lon !== 'number') return;

              allVehicles.push({
                id: entity.id ?? v.vehicle?.id ?? `${url}:${v.trip?.tripId ?? Math.random()}`,
                lat,
                lon,
                bearing: pos.bearing,
                timestamp: v.timestamp,
                routeId: v.trip?.routeId,
                tripId: v.trip?.tripId,
                feedUrl: url,
              });
            });

            setErrors((prev: Record<string, string>) => {
              if (prev[url]) {
                const copy = { ...prev };
                delete copy[url];
                return copy;
              }
              return prev;
            });
          } catch (e: any) {
            setErrors((prev: Record<string, string>) => ({ ...prev, [url]: e?.message ?? String(e) }));
          }
        })
      );

      if (mounted) setVehicles(allVehicles);
    };

    fetchAll();
    intervalId = window.setInterval(fetchAll, 10000);

    return () => {
      mounted = false;
      if (intervalId) window.clearInterval(intervalId);
    };
  }, [feedUrls]);

  const polylines = Object.values(
    vehicles.reduce((acc: Record<string, { coords: [number, number][] }>, v: Vehicle) => {
      const key = v.routeId ?? 'unknown';
      if (!acc[key]) acc[key] = { coords: [] };
      acc[key].coords.push([v.lat, v.lon]);
      return acc;
    }, {})
  );

  const getColorFor = (id?: string) => {
    if (!id) return '#666';
    let h = 0;
    for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) % 360;
    return `hsl(${h} 80% 40%)`;
  };

  return (
    <div style={{ position: 'fixed', inset: 0, width: '100vw', height: '100vh', zIndex: 9999 }}>
      <MapContainer center={[40.7128, -74.0060]} zoom={12} style={{ width: '100%', height: '100%' }}>
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />

        {vehicles.map((v) => (
          <Marker key={v.id} position={[v.lat, v.lon]}>
            <Popup>
              <div>
                <div><strong>Route:</strong> {v.routeId ?? 'n/a'}</div>
                <div><strong>Trip:</strong> {v.tripId ?? 'n/a'}</div>
                <div><strong>Feed:</strong> {new URL(v.feedUrl).pathname.split('/').pop()}</div>
                <div><strong>Time:</strong> {v.timestamp ? new Date(v.timestamp * 1000).toLocaleTimeString() : 'n/a'}</div>
              </div>
            </Popup>
          </Marker>
        ))}

        {polylines.map((p, i) => (
          <Polyline key={`v-${i}`} positions={p.coords} pathOptions={{ weight: 3, opacity: 0.6, color: '#444' }} />
        ))}

        {shapes.map((f: any, idx: number) => {
          const coords: [number, number][] =
            f?.geometry?.type === 'LineString' && Array.isArray(f.geometry.coordinates)
              ? f.geometry.coordinates.map((c: any) => [c[1], c[0]]) // GeoJSON is [lon,lat]
              : [];
          const routeId = f?.properties?.route_id ?? f?.properties?.shape_id;
          return coords.length ? (
            <Polyline
              key={`shape-${idx}-${routeId}`}
              positions={coords}
              pathOptions={{ weight: 4, opacity: 0.9, color: getColorFor(String(routeId)), dashArray: '6 6' }}
            />
          ) : null;
        })}
      </MapContainer>

      {Object.keys(errors).length > 0 && (
        <div style={{ position: 'absolute', right: 8, top: 8, background: 'rgba(255,255,255,0.9)', padding: 8, borderRadius: 6, maxWidth: 320 }}>
          <strong>Feed errors</strong>
          <ul style={{ margin: '4px 0 0 12px', padding: 0 }}>
            {Object.entries(errors).map(([u, msg]) => (
              <li key={u} style={{ fontSize: 12 }}>
                {u.split('/').pop()}: {msg}
              </li>
            ))}
          </ul>
          <div style={{ fontSize: 11, marginTop: 6 }}>
            If you get CORS or 403 errors you will need to proxy these requests through a backend that injects an API key.
          </div>
        </div>
      )}
    </div>
  );
}