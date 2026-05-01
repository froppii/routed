// @ts-nocheck
import { useEffect, useState } from 'react';
import { MapContainer, TileLayer, CircleMarker } from 'react-leaflet';
// @ts-ignore
import MarkerClusterGroup from '@changey/react-leaflet-markercluster';

type Stop = {
    id: string;
    name: string;
    lat: number;
    lon: number;
};

type Arrival = {
    route: string;
    minutes: number;
};

export default function MapView() {
    const [stops, setStops] = useState<Stop[]>([]);
    const [selectedStop, setSelectedStop] = useState<Stop | null>(null);
    const [arrivals, setArrivals] = useState<Arrival[]>([]);

    useEffect(() => {
        fetch('http://localhost:3001/stops')
            .then((res) => res.json())
            .then(setStops);
    }, []);

    const fetchArrivals = async (stop: Stop) => {
        setSelectedStop(stop);
        
        const res = await fetch(
            `http://localhost:3001/stops/${stop.id}`
        );
        const data = await res.json();

        setArrivals(data.arrivals || []);
    };

    return (
        <div style={{ display: 'flex', height: '100vh' }}>
            // @ts-ignore
            <MapContainer 
                center={[40.75, -73.98]} 
                zoom={12} 
                style={{ flex: 1 }}
            >
                // @ts-ignore
                <TileLayer 
                    attribution='© OpenStreetMap'
                    url='https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png'
                />

                <MarkerClusterGroup>
                    {stops.map((stop) => (
                        // @ts-ignore
                        <CircleMarker 
                            key={stop.id}
                            center={[stop.lat, stop.lon]}
                            radius={3}
                            pathOptions={{ color: 'white'}}
                            eventHandlers={{
                                click: () => fetchArrivals(stop),
                            }}
                        />
                    ))}
                </MarkerClusterGroup>
            </MapContainer>

            <div
                style={{
                    width: '300px',
                    background: '#111',
                    color: '#fff',
                    padding: '16px',
                    overflowY: 'auto',
                }}
            >
                {selectedStop ? (
                    <>
                        <h2>{selectedStop.name}</h2>

                        {arrivals.length === 0 && <p>no arrivals</p>}

                        {arrivals.slice(0, 5).map((a, i) => (
                            <div key={i}>
                                <strong>{a.route}</strong> - {a.minutes} min
                            </div>
                        ))}
                    </>
                ) : (
                    <p>select a stop</p>
                )}
            </div>
        </div>
    )
}