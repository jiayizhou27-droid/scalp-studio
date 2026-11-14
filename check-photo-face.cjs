const assert=require('assert'),fs=require('fs'),P=require('./photo-face.js'),topology=require('./face-topology.js');
assert.equal(topology.length/3,898);assert.equal(Math.max(...topology),467);
const landmarks=Array.from({length:478},(_,i)=>{const angle=i*2.399963;return {x:.5+.2*Math.cos(angle),y:.5+.3*Math.sin(angle),z:.05*Math.cos(angle*2)}});
const image={width:100,height:200,data:new Uint8ClampedArray(100*200*4)};for(let i=0;i<image.data.length;i+=4)image.data.set([30,90,160,255],i);
const geometry=P.build(landmarks,image,topology);assert.equal(geometry.source,'single_image_face');assert.equal(geometry.positions.length,360000);assert.equal(geometry.surface_mesh.positions.length,1404);assert(geometry.positions.every(v=>Number.isFinite(v)&&Math.abs(v)<=1.00001));assert.deepEqual(geometry.colors.slice(0,3),[30,90,160]);
const changed=landmarks.map((p,i)=>({...p,z:p.z+(i===1?.2:0)})),other=P.build(changed,image,topology);assert.notEqual(geometry.surface_mesh.positions[5],other.surface_mesh.positions[5]);
assert.throws(()=>P.build([],image,topology));assert.throws(()=>P.build(landmarks,image,[999,1,2]));assert.throws(()=>P.build(landmarks.map(p=>({...p,x:2})),image,topology));assert.throws(()=>P.build(landmarks.map(p=>({...p,z:NaN})),image,topology));
const canvas={width:image.width,height:image.height,getContext:()=>({getImageData:()=>image})};
(async()=>{
 await assert.rejects(()=>P.scan(canvas,()=>{},{detect:()=>({faceLandmarks:[]})}),/没有识别/);
 await assert.rejects(()=>P.scan(canvas,()=>{},{detect:()=>({faceLandmarks:[landmarks,landmarks]})}),/多张/);
 const result=await P.scan(canvas,()=>{},{detect:()=>({faceLandmarks:[landmarks]})});assert.equal(result.landmark_count,478);
 const html=fs.readFileSync('index.html','utf8');assert(html.includes('id="photoFaceInput"'));assert(!html.includes('id="fsModel"'));assert(!html.includes('facescape-ui.js'));assert(html.includes('photo-face-ui.js'));
 console.log('PASS: image-derived depth, mesh topology, preserved color, invalid outputs, no-face/multiple-face errors and automatic-photo UI (mock inference).');
})().catch(error=>{console.error(error);process.exitCode=1});
