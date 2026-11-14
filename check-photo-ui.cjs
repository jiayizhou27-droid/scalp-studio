const fs=require('fs'),vm=require('vm'),assert=require('assert');
const elements=new Map(),noop=()=>{},ctx={drawImage:noop};
const $=id=>{if(!elements.has(id))elements.set(id,{textContent:'',classList:{toggle:noop,remove:noop},getContext:()=>ctx});return elements.get(id)};
let rendered=false,calls=0,fail=false;
const sandbox={$: $,document:{createElement:()=>({width:0,height:0,getContext:()=>ctx})},busy:false,pitch:0,dirty:false,geometry:null,setGeometry:()=>{rendered=true},status:noop,download:noop,Blob,setTimeout:fn=>fn(),createImageBitmap:async()=>({width:300,height:400,close:noop}),PhotoFace:{scan:async()=>{calls++;if(fail)throw Error('模型连接失败');return {}}}};
vm.createContext(sandbox);vm.runInContext(fs.readFileSync('photo-face-ui.js','utf8'),sandbox);
(async()=>{
 await $('photoFaceRun').onclick();assert($('photoFaceStatus').textContent.includes('先选择'));
 await $('photoFaceInput').onchange({target:{files:[{size:100}],value:'photo'}});assert(rendered);assert.equal(calls,1);assert($('photoFaceStatus').textContent.includes('已生成'));
 fail=true;await $('photoFaceRun').onclick();assert($('photoFaceStatus').textContent.includes('没有生成'));assert.equal(sandbox.busy,false);
 fail=false;await $('photoFaceRun').onclick();assert.equal(calls,3);assert.equal(sandbox.busy,false);
 console.log('PASS: upload triggers generation, no model picker, error recovery and retry.');
})().catch(error=>{console.error(error);process.exitCode=1});
