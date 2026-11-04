import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { JSDOM } from 'jsdom';
const result = await build({bundle:true,write:false,platform:'browser',format:'iife',stdin:{resolveDir:process.cwd(),loader:'jsx',contents:`import React from 'react'; import {createRoot} from 'react-dom/client'; import {BusinessTableReconciliation} from './src/components/platform/BusinessTableReconciliation'; const root=createRoot(document.getElementById('root')); window.render=(id,start='2026-11-04T12:00:00Z')=>root.render(<BusinessTableReconciliation businessId={id} shiftStart={start}/>); window.unmount=()=>root.unmount();`},plugins:[{name:'feed',setup(b){b.onResolve({filter:/lib\/businessTableReconciliationFeed$/},()=>({path:'feed',namespace:'mock'}));b.onLoad({filter:/.*/,namespace:'mock'},()=>({contents:`export const subscribeToBusinessTableReconciliation=(id,start,end,next)=>{const s={id,start,next,stopped:false};window.feeds.push(s);return()=>s.stopped=true;};`,loader:'js'}));}}]});
const dom=new JSDOM('<div id="root"></div>',{runScripts:'outside-only',url:'https://example.test'}),w=dom.window,d=w.document;w.feeds=[];
const wait=async f=>{for(let i=0;i<100;i++){if(f())return;await new Promise(r=>setTimeout(r,10));}assert.fail('UI timeout');};
const text=()=>d.body.textContent,button=t=>[...d.querySelectorAll('button')].find(b=>b.textContent===t);
const response=(id,issues=[])=>({businessId:id,status:'diagnostic',source:'separate-server-snapshots',atomic:false,authorizesClose:false,reconciliation:{tableTotals:{cash:25,card:10,platforms:5,total:40,count:2},issues,inspectedPayments:2,authorizesClose:false}});
try {
 w.eval(result.outputFiles[0].text);w.render('a');await wait(()=>button('Revisar cobros de mesas'));assert.equal(w.feeds.length,0);
 button('Revisar cobros de mesas').click();await wait(()=>w.feeds.length===1);assert.ok(text().includes('Consultando'));
 w.feeds[0].next(response('a'));await wait(()=>text().includes('$40.00'));assert.ok(text().includes('sigue pendiente'));
 w.feeds[0].next(response('a',[{code:'IMPORTE_DISCREPANTE',orderId:'order-a',paymentId:'pay-a'}]));await wait(()=>text().includes('order-a'));assert.ok(!text().includes('$40.00'));
 w.feeds[0].next(response('a',[{code:'TENANT_AJENO',orderId:'secret-b'}]));await wait(()=>text().includes('otro negocio'));assert.ok(!text().includes('secret-b'));
 w.feeds[0].next({status:'error',businessId:'a',error:new Error('offline')});await wait(()=>text().includes('No se pudo completar'));assert.ok(!text().includes('$40.00'));
 button('Actualizar revisión').click();await wait(()=>w.feeds.length===2);assert.equal(w.feeds[0].stopped,true);
 w.feeds[0].next(response('a'));await new Promise(r=>setTimeout(r,20));assert.ok(!text().includes('$40.00'));
 w.feeds[1].next(response('a'));await wait(()=>text().includes('$40.00'));
 w.render('b');await wait(()=>button('Revisar cobros de mesas'));assert.equal(w.feeds[1].stopped,true);assert.ok(!text().includes('$40.00'));
 button('Revisar cobros de mesas').click();await wait(()=>w.feeds.length===3);
 w.feeds[2].next(response('a'));await new Promise(r=>setTimeout(r,20));assert.ok(!text().includes('$40.00'));
 w.render('b','2026-11-04T15:00:00Z');await wait(()=>button('Revisar cobros de mesas'));assert.equal(w.feeds[2].stopped,true);
 button('Revisar cobros de mesas').click();await wait(()=>w.feeds.length===4);button('Ocultar revisión de mesas').click();await wait(()=>w.feeds[3].stopped);
 w.unmount(); console.log('PASS: revisión bajo demanda, totales, diferencias, error/reintento, privacidad, callbacks obsoletos y cambio de turno/negocio.');
} finally {dom.window.close();}
