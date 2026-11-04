/**
 * Métricas públicas en preparación. OFF salvo VITE_BUSINESS_ENGAGEMENT_API=true.
 * Nunca crea visitas, votos ni números ficticios si el backend no responde.
 */
import { auth, signInWithGoogle } from './firebase';
import { getGioteAppCheckToken } from './publicOrderClientApi';
import type { User } from 'firebase/auth';

const ID=/^[A-Za-z0-9_-]{1,64}$/;
export const isBusinessEngagementEnabled=()=>
  import.meta.env?.VITE_BUSINESS_ENGAGEMENT_API === 'true';

export type PublicBusinessRating={count:number;average:number|null};
export type BusinessMetric={visitsTotal:number|null;ratingCount:number;average:number|null};
export type PlatformMetrics={trackingSince:string;metrics:Record<string,BusinessMetric>};
const assertId=(id:string)=>{if(!ID.test(id))throw new Error('Negocio inválido.');};

export async function fetchPublicBusinessRating(businessId:string):Promise<PublicBusinessRating>{
  if(!isBusinessEngagementEnabled())throw new Error('Calificaciones no activadas.');
  assertId(businessId);
  const res=await fetch('/api/engagement/'+encodeURIComponent(businessId)+'/rating',{cache:'no-store'});
  if(!res.ok)throw new Error('No pudimos consultar las calificaciones.');
  const data=await res.json() as PublicBusinessRating;
  if(!Number.isSafeInteger(data.count)||data.count<0||
     (data.count===0 && data.average!==null)||
     (data.count>0&&(typeof data.average!=='number'||data.average<1||data.average>5)))
    throw new Error('Calificación incompleta.');
  return data;
}
function sessionIdFor(businessId:string):string|null{
  if(typeof sessionStorage==='undefined')return null;
  const day=new Date().toISOString().slice(0,10);
  const key='giote_public_visit_v1:'+businessId+':'+day;
  try{
    const previous=sessionStorage.getItem(key);
    if(previous&&/^[a-f0-9]{32}$/.test(previous))return previous;
    if(!globalThis.crypto?.getRandomValues)return null;
    const bytes=new Uint8Array(16);
    crypto.getRandomValues(bytes);
    const id=Array.from(bytes,x=>x.toString(16).padStart(2,'0')).join('');
    sessionStorage.setItem(key,id);
    return id;
  }catch{return null;}
}
export async function recordPublicBusinessVisit(businessId:string):Promise<void>{
  if(!isBusinessEngagementEnabled())return;
  assertId(businessId);
  const sessionId=sessionIdFor(businessId);
  if(!sessionId)return;
  try{
    const token=await getGioteAppCheckToken();
    // Respuesta no incide en menú, pedidos ni cobros. Repeticiones quedan
    // deduplicadas por el servidor con el mismo ID de sesión/día.
    await fetch('/api/engagement/'+encodeURIComponent(businessId)+'/visit',{
      method:'POST',headers:{'Content-Type':'application/json','X-Firebase-AppCheck':token},
      body:JSON.stringify({sessionId}),cache:'no-store',credentials:'same-origin',
    });
  }catch{/* Fallo de analítica no debe romper la página pública. */}
}
export async function submitBusinessRating(businessId:string,stars:number):Promise<PublicBusinessRating>{
  if(!isBusinessEngagementEnabled())throw new Error('Calificaciones todavía no activadas.');
  assertId(businessId);
  if(!Number.isInteger(stars)||stars<1||stars>5)throw new Error('Elige de 1 a 5 estrellas.');
  const user:User=auth.currentUser||await signInWithGoogle();
  if(!user||auth.currentUser?.uid!==user.uid)throw new Error('Inicia sesión para calificar.');
  const [idToken,appToken]=await Promise.all([user.getIdToken(),getGioteAppCheckToken()]);
  const res=await fetch('/api/engagement/'+encodeURIComponent(businessId)+'/rating',{
    method:'PUT',headers:{'Content-Type':'application/json','Authorization':'Bearer '+idToken,
      'X-Firebase-AppCheck':appToken},
    body:JSON.stringify({stars}),cache:'no-store',credentials:'same-origin',
  });
  if(!res.ok)throw new Error(res.status===401?'Inicia sesión para calificar.':'No se pudo guardar tu calificación.');
  const data=await res.json() as PublicBusinessRating;
  if(!Number.isSafeInteger(data.count)||data.count<1||
     typeof data.average!=='number'||data.average<1||data.average>5)
    throw new Error('Respuesta incompleta de calificación.');
  return {count:data.count,average:data.average};
}
export async function fetchPlatformBusinessMetrics(businessIds:string[],user:User):Promise<PlatformMetrics>{
  if(!isBusinessEngagementEnabled())throw new Error('Métricas sin activar.');
  if(!businessIds.length)return {trackingSince:'',metrics:{}};
  if(businessIds.some(id=>!ID.test(id))||new Set(businessIds).size!==businessIds.length)
    throw new Error('Lista de negocios inválida.');
  if(auth.currentUser?.uid!==user.uid)throw new Error('La sesión cambió.');
  const token=await user.getIdToken();
  const metrics:Record<string,BusinessMetric>={};
  let trackingSince='';
  for(let offset=0;offset<businessIds.length;offset+=50){
    if(auth.currentUser?.uid!==user.uid)throw new Error('La sesión cambió.');
    const response=await fetch('/api/engagement/platform/metrics',{
      method:'POST',headers:{'Content-Type':'application/json','Authorization':'Bearer '+token},
      body:JSON.stringify({businessIds:businessIds.slice(offset,offset+50)}),
      cache:'no-store',credentials:'same-origin',
    });
    if(!response.ok)throw new Error('No se pudieron consultar las estadísticas.');
    const data=await response.json() as PlatformMetrics;
    if(typeof data.trackingSince!=='string'||!data.metrics||
       typeof data.metrics!=='object')throw new Error('Estadísticas incompletas.');
    if(trackingSince&&trackingSince!==data.trackingSince)throw new Error('Períodos incompatibles.');
    trackingSince=data.trackingSince;
    for(const id of businessIds.slice(offset,offset+50)){
      const value=data.metrics[id];
      if(!value||(value.visitsTotal!==null&&(!Number.isSafeInteger(value.visitsTotal)||value.visitsTotal<0))||
         !Number.isSafeInteger(value.ratingCount)||value.ratingCount<0||
         (value.ratingCount===0&&value.average!==null)||
         (value.ratingCount>0&&(typeof value.average!=='number'||value.average<1||value.average>5)))
        throw new Error('Métrica inválida.');
      metrics[id]=value;
    }
  }
  if(auth.currentUser?.uid!==user.uid)throw new Error('La sesión cambió.');
  return {trackingSince,metrics};
}
