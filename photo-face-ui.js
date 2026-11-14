(function(){'use strict';
let selected=null,running=false;
function message(text,bad=false){$('photoFaceStatus').textContent=text;$('photoFaceStatus').classList.toggle('warning',bad)}
async function generate(){
 if(running){message('模型正在加载或生成人脸，请等待当前任务完成。');return}
 if(!selected){message('先选择一张自己的正面照片，选好后会自动生成。',true);return}
 if(busy){message('其他任务正在处理，请稍候再试。',true);return}
 running=true;busy=true;$('photoFaceRun').textContent='正在生成…（点击查看状态）';
 try{await new Promise(resolve=>setTimeout(resolve,20));const result=await PhotoFace.scan(selected,text=>message(text));setGeometry(result);pitch=0;dirty=true;$('serviceBadge').textContent='单图人脸 · 相对深度估计';message('已生成可旋转的人脸表面。拖动查看，再用右侧笔刷圈画。头顶和后脑不在此模型范围内。');status('单图人脸已生成；可圈画额头与脸部。发缝、头顶区域需要完整头部扫描。')}
 catch(error){const text=String(error.message||error);message('没有生成模型：'+(/fetch|import|network/i.test(text)?'自动组件或模型下载失败，请检查网络后点“重新生成”。':text),true)}
 finally{running=false;busy=false;$('photoFaceRun').textContent='重新生成 3D 人脸'}
}
$('photoFaceInput').onchange=async e=>{
 const file=e.target.files[0];if(!file)return;
 if(running||busy){message('当前任务尚未结束，请稍候再选择照片。');e.target.value='';return}
 try{
   if(file.size>20*1024*1024)throw Error('照片不超过 20MB。');
   const image=await createImageBitmap(file,{imageOrientation:'from-image'}),scale=Math.min(1,1400/Math.max(image.width,image.height));
   if(Math.min(image.width,image.height)<100){image.close();throw Error('照片太小，请选择清晰原图。')}
   const next=document.createElement('canvas');next.width=Math.round(image.width*scale);next.height=Math.round(image.height*scale);next.getContext('2d').drawImage(image,0,0,next.width,next.height);image.close();selected=next;
   const preview=$('photoFacePreview');preview.width=next.width;preview.height=next.height;preview.getContext('2d').drawImage(next,0,0);preview.classList.remove('hidden');
   await generate();
 }catch(error){message(error.message,true)}finally{e.target.value=''}
};
$('photoFaceRun').onclick=generate;
$('exportOBJ').onclick=()=>{
 const mesh=geometry&&geometry.surface_mesh;
 if(!mesh){message('先用照片生成三维人脸，才能导出网格。',true);return}
 if(!Array.isArray(mesh.positions)||mesh.positions.length!==1404||!mesh.positions.every(Number.isFinite)||!Array.isArray(mesh.colors)||mesh.colors.length!==1404||!mesh.colors.every(v=>Number.isFinite(v)&&v>=0&&v<=255)||!Array.isArray(mesh.triangles)||mesh.triangles.length%3||!mesh.triangles.every(v=>Number.isInteger(v)&&v>=0&&v<468)){message('人脸网格数据无效，无法导出。',true);return}
 const lines=['# Single-image inferred facial surface; relative scale; not a measured full-head scan'];
 for(let i=0;i<mesh.positions.length;i+=3)lines.push('v '+mesh.positions.slice(i,i+3).join(' ')+' '+mesh.colors.slice(i,i+3).map(v=>(v/255).toFixed(5)).join(' '));
 for(let i=0;i<mesh.triangles.length;i+=3)lines.push('f '+mesh.triangles.slice(i,i+3).map(v=>v+1).join(' '));
 download(new Blob([lines.join('\n')],{type:'text/plain'}),'single-image-face.obj');
};
})();
