const assert=require('assert'),fs=require('fs'),F=require('./facescape-local.js');
function npy(shape,values,fortran=false){
 const text="{'descr': '<f8', 'fortran_order': "+(fortran?'True':'False')+", 'shape': ("+shape.join(', ')+(shape.length===1?',':'')+"), }";
 const header=Buffer.from(text+' '.repeat((64-(10+text.length+1)%64)%64)+'\n'),prefix=Buffer.alloc(10);prefix[0]=147;prefix.write('NUMPY',1);prefix[6]=1;prefix.writeUInt16LE(header.length,8);
 const data=Buffer.alloc(values.length*8);values.forEach((v,i)=>data.writeDoubleLE(v,i*8));return Buffer.concat([prefix,header,data]);
}
for(const fortran of [false,true]){
 const shape=[6,52,50],values=Array(6*52*50);
 for(let r=0;r<6;r++)for(let e=0;e<52;e++)for(let k=0;k<50;k++)values[fortran?r+6*e+6*52*k:r*52*50+e*50+k]=r*10000+e*100+k;
 const sink=F.arraySink(true),bytes=npy(shape,values,fortran);for(let i=0;i<bytes.length;i+=137)sink.push(bytes.subarray(i,i+137),i+137>=bytes.length);
 const parsed=sink.finish();assert.deepEqual(parsed.shape,[6,50]);for(let r=0;r<6;r++)for(let k=0;k<50;k++)assert.equal(parsed.values[r*50+k],r*10000+k);
}
assert.throws(()=>F.arraySink().push(new Uint8Array(100),true));
const truncated=F.arraySink();truncated.push(npy([3],[1,2,3]).subarray(0,20));assert.throws(()=>truncated.finish());
assert.throws(()=>F.solve([[0,0],[0,0]],[1,1]));assert.deepEqual(F.solve([[2,0],[0,4]],[6,8]),[3,2]);
const source=[[-1,0],[1,0],[0,1]],target=source.map(([x,y])=>[2*x-y+3,x+2*y+4]),camera=F.similarity(source,target);for(const [k,v] of Object.entries({a:2,b:1,tx:3,ty:4}))assert(Math.abs(camera[k]-v)<1e-8);
const mu=new Float32Array([-1,.5,0,-.4,.5,0,.4,.5,0,1,.5,0,0,0,1,-.5,-.6,0,.5,-.6,0,0,-1.2,0]);
const model={mu,basis:new Float32Array(24*50),dim:50,count:8,landmarks:[0,1,2,3,4,5,6,7],faces:[0,1,4,1,2,4,2,3,4,0,4,7,3,7,4]};
// Make one identity direction change mouth width; verify fitting changes geometry.
model.basis[15*50]=-.08;model.basis[18*50]=.08;
const points=[];for(let v=0;v<8;v++)points.push([.5+.2*(mu[v*3]+model.basis[v*3*50]),.35-.2*mu[v*3+1]]);
const result=F.fit(model,points);assert(result.error<.02);assert(result.coefficients[0]>.05);assert(result.vertices[18]>mu[18]);
const data=F.geometry(model,result);assert.equal(data.positions.length,360000);assert.equal(data.source,'facescape_fit');assert(data.positions.every(Number.isFinite));assert(data.positions.every(x=>Math.abs(x)<=1.000001));assert.equal(data.colors.length,data.positions.length);
assert.throws(()=>F.fit(model,Array(8).fill([.5,.5])));
// Legacy FaceScape math remains testable; its manual-model UI has been retired.
console.log('PASS: C/Fortran streamed NPY neutral extraction, truncation, solver, camera, identity deformation and surface generation (synthetic data only).');
