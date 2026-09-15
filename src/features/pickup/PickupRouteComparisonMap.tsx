import React from "react";
import type { AnalysisResult } from "../../../lib/pickup/routeAnalysis";
/** Only numeric route geometry enters the isolated map document. */
export function PickupRouteComparisonMap({
  result,
}: {
  result: AnalysisResult;
}) {
  const lines = (value: number[][][] | undefined) =>
    (value || []).filter(
      (line) =>
        line.length > 1 &&
        line.every((p) => p.length === 2 && p.every(Number.isFinite)),
    );
  const current = lines(result.currentGeometry),
    proposed = lines(result.proposedGeometry);
  if (!current.length && !proposed.length)
    return (
      <p className="pk-hint">
        Дорожная геометрия недоступна. Сравните порядок в списках.
      </p>
    );
  const markers = (result.points || [])
    .map((p) => [
      p.point.lat,
      p.point.lon,
      result.current?.ids.indexOf(p.id) ?? -1,
      result.proposed?.ids.indexOf(p.id) ?? -1,
    ])
    .filter((p) => p.every(Number.isFinite));
  const html = `<!doctype html><html lang="ru"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css"><style>html,body,#map{height:100%;margin:0}#error{position:absolute;inset:0;display:grid;place-items:center;background:#eee;color:#222;font:14px sans-serif;padding:20px;z-index:1000}#error[hidden]{display:none}</style></head><body><div id="error" role="status">Загрузка карты…</div><div id="map" aria-label="Сравнение маршрутов"></div><script>
const error=document.getElementById('error'),timeout=setTimeout(()=>{error.textContent='Карта недоступна. Сравните порядок в списках.'},10000);
function start(){try{
const current=${JSON.stringify(current)},proposed=${JSON.stringify(proposed)},markers=${JSON.stringify(markers)};
const first=(current[0]||proposed[0])[0],map=L.map('map').setView(first,12);
map.attributionControl.setPrefix('<a href="https://leafletjs.com" target="_blank" rel="noreferrer">Leaflet</a>');
L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',{maxZoom:19,referrerPolicy:'origin',attribution:'© <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">OpenStreetMap contributors</a>'}).addTo(map);
const old=L.featureGroup(current.map(line=>L.polyline(line,{color:'#2563eb',weight:6,opacity:.65}))).addTo(map),next=L.featureGroup(proposed.map(line=>L.polyline(line,{color:'#a333c8',weight:4,dashArray:'8 5'}))).addTo(map);
L.control.layers(null,{'Текущий — синий':old,'Предложенный — фиолетовый':next},{collapsed:false}).addTo(map);
map.fitBounds(L.featureGroup([old,next]).getBounds(),{padding:[25,25]});
markers.forEach(([lat,lon,a,b])=>L.circleMarker([lat,lon],{radius:6,color:'#222',fillColor:'#fff',fillOpacity:1}).addTo(map).bindTooltip(a<0?'Старт / склад':'Т '+(a+1)+(b<0?'':' / П '+(b+1)),{permanent:true}));
clearTimeout(timeout);error.hidden=true;
}catch(e){clearTimeout(timeout);error.textContent='Карта недоступна. Сравните порядок в списках.'}}
</script><script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js" onload="start()"></script></body></html>`;
  return (
    <iframe
      className="pk-map"
      title="Сравнение текущего и предложенного маршрутов"
      sandbox="allow-scripts allow-same-origin allow-popups"
      srcDoc={html}
      referrerPolicy="origin"
    />
  );
}
