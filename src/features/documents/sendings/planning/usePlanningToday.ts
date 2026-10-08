import {useEffect,useState} from 'react';
import {planningToday} from './planningModel';
export function usePlanningToday() {
 const [today,setToday]=useState(planningToday);
 useEffect(()=>{const timer=setInterval(()=>setToday(planningToday()),30000);return()=>clearInterval(timer);},[]);
 return today;
}
