import React from "react";
import type { DriverLocation } from "../../../lib/pickup/location";

/** Isolate the map SDK from the application; only validated numeric coordinates enter HTML. */
export function PickupAccuracyMap({ location }: { location: DriverLocation }) {
  const { latitude, longitude, accuracy } = location;
  if (![latitude, longitude, accuracy].every(Number.isFinite) || accuracy <= 0)
    return <p className="pk-warning">Приблизительная область недоступна</p>;
  const point = JSON.stringify([latitude, longitude]);
  const html = `<!doctype html><html lang="ru"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css"><style>html,body,#map{height:100%;margin:0}#error{position:absolute;inset:0;display:grid;place-items:center;background:#eee;color:#222;font:14px sans-serif;padding:20px;z-index:1000}#error[hidden]{display:none}</style></head><body><div id="error" role="status">Загрузка карты приблизительного положения…</div><div id="map" aria-label="Область погрешности GPS"></div><script>
const error=document.getElementById('error');
const timeout=setTimeout(()=>{error.textContent='Карта недоступна. Радиус погрешности: ${accuracy} м.'},10000);
function start(){try{
const map=L.map('map').setView(${point},14);
map.attributionControl.setPrefix('<a href="https://leafletjs.com" target="_blank" rel="noreferrer">Leaflet</a>');
L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',{maxZoom:19,referrerPolicy:"origin",attribution:'© <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">OpenStreetMap contributors</a>'}).addTo(map);
const area=L.circle(${point},{radius:${accuracy},color:'#b77913',weight:2,fillColor:'#e9aa35',fillOpacity:0.24}).addTo(map);
map.fitBounds(area.getBounds(),{padding:[24,24],maxZoom:17});
clearTimeout(timeout);error.hidden=true;
}catch(e){clearTimeout(timeout);error.textContent='Карта недоступна. Радиус погрешности: ${accuracy} м.'}}
</script><script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js" onload="start()"></script></body></html>`;
  return (
    <iframe
      className="pk-map"
      title="Приблизительная область GPS"
      sandbox="allow-scripts allow-same-origin allow-popups"
      srcDoc={html}
      referrerPolicy="origin"
    />
  );
}
