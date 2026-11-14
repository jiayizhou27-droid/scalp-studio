(function(){'use strict';
let model=null,image=null,points=[],loading=false;
const photo=$('fsCanvas'),ctx=photo.getContext('2d');
function state(text,bad=false){$('fsStatus').textContent=text;$('fsStatus').classList.toggle('warning',bad);$('fsFit').disabled=loading||!model||!image||points.length!==8}
function draw(){
 ctx.fillStyle='#e8ede1';ctx.fillRect(0,0,photo.width,photo.height);if(image)ctx.drawImage(image,0,0,photo.width,photo.height);
 points.forEach((p,i)=>{const x=p[0]*photo.width,y=p[1]*photo.height;ctx.beginPath();ctx.arc(x,y,5,0,Math.PI*2);ctx.fillStyle='#dbf9a8';ctx.fill();ctx.fillStyle='#17382a';ctx.font='bold 15px sans-serif';ctx.fillText(String(i+1),x+7,y-7)});
 $('fsNext').textContent=!image?'先选择正面照片':points.length<8?'请点击 '+(points.length+1)+'/8：'+FaceScapeLocal.LABELS[points.length]:'八点已完成，可开始拟合';
}
$('fsModel').onchange=async e=>{
 const file=e.target.files[0];if(!file||loading)return;loading=true;model=null;state('正在本机读取模型，请稍候。首次需要联网加载解压组件。');
 try{model=await FaceScapeLocal.load(file,text=>state(text));state('FaceScape 模型已就绪（'+model.count.toLocaleString()+' 个顶点）。选择照片并按顺序标点。')}
 catch(error){state('模型未载入：'+error.message,true)}finally{loading=false;state($('fsStatus').textContent,!model);e.target.value=''}
};
$('fsPhoto').onchange=async e=>{
 const file=e.target.files[0];if(!file||loading)return;
 try{if(file.size>20*1024*1024)throw Error('照片不超过 20MB。');const next=await createImageBitmap(file,{imageOrientation:'from-image'});if(image)image.close();image=next;const scale=Math.min(1,850/Math.max(image.width,image.height));photo.width=Math.round(image.width*scale);photo.height=Math.round(image.height*scale);points=[];draw();state(model?'按提示点击八个位置。':'照片已读取，还需要选择官方模型 NPZ。')}
 catch(error){state(error.message,true)}finally{e.target.value=''}
};
photo.onpointerdown=e=>{if(!image||points.length>=8||loading)return;const rect=photo.getBoundingClientRect();points.push([(e.clientX-rect.left)/rect.width,(e.clientY-rect.top)/rect.height]);draw();state(points.length===8?'标点已完成。点击“拟合并开始纹发设计”。':'请继续按顺序标点。')};
$('fsUndo').onclick=()=>{if(loading)return;points.pop();draw();state('已撤销最后一个标点。')};
$('fsFit').onclick=async()=>{
 if(!model||!image||points.length!==8||busy||loading)return;loading=true;busy=true;state('正在拟合三维身份形状……');
 try{await new Promise(resolve=>setTimeout(resolve,20));const result=FaceScapeLocal.fit(model,points.map(p=>[p[0],p[1]*photo.height/photo.width]));setGeometry(FaceScapeLocal.geometry(model,result));pitch=0;dirty=true;$('serviceBadge').textContent='FaceScape · 非商用拟合';status('已载入 FaceScape 拟合几何。灰色为统一材质，旋转检查后圈画局部区域。');state('拟合完成 · 八点误差约 '+(result.error*100).toFixed(2)+'% 照片宽度。未见部位来自统计模型。')}
 catch(error){state('拟合未完成：'+error.message,true)}finally{loading=false;busy=false;state($('fsStatus').textContent,$('fsStatus').classList.contains('warning'))}
};
draw();
})();
