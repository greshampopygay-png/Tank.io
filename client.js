const canvas = document.getElementById("game");
const ctx = canvas.getContext("2d");
const menu = document.getElementById("menu");
const hud = document.getElementById("hud");
const mobile = document.getElementById("mobile");
const statusEl = document.getElementById("status");
const board = document.getElementById("board");
const scoreEl = document.getElementById("score");
const toast = document.getElementById("toast");
const nameInput = document.getElementById("name");

let ws, myId = null, world = {w:2400,h:1400}, state = {players:[],bullets:[]};
let joined = false, camera = {x:0,y:0};
const input = {up:false,down:false,left:false,right:false,fire:false,aim:0};

function resize(){
  const dpr=Math.min(devicePixelRatio||1,2);
  canvas.width=innerWidth*dpr; canvas.height=innerHeight*dpr;
  canvas.style.display = joined ? "block" : "none";
  ctx.setTransform(dpr,0,0,dpr,0,0);
}
addEventListener("resize",resize); resize();

function connect(){
  const proto=location.protocol==="https:"?"wss":"ws";
  ws=new WebSocket(`${proto}://${location.host}`);
  ws.onopen=()=>{statusEl.textContent="Server connected";};
  ws.onclose=()=>{statusEl.textContent="Server disconnected — обновите страницу"; joined=false;};
  ws.onerror=()=>{statusEl.textContent="Connection error";};
  ws.onmessage=e=>{
    const m=JSON.parse(e.data);
    if(m.type==="welcome"){myId=m.id;world=m.world;}
    if(m.type==="state"){state=m;}
    if(m.type==="system"||m.type==="kill") showToast(m.type==="kill"?`${m.killer} уничтожил ${m.victim}`:m.text);
  };
}
connect();

document.getElementById("play").onclick=()=>{
  if(!ws || ws.readyState!==1) return;
  joined=true;
  ws.send(JSON.stringify({type:"join",name:nameInput.value}));
  menu.classList.add("hidden"); hud.classList.remove("hidden");
  if(innerWidth<=700) mobile.classList.remove("hidden");
  resize();
};
document.getElementById("exit").onclick=()=>location.reload();

function showToast(t){
  toast.textContent=t;toast.style.opacity=1;
  clearTimeout(showToast.t);showToast.t=setTimeout(()=>toast.style.opacity=0,1600);
}

addEventListener("keydown",e=>{
  const k=e.key.toLowerCase();
  if(k==="w")input.up=true;if(k==="s")input.down=true;if(k==="a")input.left=true;if(k==="d")input.right=true;
});
addEventListener("keyup",e=>{
  const k=e.key.toLowerCase();
  if(k==="w")input.up=false;if(k==="s")input.down=false;if(k==="a")input.left=false;if(k==="d")input.right=false;
});
canvas.addEventListener("mousemove",e=>{
  if(!joined)return;
  const me=state.players.find(p=>p.id===myId); if(!me)return;
  const s=getScale(), mx=(e.clientX/s)+camera.x, my=(e.clientY/s)+camera.y;
  input.aim=Math.atan2(my-me.y,mx-me.x);
});
canvas.addEventListener("mousedown",()=>input.fire=true);
addEventListener("mouseup",()=>input.fire=false);

function setupJoy(el, kind){
  const knob=el.querySelector(".knob"), max=48;
  let active=false;
  const move=(x,y)=>{
    const r=el.getBoundingClientRect(), cx=r.left+r.width/2, cy=r.top+r.height/2;
    let dx=x-cx,dy=y-cy,l=Math.hypot(dx,dy); if(l>max){dx=dx/l*max;dy=dy/l*max;}
    knob.style.transform=`translate(${dx}px,${dy}px)`;
    if(kind==="move"){input.left=dx<-12;input.right=dx>12;input.up=dy<-12;input.down=dy>12;}
    else { if(l>8) input.aim=Math.atan2(dy,dx); input.fire=l>10; }
  };
  const end=()=>{active=false;knob.style.transform="translate(0,0)";if(kind==="move")input.left=input.right=input.up=input.down=false;else input.fire=false;};
  el.addEventListener("pointerdown",e=>{active=true;el.setPointerCapture(e.pointerId);move(e.clientX,e.clientY);});
  el.addEventListener("pointermove",e=>{if(active)move(e.clientX,e.clientY);});
  el.addEventListener("pointerup",end);el.addEventListener("pointercancel",end);
}
setupJoy(document.getElementById("leftJoy"),"move");
setupJoy(document.getElementById("rightJoy"),"aim");

setInterval(()=>{
  if(ws?.readyState===1 && joined) ws.send(JSON.stringify({type:"input",input}));
},50);

function getScale(){return Math.min(innerWidth/world.w,innerHeight/world.h);}
function draw(){
  requestAnimationFrame(draw);
  if(!joined)return;
  const w=innerWidth,h=innerHeight;
  ctx.clearRect(0,0,w,h);
  const me=state.players.find(p=>p.id===myId);
  const s=getScale();
  if(me){camera.x=clamp(me.x-w/(2*s),0,world.w-w/s);camera.y=clamp(me.y-h/(2*s),0,world.h-h/s);}
  ctx.save();ctx.scale(s,s);ctx.translate(-camera.x,-camera.y);

  ctx.fillStyle="#101512";ctx.fillRect(0,0,world.w,world.h);
  ctx.strokeStyle="#193022";ctx.lineWidth=2;
  for(let x=0;x<world.w;x+=80){ctx.beginPath();ctx.moveTo(x,0);ctx.lineTo(x,world.h);ctx.stroke();}
  for(let y=0;y<world.h;y+=80){ctx.beginPath();ctx.moveTo(0,y);ctx.lineTo(world.w,y);ctx.stroke();}

  // Simple cover blocks
  ctx.fillStyle="#26352c";
  for(let x=240;x<world.w-200;x+=420){for(let y=230;y<world.h-150;y+=420){ctx.fillRect(x,y,130,55);ctx.fillRect(x+35,y-65,55,120);}}

  for(const b of state.bullets){ctx.fillStyle="#ffd76a";ctx.beginPath();ctx.arc(b.x,b.y,7,0,Math.PI*2);ctx.fill();}
  for(const p of state.players)drawTank(p);

  ctx.restore();
  renderBoard();
}
function drawTank(p){
  ctx.save();ctx.translate(p.x,p.y);ctx.rotate(p.angle);
  ctx.fillStyle=p.id===myId?"#43e87c":"#e64f5b";
  ctx.fillRect(-28,-22,56,44);
  ctx.fillStyle="#17201a";ctx.fillRect(-18,-16,36,32);
  ctx.fillStyle=p.id===myId?"#8ff5b1":"#ff9b9b";ctx.fillRect(0,-6,45,12);
  ctx.beginPath();ctx.arc(0,0,15,0,Math.PI*2);ctx.fill();
  ctx.restore();

  ctx.font="bold 14px Arial";ctx.textAlign="center";ctx.fillStyle="#fff";
  ctx.fillText(p.name,p.x,p.y-45);
  ctx.fillStyle="#111";ctx.fillRect(p.x-30,p.y-36,60,6);
  ctx.fillStyle="#43e87c";ctx.fillRect(p.x-30,p.y-36,60*Math.max(0,p.hp)/100,6);
}
function renderBoard(){
  const sorted=[...state.players].sort((a,b)=>b.score-a.score);
  board.innerHTML=sorted.map((p,i)=>`<div class="row ${p.id===myId?"me":""}"><span>${i+1}. ${escapeHtml(p.name)}</span><span class="num">${p.kills} / ${p.deaths}</span></div>`).join("");
  const me=state.players.find(p=>p.id===myId);
  scoreEl.textContent=me?`K ${me.kills} · D ${me.deaths} · ${me.score} pts`:"";
}
function escapeHtml(s){return String(s).replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));}
function clamp(v,a,b){return Math.max(a,Math.min(b,v));}
draw();