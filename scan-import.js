/* Import observed scan surfaces; never create a template head. */
(function(root){
'use strict';
const MAX_BYTES=180*1024*1024,MAX_POINTS=150000;
function pack(positions,colors,name,warnings=[]){
 if(positions.length<300||positions.length!==colors.length)throw Error('模型有效点过少，或没有可用的三维表面。');
 const lo=[Infinity,Infinity,Infinity],hi=[-Infinity,-Infinity,-Infinity];
 for(let i=0;i<positions.length;i++){const k=i%3,v=positions[i];if(!Number.isFinite(v))throw Error('模型坐标无效。');lo[k]=Math.min(lo[k],v);hi[k]=Math.max(hi[k],v)}
 const scale=Math.max(...hi.map((v,k)=>v-lo[k]));if(scale<1e-10)throw Error('模型尺寸无效。');
 const center=lo.map((v,k)=>(v+hi[k])/2);
 return {schema:'scalp-reconstruction-v2',representation:'colored_point_cloud',positions:positions.map((v,i)=>(v-center[i%3])/scale*2),colors:colors.map(v=>Math.max(0,Math.min(255,Math.round(v)))),source:'imported_scan',source_name:name,warnings:['来自导入扫描表面的采样点；不代表精确头皮测量。',...warnings]};
}
function pathName(path){return decodeURIComponent(path).replace(/\\/g,'/').replace(/^\.\//,'')}
function localResolver(files,makeURL=URL.createObjectURL){
 const paths=new Map(),urls=[];
 for(const file of files){const key=pathName(file.webkitRelativePath||file.name);if(paths.has(key))throw Error('扫描文件路径重复。');paths.set(key,file)}
 return {urls,resolve(url){
   if(url.startsWith('data:')||url.startsWith('blob:'))return url;
   if(/^[a-z][a-z0-9+.-]*:/i.test(url)||url.startsWith('//'))throw Error('扫描包含外部资源，请导出完整模型和贴图后重试。');
   const key=pathName(url);let file=paths.get(key);
   if(!file){const matches=[...paths].filter(([path])=>path===key||path.endsWith('/'+key));if(matches.length===1)file=matches[0][1]}
   if(!file){const base=key.split('/').pop(),matches=[...paths].filter(([path])=>path.split('/').pop()===base);if(matches.length===1)file=matches[0][1]}
   if(!file)throw Error('缺少模型配套文件：'+key+'。请一起选择 BIN 和贴图，或直接导入完整 ZIP。');
   const objectURL=makeURL(file);urls.push(objectURL);return objectURL;
 }};
}
function srgb(v){return v<=.0031308?12.92*v:1.055*Math.pow(Math.max(0,v),1/2.4)-.055}
function linear(v){return v<=.04045?v/12.92:Math.pow((v+.055)/1.055,2.4)}
async function unpack(files){
 if(files.length===1&&/\.zip$/i.test(files[0].name)){
   const {unzipSync}=await import('https://esm.sh/fflate@0.8.2');
   let total=0;
   const entries=unzipSync(new Uint8Array(await files[0].arrayBuffer()),{filter(entry){total+=entry.originalSize;if(total>MAX_BYTES)throw Error('解压后文件超过 180MB，请降低扫描导出精度。');return !entry.name.endsWith('/')}});
   return Object.entries(entries).map(([name,bytes])=>{const f=new File([bytes],name);return f});
 }
 return files;
}
async function load(selected,progress=()=>{}){
 if(!selected.length)throw Error('请选择扫描文件。');
 if(selected.reduce((sum,f)=>sum+f.size,0)>MAX_BYTES)throw Error('扫描文件合计不超过 180MB，请降低导出精度。');
 progress('正在读取扫描文件；模型只在本机处理。');
 const files=await unpack([...selected]);
 const models=files.filter(f=>/\.(glb|gltf)$/i.test(f.name));
 if(models.length!==1)throw Error('请选择一个 GLB、一个完整 GLTF 文件组，或包含一个模型的 ZIP。');
 const main=models[0];
 const [THREE,{GLTFLoader},{DRACOLoader}]=await Promise.all([
   import('https://esm.sh/three@0.180.0'),
   import('https://esm.sh/three@0.180.0/examples/jsm/loaders/GLTFLoader.js'),
   import('https://esm.sh/three@0.180.0/examples/jsm/loaders/DRACOLoader.js')]);
 const resources=localResolver(files),manager=new THREE.LoadingManager();
 manager.setURLModifier(url=>resources.resolve(url));
 const draco=new DRACOLoader();draco.setDecoderPath('https://www.gstatic.com/draco/versioned/decoders/1.5.7/');
 const loader=new GLTFLoader(manager).setDRACOLoader(draco);
 let scene;
 try{
   const input=/\.glb$/i.test(main.name)?await main.arrayBuffer():await main.text();
   // Paths are resolved only against files explicitly selected by the user.
   const directory=main.name.includes('/')?main.name.slice(0,main.name.lastIndexOf('/')+1):'';
   const gltf=await loader.parseAsync(input,directory);scene=gltf.scene;scene.updateMatrixWorld(true);
   progress('正在保留扫描的几何与颜色，生成可圈画表面。');
   const positions=[],colors=[],triangles=[],pointObjects=[],textureCache=new Map();let totalArea=0;
   const a=new THREE.Vector3(),b=new THREE.Vector3(),c=new THREE.Vector3(),ab=new THREE.Vector3(),ac=new THREE.Vector3();
   function texturePixels(texture){
     if(!texture)return null;if(textureCache.has(texture))return textureCache.get(texture);
     const image=texture.image;if(!image)throw Error('扫描贴图无法读取，请重新导出完整文件。');
     const width=image.width||image.naturalWidth,height=image.height||image.naturalHeight;
     const canvas=document.createElement('canvas'),factor=Math.min(1,2048/Math.max(width,height));
     canvas.width=Math.max(1,Math.round(width*factor));canvas.height=Math.max(1,Math.round(height*factor));
     const ctx=canvas.getContext('2d',{willReadFrequently:true});ctx.drawImage(image,0,0,canvas.width,canvas.height);
     const result={data:ctx.getImageData(0,0,canvas.width,canvas.height).data,width:canvas.width,height:canvas.height};textureCache.set(texture,result);return result;
   }
   function indices(geometry,t){return geometry.index?[geometry.index.getX(t),geometry.index.getX(t+1),geometry.index.getX(t+2)]:[t,t+1,t+2]}
   scene.traverse(object=>{
     if(!object.isMesh&&!object.isPoints)return;
     if(object.isSkinnedMesh||object.isInstancedMesh)throw Error('请导出静态扫描网格，不支持动画或实例模型。');
     const geometry=object.geometry,p=geometry.attributes.position;if(!p)return;
     if(object.isPoints){pointObjects.push(object);return}
     const count=geometry.index?geometry.index.count:p.count;
     if(count/3+triangles.length>3000000)throw Error('扫描面数过多，请先简化至三百万面以内。');
     for(let t=0;t+2<count;t+=3){
       const ids=indices(geometry,t);a.fromBufferAttribute(p,ids[0]).applyMatrix4(object.matrixWorld);b.fromBufferAttribute(p,ids[1]).applyMatrix4(object.matrixWorld);c.fromBufferAttribute(p,ids[2]).applyMatrix4(object.matrixWorld);
       const area=ab.subVectors(b,a).cross(ac.subVectors(c,a)).length()*.5;if(!Number.isFinite(area)||area<=0)continue;
       totalArea+=area;triangles.push({object,t,area:totalArea});
     }
   });
   let seed=12345;function random(){seed=(Math.imul(1664525,seed)+1013904223)>>>0;return seed/4294967296}
   const uv=new THREE.Vector2();let noAppearance=false;
   function sample(object,ids,w){
     const geometry=object.geometry,p=geometry.attributes.position;
     let material=object.material;
     if(Array.isArray(material)){const group=geometry.groups.find(g=>ids.triangle>=g.start&&ids.triangle<g.start+g.count);material=material[group?group.materialIndex:0]}
     const color=geometry.attributes.color,texture=material&&material.map;
     const uvAttribute=texture?geometry.attributes[texture.channel?'uv'+texture.channel:'uv']:null;
     if(texture&&!uvAttribute)throw Error('扫描贴图缺少 UV 坐标，无法保留外观。');
     let xyz=[0,0,0],rgb=[1,1,1];
     for(let j=0;j<ids.length;j++){
       a.fromBufferAttribute(p,ids[j]).applyMatrix4(object.matrixWorld);xyz[0]+=a.x*w[j];xyz[1]+=a.y*w[j];xyz[2]+=a.z*w[j];
     }
     if(color)for(let k=0;k<3;k++)rgb[k]=ids.reduce((sum,id,j)=>sum+color[['getX','getY','getZ'][k]](id)*w[j],0);
     if(material&&material.color){rgb[0]*=material.color.r;rgb[1]*=material.color.g;rgb[2]*=material.color.b}
     if(texture){
       uv.set(ids.reduce((sum,id,j)=>sum+uvAttribute.getX(id)*w[j],0),ids.reduce((sum,id,j)=>sum+uvAttribute.getY(id)*w[j],0));texture.transformUv(uv);
       const pixels=texturePixels(texture),x=Math.max(0,Math.min(pixels.width-1,Math.floor(uv.x*pixels.width))),y=Math.max(0,Math.min(pixels.height-1,Math.floor(uv.y*pixels.height))),offset=(y*pixels.width+x)*4;
       for(let k=0;k<3;k++)rgb[k]*=linear(pixels.data[offset+k]/255);
     }else if(!color){noAppearance=true}
     positions.push(...xyz);colors.push(...rgb.map(v=>srgb(v)*255));
   }
   if(totalArea){
     for(let n=0;n<MAX_POINTS;n++){
       const target=random()*totalArea;let lo=0,hi=triangles.length-1;while(lo<hi){const mid=(lo+hi)>>1;if(triangles[mid].area<target)lo=mid+1;else hi=mid}
       const item=triangles[lo],ids=indices(item.object.geometry,item.t);ids.triangle=item.t;
       const u=Math.sqrt(random()),v=random();sample(item.object,ids,[1-u,u*(1-v),u*v]);
       if(n%20000===0)await new Promise(resolve=>setTimeout(resolve,0));
     }
   }else for(const object of pointObjects){
     const p=object.geometry.attributes.position,step=Math.max(1,Math.ceil(p.count/MAX_POINTS));
     for(let i=0;i<p.count&&positions.length/3<MAX_POINTS;i+=step)sample(object,[i],[1]);
   }
   return pack(positions,colors,main.name,noAppearance?['部分表面没有扫描颜色或贴图，显示的是材质颜色；不能视为原始肤色。']:[]);
 }finally{
   resources.urls.forEach(url=>URL.revokeObjectURL(url));draco.dispose();
   if(scene)scene.traverse(object=>{if(object.geometry)object.geometry.dispose();for(const material of [].concat(object.material||[])){if(material.map)material.map.dispose();material.dispose()}});
 }
}
const api={load,pack,localResolver};if(typeof module!=='undefined'&&module.exports)module.exports=api;else root.ScanImport=api;
})(typeof globalThis!=='undefined'?globalThis:window);
