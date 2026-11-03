import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { JSDOM } from 'jsdom';
const bundle = await build({ bundle: true, write: false, format: 'iife', platform: 'browser',
  stdin: { resolveDir: process.cwd(), loader: 'jsx', contents: `import React from 'react'; import {createRoot} from 'react-dom/client'; import {BusinessTablesCheckout} from './src/components/platform/BusinessTablesCheckout'; const root=createRoot(document.getElementById('root')); window.render=p=>root.render(<BusinessTablesCheckout {...p}/>);` },
  plugins: [{ name: 'data', setup(b) {
    b.onResolve({filter: /lib\/firebase$/}, () => ({path:'firebase',namespace:'mock'}));
    b.onResolve({filter: /lib\/businessTableCheckout$/}, () => ({path:'checkout',namespace:'mock'}));
    b.onLoad({filter: /.*/,namespace:'mock'}, ({path}) => ({loader:'js',contents: path==='firebase' ? 'export const db={}; export const getCurrentAuthUser=()=>window.user;' : `export const BUSINESS_TABLE_NUMBERS=[1,2,4,5,6,7,8,9]; export const chargeBusinessTable=(db,input)=>new Promise((resolve,reject)=>window.calls.push({input,resolve,reject}));`}));
  }}],
});
const dom=new JSDOM('<div id="root"></div>',{runScripts:'outside-only',url:'https://example.test'});
const w=dom.window,d=w.document; w.user={uid:'a',displayName:'Gio'}; w.calls=[];
const wait=async f=>{for(let i=0;i<100;i++){if(f())return;await new Promise(r=>setTimeout(r,10));}assert.fail('UI timeout');};
const button=t=>[...d.querySelectorAll('button')].find(b=>b.textContent===t);
const o={id:'o',restaurantId:'a',tableNumber:2,orderType:'dine_in',billingStatus:'PENDIENTE',status:'NUEVO',total:25,code:'X',items:[]};
try {
 w.eval(bundle.outputFiles[0].text);
 w.render({businessId:'a',orders:[o],ready:false});await wait(()=>d.body.textContent.includes('Esperando'));assert.equal(button('Cobrar mesa 2'),undefined);
 w.render({businessId:'a',orders:[o],ready:true});await wait(()=>button('Cobrar mesa 2'));assert.equal(button('Cobrar mesa 1').disabled,true);
 button('Cobrar mesa 2').click();await wait(()=>button('Confirmar pago recibido'));assert.equal(button('Confirmar pago recibido').disabled,true);
 const input=d.querySelector('input'); Object.getOwnPropertyDescriptor(w.HTMLInputElement.prototype,'value').set.call(input,'50');input.dispatchEvent(new w.Event('input',{bubbles:true}));await wait(()=>!button('Confirmar pago recibido').disabled);
 button('Confirmar pago recibido').click();button('Confirmar pago recibido')?.click();await wait(()=>w.calls.length===1); assert.equal(w.calls[0].input.businessId,'a');
 w.calls[0].reject(new w.Error('Permiso denegado'));await wait(()=>d.body.textContent.includes('Permiso denegado'));assert.ok(d.querySelector('[role="dialog"]'));
 button('Confirmar pago recibido').click();await wait(()=>w.calls.length===2);w.calls[1].resolve({total:25,changeDue:25,paymentId:'pay'});await wait(()=>!d.querySelector('[role="dialog"]'));assert.ok(d.body.textContent.includes('Cobro registrado'));
 w.render({businessId:'b',orders:[],ready:true});await wait(()=>!d.body.textContent.includes('Cobro registrado')); assert.equal(button('Cobrar mesa 2').disabled,true);
 console.log('PASS: mesas, carga incompleta, efectivo, doble clic, error recuperable, confirmación y cambio de negocio.');
} finally {dom.window.close();}
