/* Independent browser adapter for user-supplied FaceScape v1.6 data.
 * Model/data are not included or redistributed. Neutral expression only.
 * Reference layout: zhuhao-nju/facescape toolkit/src/facescape_bm.py.
 */
(function(root){'use strict';
const LANDMARKS=[36,39,42,45,30,48,54,8];
const LABELS=['画面左眼外眼角','画面左眼内眼角','画面右眼内眼角','画面右眼外眼角','鼻尖','画面左嘴角','画面右嘴角','下巴最下端'];
function header(bytes){
 if(bytes.length<10)return null;
 if(bytes[0]!==147||String.fromCharCode(...bytes.slice(1,6))!=='NUMPY')throw Error('不是有效的 NumPy 模型数组。');
 const major=bytes[6];if(![1,2,3].includes(major))throw Error('不支持的 NPY 版本。');
 const prefix=major===1?10:12;if(bytes.length<prefix)return null;
 const view=new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength),length=major===1?view.getUint16(8,true):view.getUint32(8,true);
 if(length>65536)throw Error('NPY 数组头过大。');if(bytes.length<prefix+length)return null;
 const text=new TextDecoder().decode(bytes.slice(prefix,prefix+length));
 const dtype=/'descr'\s*:\s*'([^']+)'/.exec(text),shape=/'shape'\s*:\s*\(([^)]*)\)/.exec(text),order=/'fortran_order'\s*:\s*(True|False)/.exec(text);
 if(!dtype||!shape||!order)throw Error('模型数组头无效。');
 const dimensions=shape[1].split(',').map(x=>x.trim()).filter(Boolean).map(Number);
 if(!dimensions.length||dimensions.some(x=>!Number.isSafeInteger(x)||x<=0))throw Error('模型数组维度无效。');
 const match=/^([<>=|])([fiu])(4|8)$/.exec(dtype[1]);if(!match)throw Error('只读取数值数组，不加载 pickle 或对象数据。');
 return {offset:prefix+length,shape:dimensions,fortran:order[1]==='True',type:match[2],size:+match[3],little:match[1]!=='>'};
}
function numberAt(view,offset,h){
 let value;if(h.type==='f')value=h.size===4?view.getFloat32(offset,h.little):view.getFloat64(offset,h.little);
 else if(h.size===4)value=h.type==='i'?view.getInt32(offset,h.little):view.getUint32(offset,h.little);
 else value=Number(h.type==='i'?view.getBigInt64(offset,h.little):view.getBigUint64(offset,h.little));
 if(!Number.isFinite(value))throw Error('模型包含无效数值。');return value;
}
function arraySink(core=false){
 let pre=new Uint8Array(0),h=null,body=0,selected=null,block=0,stride=0,blocks=0;
 return {push(chunk,final=false){
   if(!h){const joined=new Uint8Array(pre.length+chunk.length);joined.set(pre);joined.set(chunk,pre.length);pre=joined;h=header(pre);if(!h){if(final)throw Error('模型数组不完整。');return}
     const count=h.shape.reduce((a,b)=>a*b,1);if(!Number.isSafeInteger(count))throw Error('模型数组过大。');
     if(core){if(h.type!=='f'||h.shape.length!==3||h.shape[0]%3||h.shape[0]>540000||h.shape[1]!==52||h.shape[2]>100)throw Error('请选择 v1.6 的 50 身份、52 表情模型（非 id_exp 版本）。');
       block=(h.fortran?h.shape[0]:h.shape[2])*h.size;stride=block*h.shape[1];blocks=h.fortran?h.shape[2]:h.shape[0];
     }else{if(count>2000000)throw Error('辅助模型数组过大。');block=count*h.size;stride=block;blocks=1}
     if(block*blocks>220*1024*1024)throw Error('模型中性形状过大。');selected=new Uint8Array(block*blocks);chunk=pre.subarray(h.offset);pre=null;
   }
   let pos=0;const expected=h.shape.reduce((a,b)=>a*b,1)*h.size;if(body+chunk.length>expected)throw Error('模型数组字节数无效。');
   while(pos<chunk.length){const global=body+pos,index=Math.floor(global/stride),within=global%stride,n=Math.min(chunk.length-pos,stride-within,within<block?block-within:Infinity);if(index<blocks&&within<block)selected.set(chunk.subarray(pos,pos+n),index*block+within);pos+=n}
   body+=chunk.length;if(final&&body!==expected)throw Error('模型数组截断。');
 },finish(){
   if(!h||body!==h.shape.reduce((a,b)=>a*b,1)*h.size)throw Error('模型数组不完整。');
   const count=selected.length/h.size,view=new DataView(selected.buffer),values=new Float32Array(count);
   if(core&&h.fortran){const rows=h.shape[0],cols=h.shape[2];for(let r=0;r<rows;r++)for(let c=0;c<cols;c++)values[r*cols+c]=numberAt(view,(c*rows+r)*h.size,h)}
   else if(!core&&h.fortran&&h.shape.length===2){const [rows,cols]=h.shape;for(let r=0;r<rows;r++)for(let c=0;c<cols;c++)values[r*cols+c]=numberAt(view,(c*rows+r)*h.size,h)}
   else for(let i=0;i<count;i++)values[i]=numberAt(view,i*h.size,h);
   return {values,shape:core?[h.shape[0],h.shape[2]]:h.shape};
 }};
}
async function load(file,progress=()=>{}){
 if(!file||!/\.npz$/i.test(file.name)||file.size>2.5*1024**3)throw Error('请选择官方 v1.6 的 50 身份模型 NPZ（不超过 2.5GB）。');
 if(/id_exp/i.test(file.name))throw Error('请选择 _id_front.npz 或 _id.npz，不能使用 id_exp 模型。');
 const {Unzip,UnzipInflate}=await import('https://esm.sh/fflate@0.8.2');
 const wanted=new Set(['shape_bm_core','id_mean','id_var','lm_list_v16','fv_indices']),sinks=new Map();let failure=null;
 const unzip=new Unzip(entry=>{const key=entry.name.replace(/\.npy$/,'');if(!wanted.has(key))return;
   if(sinks.has(key)){failure=Error('模型数组名称重复。');return}const sink=arraySink(key==='shape_bm_core');sinks.set(key,sink);
   entry.ondata=(error,chunk,final)=>{if(failure)return;try{if(error)throw error;sink.push(chunk,final)}catch(e){failure=e}};entry.start();
 });unzip.register(UnzipInflate);
 const reader=file.stream().getReader();let read=0;
 try{while(true){const {value,done}=await reader.read();if(done)break;for(let start=0;start<value.length;start+=65536){unzip.push(value.subarray(start,start+65536));if(failure)throw failure}read+=value.length;progress('正在本机读取 FaceScape 模型 '+Math.round(read/file.size*100)+'%');await new Promise(resolve=>setTimeout(resolve,0))}unzip.push(new Uint8Array(0),true);if(failure)throw failure}
 finally{await reader.cancel();reader.releaseLock()}
 for(const key of wanted)if(!sinks.has(key))throw Error('模型缺少 '+key+'；请下载官方 v1.6 完整 NPZ。');
 const arrays=Object.fromEntries([...sinks].map(([key,sink])=>[key,sink.finish()]));return prepare(arrays);
}
function prepare(arrays){
 const core=arrays.shape_bm_core,dim=core.shape[1],count=core.shape[0]/3,mean=arrays.id_mean.values,variance=arrays.id_var.values,lm=arrays.lm_list_v16.values,faces=arrays.fv_indices.values;
 if(dim!==50||mean.length!==dim||variance.length!==dim||lm.length!==68||faces.length%3||lm.some(i=>!Number.isInteger(i)||i<0||i>=count)||faces.some(i=>!Number.isInteger(i)||i<1||i>count)||variance.some(v=>v<0))throw Error('模型索引或身份统计不符合 FaceScape v1.6 格式。');
 const mu=new Float32Array(count*3),basis=new Float32Array(core.values.length);
 for(let r=0;r<count*3;r++)for(let k=0;k<dim;k++){const value=core.values[r*dim+k];mu[r]+=value*mean[k];basis[r*dim+k]=value*Math.sqrt(variance[k])}
 const lo=[Infinity,Infinity,Infinity],hi=[-Infinity,-Infinity,-Infinity];for(let i=0;i<mu.length;i++){lo[i%3]=Math.min(lo[i%3],mu[i]);hi[i%3]=Math.max(hi[i%3],mu[i])}
 const scale=Math.max(...hi.map((x,k)=>x-lo[k]))/2;if(!Number.isFinite(scale)||scale<1e-8)throw Error('平均头型无效。');
 for(let i=0;i<mu.length;i++){mu[i]=(mu[i]-(lo[i%3]+hi[i%3])/2)/scale;for(let k=0;k<dim;k++)basis[i*dim+k]/=scale}
 return {mu,basis,dim,count,landmarks:LANDMARKS.map(i=>lm[i]),faces:Array.from(faces,x=>x-1)};
}
function solve(matrix,rhs){
 const n=rhs.length,a=matrix.map((row,i)=>[...row,rhs[i]]);
 for(let c=0;c<n;c++){let pivot=c;for(let r=c+1;r<n;r++)if(Math.abs(a[r][c])>Math.abs(a[pivot][c]))pivot=r;if(Math.abs(a[pivot][c])<1e-12)throw Error('拟合矩阵退化，请重新标点。');[a[c],a[pivot]]=[a[pivot],a[c]];const v=a[c][c];for(let j=c;j<=n;j++)a[c][j]/=v;for(let r=0;r<n;r++){if(r===c)continue;const factor=a[r][c];for(let j=c;j<=n;j++)a[r][j]-=factor*a[c][j]}}
 return a.map(row=>row[n]);
}
function similarity(source,target){
 const center=points=>[0,1].map(k=>points.reduce((sum,p)=>sum+p[k],0)/points.length),s=center(source),t=center(target);let aa=0,bb=0,den=0;
 for(let i=0;i<source.length;i++){const x=source[i][0]-s[0],y=source[i][1]-s[1],u=target[i][0]-t[0],v=target[i][1]-t[1];aa+=x*u+y*v;bb+=x*v-y*u;den+=x*x+y*y}
 if(den<1e-10)throw Error('标点位置退化。');const a=aa/den,b=bb/den;if(Math.hypot(a,b)<1e-5)throw Error('标点跨度不足。');return {a,b,tx:t[0]-a*s[0]+b*s[1],ty:t[1]-b*s[0]-a*s[1]};
}
function fit(model,points){
 if(points.length!==8||points.some(p=>p.length!==2||p.some(v=>!Number.isFinite(v))))throw Error('请按顺序标出八个人脸位置。');
 if(points[3][0]-points[0][0]<.05||Math.hypot(points[7][0]-points[4][0],points[7][1]-points[4][1])<.05)throw Error('标点顺序或间距有误，请使用清晰、未镜像的正面照片。');
 const {mu,basis,dim,landmarks}=model,target=points.map(p=>[p[0],-p[1]]);let z=Array(dim).fill(0),camera;
 const lm=()=>landmarks.map(v=>[0,1].map(k=>mu[v*3+k]+z.reduce((sum,value,j)=>sum+basis[(v*3+k)*dim+j]*value,0)));
 for(let iteration=0;iteration<8;iteration++){
   camera=similarity(lm(),target);const {a,b,tx,ty}=camera,A=[],rhs=[];
   for(let n=0;n<landmarks.length;n++){const v=landmarks[n],x=mu[v*3],y=mu[v*3+1],bx=Array.from(basis.subarray(v*3*dim,(v*3+1)*dim)),by=Array.from(basis.subarray((v*3+1)*dim,(v*3+2)*dim));A.push(bx.map((q,k)=>a*q-b*by[k]),bx.map((q,k)=>b*q+a*by[k]));rhs.push(target[n][0]-(a*x-b*y+tx),target[n][1]-(b*x+a*y+ty))}
   const regularizer=.01*(a*a+b*b),normal=Array.from({length:dim},(_,i)=>Array.from({length:dim},(_,j)=>A.reduce((sum,row)=>sum+row[i]*row[j],0)+(i===j?regularizer:0))),right=Array.from({length:dim},(_,i)=>A.reduce((sum,row,r)=>sum+row[i]*rhs[r],0));z=solve(normal,right).map(v=>Math.max(-2.5,Math.min(2.5,v)));
 }
 camera=similarity(lm(),target);const vertices=new Float32Array(mu.length);for(let r=0;r<mu.length;r++)vertices[r]=mu[r]+z.reduce((sum,value,j)=>sum+basis[r*dim+j]*value,0);
 const error=Math.sqrt(lm().reduce((sum,p,i)=>{const u=camera.a*p[0]-camera.b*p[1]+camera.tx,v=camera.b*p[0]+camera.a*p[1]+camera.ty;return sum+(u-target[i][0])**2+(v-target[i][1])**2},0)/8);
 if(error>.06)throw Error('拟合误差过大。请用正面、闭嘴照片并重新标点。');
 return {vertices,coefficients:z,error};
}
function geometry(model,result){
 const vertices=result.vertices,faces=model.faces,cumulative=[];let area=0;
 for(let t=0;t<faces.length;t+=3){const a=faces[t]*3,b=faces[t+1]*3,c=faces[t+2]*3,ab=[0,1,2].map(k=>vertices[b+k]-vertices[a+k]),ac=[0,1,2].map(k=>vertices[c+k]-vertices[a+k]);area+=Math.hypot(ab[1]*ac[2]-ab[2]*ac[1],ab[2]*ac[0]-ab[0]*ac[2],ab[0]*ac[1]-ab[1]*ac[0])/2;cumulative.push(area)}
 if(area<1e-9)throw Error('模型没有可用表面。');const positions=[],colors=[];let seed=72;const random=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296};
 for(let n=0;n<120000;n++){const target=random()*area;let lo=0,hi=cumulative.length-1;while(lo<hi){const mid=(lo+hi)>>1;if(cumulative[mid]<target)lo=mid+1;else hi=mid}const u=Math.sqrt(random()),v=random(),weights=[1-u,u*(1-v),u*v];for(let k=0;k<3;k++)positions.push(weights.reduce((sum,w,j)=>sum+w*vertices[faces[lo*3+j]*3+k],0));colors.push(188,182,171)}
 const lo=[Infinity,Infinity,Infinity],hi=[-Infinity,-Infinity,-Infinity];positions.forEach((v,i)=>{lo[i%3]=Math.min(lo[i%3],v);hi[i%3]=Math.max(hi[i%3],v)});const scale=Math.max(...hi.map((v,k)=>v-lo[k]))/2;
 return {schema:'scalp-reconstruction-v2',representation:'colored_point_cloud',source:'facescape_fit',positions:positions.map((v,i)=>(v-(lo[i%3]+hi[i%3])/2)/scale),colors,fit_error:result.error,identity_coefficients:result.coefficients,warnings:['FaceScape 非商用实验：中性表情、正面八点的简化身份拟合，非官方完整重建算法。','灰色为统一材质，不是照片肤色。头顶、后脑及遮挡部位来自统计模型，未经真实测量。','头皮、发缝与实际纹发效果未验证；不自动补造模型缺少的部位。']};
}
const api={LANDMARKS,LABELS,header,arraySink,prepare,load,solve,similarity,fit,geometry};if(typeof module!=='undefined'&&module.exports)module.exports=api;else root.FaceScapeLocal=api;
})(globalThis);
