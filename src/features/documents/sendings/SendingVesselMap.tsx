import React, { useMemo } from 'react';
import { splitAisTrack } from '../../../../lib/aisTrack';
import type { MarinesiaVessel, MarinesiaTrackPoint } from '../../../api/client/ais';

/** The isolated map receives only validated numeric values, never vessel names or API strings. */
export function SendingVesselMap({ vessel, track = [], embedded = false }: { vessel: MarinesiaVessel; track?: MarinesiaTrackPoint[]; embedded?: boolean }) {
  const valid = Number.isFinite(vessel.lat) && Math.abs(vessel.lat) <= 90 && Number.isFinite(vessel.lon) && Math.abs(vessel.lon) <= 180;
  const heading = Number.isFinite(vessel.hdt) && vessel.hdt! >= 0 && vessel.hdt! < 360 ? vessel.hdt! : Number.isFinite(vessel.cog) && vessel.cog! >= 0 && vessel.cog! < 360 ? vessel.cog! : null;
  const html = useMemo(() => {
    if (!valid) return '';
    const point = JSON.stringify([vessel.lat, vessel.lon]);
    const path = JSON.stringify(splitAisTrack(track));
    return `<!doctype html><html lang="ru"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css"><style>
html,body,#map{height:100%;margin:0;background:#cee3e7}#notice{position:absolute;top:16px;left:50%;transform:translateX(-50%);z-index:1000;background:white;padding:10px 16px;border-radius:8px;font:14px Arial;box-shadow:0 2px 10px #0002}#notice[hidden]{display:none}.vessel-marker{display:grid;place-items:center;background:transparent;border:2px dashed #c52323;box-sizing:border-box}.vessel-marker svg{filter:drop-shadow(0 1px 2px #0004)}
</style></head><body><div id="map"></div><div id="notice" role="status">Загрузка карты…</div><script>
const point=${point},heading=${JSON.stringify(heading)},track=${path},embedded=${JSON.stringify(embedded)};
const notice=document.getElementById('notice');const timeout=setTimeout(()=>{notice.textContent='Не удалось загрузить карту. Координаты доступны в карточке.'},12000);
function start(){try{
const map=L.map('map',{zoomControl:false}).setView(point,8);L.control.zoom({position:'topright'}).addTo(map);
map.attributionControl.setPrefix('<a href="https://leafletjs.com" target="_blank" rel="noreferrer">Leaflet</a>');
const tiles=L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',{maxZoom:18,attribution:'© <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">OpenStreetMap</a>'}).addTo(map);
const trail=track.length?L.featureGroup(track.map(segment=>L.polyline(segment,{color:'#2563eb',weight:3,opacity:.85}))).addTo(map):null;
let errors=0;tiles.on('tileerror',()=>{if(++errors>3){notice.hidden=false;notice.textContent='Подложка карты недоступна. Положение судна отмечено.'}});tiles.on('load',()=>{if(!errors)notice.hidden=true});
const shape=heading===null?'<circle cx="20" cy="20" r="9" fill="#34b89a" stroke="#205c64" stroke-width="2"/>':'<path d="M20 3 L30 33 L20 27 L10 33 Z" fill="#34b89a" stroke="#205c64" stroke-width="2"/>';
const icon=L.divIcon({className:'vessel-marker',html:'<svg width="40" height="40" viewBox="0 0 40 40" style="transform:rotate('+(heading||0)+'deg)">'+shape+'</svg>',iconSize:[44,44],iconAnchor:[22,22]});
L.marker(point,{icon}).addTo(map);function center(){map.setView(point,map.getZoom());if(embedded)return;if(innerWidth>700)map.panBy([-170,0],{animate:false});else map.panBy([0,Math.round(innerHeight*.2)],{animate:false});}function fit(){if(trail){map.fitBounds(trail.getBounds().extend(point),{paddingTopLeft:embedded?[25,25]:innerWidth>700?[370,50]:[30,50],paddingBottomRight:embedded?[25,25]:innerWidth>700?[50,50]:[40,Math.round(innerHeight*.55)],maxZoom:12});}else center();}fit();map.on('resize',fit);
const Center=L.Control.extend({options:{position:'topright'},onAdd(){const div=L.DomUtil.create('div','leaflet-bar');const button=L.DomUtil.create('a','',div);button.href='#';button.textContent='◎';button.title='Вернуться к судну';button.setAttribute('aria-label','Вернуться к судну');button.setAttribute('role','button');L.DomEvent.on(button,'click',e=>{L.DomEvent.stop(e);center()});return div}});map.addControl(new Center());
clearTimeout(timeout);notice.hidden=true;
}catch(e){clearTimeout(timeout);notice.textContent='Карта недоступна. Координаты доступны в карточке.'}}
</script><script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js" onload="start()" onerror="document.getElementById('notice').textContent='Не удалось загрузить карту. Координаты доступны в карточке.'"></script></body></html>`;
  }, [valid, vessel.lat, vessel.lon, heading, track, embedded]);
  return valid ? <iframe className="sending-vessel-map" title={`Паром ${vessel.name} на карте`} srcDoc={html} sandbox="allow-scripts allow-same-origin allow-popups" referrerPolicy="origin" /> : <div className="sending-vessel-map-unavailable">Координаты судна недоступны</div>;
}
