import polygons from './data/baltic-land.json' with {type:'json'};
/** Coarse land anomaly detector, only inside the Baltic extract. Never relocates fixes.
 * 500 m coastline margin avoids treating ordinary harbour fixes as land violations. */
export function aisClearlyInland(lat:number,lon:number) {
  if(lat<53||lat>66||lon<9||lon>34)return false;
  const contains=(r:number[][])=>{
    let inside=false;
    for(let i=0,j=r.length-1;i<r.length;j=i++) {
      const a=r[i],b=r[j];
      if((a[1]>lat)!==(b[1]>lat)&&lon<(b[0]-a[0])*(lat-a[1])/(b[1]-a[1])+a[0])inside=!inside;
    }
    return inside;
  };
  for(const rings of polygons) {
    if(!contains(rings[0])||rings.slice(1).some(contains))continue;
    const sx=111.32*Math.cos(lat*Math.PI/180),sy=111.32;
    for(const ring of rings)for(let i=0,j=ring.length-1;i<ring.length;j=i++) {
      const a=[(ring[j][0]-lon)*sx,(ring[j][1]-lat)*sy],b=[(ring[i][0]-lon)*sx,(ring[i][1]-lat)*sy];
      const dx=b[0]-a[0],dy=b[1]-a[1];
      const t=Math.max(0,Math.min(1,-(a[0]*dx+a[1]*dy)/(dx*dx+dy*dy||1)));
      if(Math.hypot(a[0]+t*dx,a[1]+t*dy)<.5)return false;
    }
    return true;
  }
  return false;
}
