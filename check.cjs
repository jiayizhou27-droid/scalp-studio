const fs=require('fs'),vm=require('vm'),assert=require('assert');
const noop=()=>{};const elements=new Map();
const gl=new Proxy({getShaderParameter:()=>true,getProgramParameter:()=>true,createBuffer:()=>({}),createProgram:()=>({}),createShader:()=>({}),getAttribLocation:()=>1,getUniformLocation:()=>({})},{get:(o,k)=>k in o?o[k]:noop});
function element(){return {value:'#43413b',style:{},classList:{add:noop,toggle:noop},append:noop,replaceChildren:noop,getContext:type=>type==='webgl'?gl:{},getBoundingClientRect:()=>({width:700,height:550}),selectedOptions:[{text:'测试区域'}],setAttribute:noop};}
const sandbox={console,Math,Date,JSON,Float32Array,Uint8Array,Blob,URL,requestAnimationFrame:noop,devicePixelRatio:1,document:{getElementById:id=>{if(!elements.has(id))elements.set(id,element());return elements.get(id)},createElement:()=>element(),querySelectorAll:()=>[]}};
vm.createContext(sandbox);vm.runInContext(fs.readFileSync('app.js','utf8'),sandbox);
vm.runInContext(`
if(geometry!==null)throw Error('Unexpected template');
const d={schema:'scalp-reconstruction-v2',representation:'colored_point_cloud',positions:Array.from({length:360},(_,i)=>Math.sin(i)*.5),colors:Array(360).fill(180),view_count:3};
setGeometry(d);draw(false);if(zones.length!==1)throw Error('No independent zone');
if(afterColors.some((v,i)=>Math.abs(v-180/255)>1e-6))throw Error('Unpainted head changed');
zones[0].weights.fill(1);zones[0].params.density=100;zones[0].params.opacity=80;recolor();
if(!afterColors.some(v=>v<.6))throw Error('Region did not affect color');
zones[0].visible=false;recolor();if(afterColors.some(v=>Math.abs(v-180/255)>1e-6))throw Error('Hidden region still rendered');
zones[0].visible=true;zones[0].params.density=0;recolor();if(spotSizes.some(v=>v!==0))throw Error('Zero density must not add pigment');
const bad={...d,positions:[NaN,...d.positions.slice(1)]};let rejected=false;try{validGeometry(bad)}catch{rejected=true}if(!rejected)throw Error('Malformed geometry accepted');
`,sandbox);console.log('PASS: no template fallback, geometry import, render path, independent regions, untouched colors, hidden regions, zero density and invalid geometry.');
