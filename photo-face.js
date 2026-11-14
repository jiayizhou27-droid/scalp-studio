/* Single-image inferred facial surface. No canonical vertex positions or full-head fallback. */
(function(root){'use strict';
const VERSION='0.10.14',MODEL='https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task';
let detector=null,initializing=null;
async function initialize(progress){
 if(detector)return detector;if(initializing)return initializing;
 initializing=(async()=>{
   progress('正在自动加载人脸识别组件，首次需要联网……');
   const {FilesetResolver,FaceLandmarker}=await import('https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14/vision_bundle.mjs');
   const vision=await FilesetResolver.forVisionTasks('https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@'+VERSION+'/wasm');
   progress('正在自动下载人脸模型（约 3.8MB），不需要你选择模型文件……');
   const response=await fetch(MODEL,{signal:AbortSignal.timeout(60000)});if(!response.ok)throw Error('自动模型下载失败（HTTP '+response.status+'）。请检查网络后重试。');
   const bytes=new Uint8Array(await response.arrayBuffer());if(bytes.length<1000000)throw Error('下载的模型不完整，请重试。');
   progress('正在初始化本机人脸模型……');
   detector=await FaceLandmarker.createFromOptions(vision,{baseOptions:{modelAssetBuffer:bytes,delegate:'CPU'},runningMode:'IMAGE',numFaces:2,minFaceDetectionConfidence:.6,minFacePresenceConfidence:.6,outputFaceBlendshapes:false,outputFacialTransformationMatrixes:false});
   return detector;
 })();
 try{return await initializing}catch(error){detector=null;throw error}finally{initializing=null}
}
function build(landmarks,image,triangles){
 if(!Array.isArray(landmarks)||landmarks.length<468||landmarks.slice(0,468).some(p=>![p.x,p.y,p.z].every(Number.isFinite)))throw Error('没有取得有效的三维人脸关键点。');
 if(!image||image.width<32||image.height<32||image.data.length!==image.width*image.height*4)throw Error('照片像素无效。');
 if(!Array.isArray(triangles)||triangles.length%3||triangles.some(i=>!Number.isInteger(i)||i<0||i>=468))throw Error('人脸网格连接数据无效。');
 const lm=landmarks.slice(0,468),{width,height,data}=image;
 if(lm.filter(p=>p.x<0||p.x>1||p.y<0||p.y>1).length>30)throw Error('人脸没有完整入镜，请换一张完整正面照片。');
 const vertices=[],lo=[Infinity,Infinity,Infinity],hi=[-Infinity,-Infinity,-Infinity];
 for(const p of lm){const xyz=[p.x-.5,(.5-p.y)*height/width,-p.z];for(let k=0;k<3;k++){vertices.push(xyz[k]);lo[k]=Math.min(lo[k],xyz[k]);hi[k]=Math.max(hi[k],xyz[k])}}
 const span=Math.max(...hi.map((v,k)=>v-lo[k]));if(span<.04)throw Error('人脸太小，请选择脸部更清晰的照片。');
 const center=lo.map((v,k)=>(v+hi[k])/2),normalized=vertices.map((v,i)=>(v-center[i%3])*2/span);
 function color(x,y){const xx=Math.max(0,Math.min(width-1,x*width)),yy=Math.max(0,Math.min(height-1,y*height)),x0=Math.floor(xx),y0=Math.floor(yy),x1=Math.min(width-1,x0+1),y1=Math.min(height-1,y0+1),dx=xx-x0,dy=yy-y0;return [0,1,2].map(k=>Math.round(data[(y0*width+x0)*4+k]*(1-dx)*(1-dy)+data[(y0*width+x1)*4+k]*dx*(1-dy)+data[(y1*width+x0)*4+k]*(1-dx)*dy+data[(y1*width+x1)*4+k]*dx*dy))}
 const vertexColors=lm.flatMap(p=>color(p.x,p.y)),cumulative=[];let area=0;
 for(let t=0;t<triangles.length;t+=3){const a=triangles[t]*3,b=triangles[t+1]*3,c=triangles[t+2]*3,ab=[0,1,2].map(k=>normalized[b+k]-normalized[a+k]),ac=[0,1,2].map(k=>normalized[c+k]-normalized[a+k]);area+=Math.hypot(ab[1]*ac[2]-ab[2]*ac[1],ab[2]*ac[0]-ab[0]*ac[2],ab[0]*ac[1]-ab[1]*ac[0])/2;cumulative.push(area)}
 if(area<1e-8)throw Error('推断的人脸表面退化，请换一张照片。');
 const positions=[],colors=[];let seed=928;const random=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296};
 for(let n=0;n<120000;n++){
   const target=random()*area;let a=0,b=cumulative.length-1;while(a<b){const mid=(a+b)>>1;if(cumulative[mid]<target)a=mid+1;else b=mid}
   const u=Math.sqrt(random()),v=random(),weights=[1-u,u*(1-v),u*v],ids=triangles.slice(a*3,a*3+3);
   for(let k=0;k<3;k++)positions.push(weights.reduce((sum,w,j)=>sum+w*normalized[ids[j]*3+k],0));
   colors.push(...color(weights.reduce((sum,w,j)=>sum+w*lm[ids[j]].x,0),weights.reduce((sum,w,j)=>sum+w*lm[ids[j]].y,0)));
 }
 return {schema:'scalp-reconstruction-v2',representation:'colored_point_cloud',source:'single_image_face',view_count:1,landmark_count:landmarks.length,positions,colors,
   surface_mesh:{positions:normalized,colors:vertexColors,triangles:[...triangles]},
   warnings:['单张照片的三维人脸表面估计；相对深度来自神经网络推断，不是测量扫描。','仅包含人脸和部分额头；不生成头顶、后脑、完整头发或被遮挡头皮。侧面与遮挡区域外观不可靠。','显示点由 468 顶点网格插值采样而来；增加显示点不会增加几何精度。颜色来自原照片，不使用固定头模顶点。']};
}
async function scan(canvas,progress=()=>{},providedDetector=null){
 const active=providedDetector||await initialize(progress);progress('正在识别人脸与估计相对深度……');
 await new Promise(resolve=>setTimeout(resolve,0));
 const result=active.detect(canvas),faces=result.faceLandmarks||[];
 if(!faces.length)throw Error('没有识别到清晰人脸。请用单人、光线均匀、脸部无遮挡的正面照片。');
 if(faces.length!==1)throw Error('照片中有多张人脸，请裁成单人照片后重试。');
 progress('正在生成人脸三角网格并保留照片颜色……');
 const image=canvas.getContext('2d',{willReadFrequently:true}).getImageData(0,0,canvas.width,canvas.height);
 const topology=typeof module!=='undefined'&&module.exports?require('./face-topology.js'):root.FaceTopology;
 return build(faces[0],image,topology);
}
const api={build,scan,initialize,MODEL};if(typeof module!=='undefined'&&module.exports)module.exports=api;else root.PhotoFace=api;
})(globalThis);
