import React,{useEffect,useRef,useState} from 'react';
import {Maximize2} from 'lucide-react';

const STORAGE_KEY='haulz:sending-planning-layout';
const PRESETS=[
 {share:.5,label:'½',description:'Планирование: половина окна'},
 {share:2/3,label:'⅔',description:'Планирование: две трети окна'},
 {share:.75,label:'¾',description:'Планирование: три четверти окна'},
] as const;
type Layout={share:number;full:boolean};
const defaultLayout:Layout={share:.5,full:false};
function readLayout():Layout {
 try {
  const saved=JSON.parse(localStorage.getItem(STORAGE_KEY)||'null');
  if(saved&&typeof saved.share==='number'&&Number.isFinite(saved.share)&&saved.share>=.35&&saved.share<=.8&&typeof saved.full==='boolean')return saved;
 } catch { /* Layout remains usable when storage is unavailable. */ }
 return defaultLayout;
}

export function usePlanningLayout() {
 const [layout,setLayout]=useState(readLayout),[resizing,setResizing]=useState(false),[width,setWidth]=useState(0);
 const bodyRef=useRef<HTMLDivElement>(null),pointer=useRef<number|null>(null);
 const usable=Math.max(1,width-14),min=width>=640?Math.max(.35,360/usable):.35,max=width>=640?Math.min(.8,1-280/usable):.8;
 const clamp=(share:number)=>Math.max(min,Math.min(max,share));
 useEffect(()=>{
  const node=bodyRef.current;if(!node)return;
  const observer=new ResizeObserver(()=>setWidth(node.clientWidth));observer.observe(node);setWidth(node.clientWidth);
  return()=>observer.disconnect();
 },[]);
 useEffect(()=>{
  if(window.innerWidth<=1200||width<640)return;
  setLayout(previous=>{const share=Math.max(min,Math.min(max,previous.share));return share===previous.share?previous:{...previous,share};});
 },[width,min,max]);
 useEffect(()=>{try{localStorage.setItem(STORAGE_KEY,JSON.stringify(layout));}catch{/* Optional preference only. */}},[layout]);
 const select=(share:number|null)=>setLayout(previous=>share===null?{...previous,full:true}:{share:clamp(share),full:false});
 const move=(clientX:number)=>{
  const box=bodyRef.current?.getBoundingClientRect();if(!box)return;
  setLayout({share:clamp((box.right-clientX-7)/Math.max(1,box.width-14)),full:false});
 };
 const separatorProps={
  role:'separator' as const,tabIndex:0,'aria-orientation':'vertical' as const,
  'aria-label':'Изменить ширину блока планирования','aria-valuemin':Math.round(min*100),'aria-valuemax':Math.round(max*100),
  'aria-valuenow':Math.round(layout.share*100),'aria-valuetext':`Планирование: ${Math.round(layout.share*100)}% окна`,
  title:'Тяните влево, чтобы расширить планирование. Двойной щелчок — половина окна.',
  onPointerDown:(event:React.PointerEvent<HTMLDivElement>)=>{
   if(!event.isPrimary||event.button!==0)return;
   event.preventDefault();event.currentTarget.focus();event.currentTarget.setPointerCapture(event.pointerId);pointer.current=event.pointerId;setResizing(true);
  },
  onPointerMove:(event:React.PointerEvent<HTMLDivElement>)=>{if(pointer.current===event.pointerId)move(event.clientX);},
  onPointerUp:(event:React.PointerEvent<HTMLDivElement>)=>{
   if(pointer.current!==event.pointerId)return;
   pointer.current=null;setResizing(false);if(event.currentTarget.hasPointerCapture(event.pointerId))event.currentTarget.releasePointerCapture(event.pointerId);
  },
  onLostPointerCapture:()=>{pointer.current=null;setResizing(false);},
  onPointerCancel:()=>{pointer.current=null;setResizing(false);},
  onDoubleClick:()=>select(.5),
  onKeyDown:(event:React.KeyboardEvent<HTMLDivElement>)=>{
   const step=event.shiftKey ? .01 : .05;
   const share=event.key==='ArrowLeft'?layout.share+step:event.key==='ArrowRight'?layout.share-step:event.key==='Home'?min:event.key==='End'?max:null;
   if(share===null)return;event.preventDefault();select(share);
  },
 };
 const style={'--planning-calendar-column':`${1-layout.share}fr`,'--planning-editor-column':`${layout.share}fr`} as React.CSSProperties;
 return {bodyRef,style,layout,resizing,select,separatorProps};
}

export function PlanningLayoutControls({layout,onSelect}:{layout:Layout;onSelect:(share:number|null)=>void}) {
 return <div className="sending-planning__layout-controls sending-planning__tabs" role="group" aria-label="Размер блока планирования">
  {PRESETS.map(preset=><button type="button" key={preset.label} title={preset.description} aria-label={preset.description} aria-pressed={!layout.full&&Math.abs(layout.share-preset.share)<.005} onClick={()=>onSelect(preset.share)}><span className="sending-planning__layout-preview" aria-hidden="true"><i style={{width:`${preset.share*100}%`}}/></span>{preset.label}</button>)}
  <button type="button" title="Планирование: всё окно" aria-label="Планирование: всё окно" aria-pressed={layout.full} onClick={()=>onSelect(null)}><Maximize2 size={16}/>Всё окно</button>
 </div>;
}
