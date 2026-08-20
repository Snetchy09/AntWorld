const canvas = document.querySelector('#game');
const ctx = canvas.getContext('2d');
const hud = document.querySelector('#hud');
const inspector = document.querySelector('#inspector');

const WORLD = { width: 4200, height: 1800, surfaceBase: 430 };
const state = { run: 1, time: 0, paused: true, speed: 1, mode: null, queen: null, selected: null, keys: new Set(), camera: { x: 0, y: 220, tx: 0, ty: 220 }, last: 0 };
const rand = mulberry32(5489);
const terrain = generateTerrain();
const resources = generateResources();
const predators = generatePredators();
let ants = [];

function mulberry32(seed){ return function(){ let t = seed += 0x6D2B79F5; t = Math.imul(t ^ t >>> 15, t | 1); t ^= t + Math.imul(t ^ t >>> 7, t | 61); return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
function clamp(v,a,b){ return Math.max(a, Math.min(b, v)); }
function lerp(a,b,t){ return a + (b-a)*t; }
function noise(x){ return Math.sin(x*.006)*48 + Math.sin(x*.018+2)*22 + Math.sin(x*.041)*8; }
function surfaceY(x){ return WORLD.surfaceBase + noise(x); }

function generateTerrain(){
  const tunnels = [{x:720,y:520,r:52},{x:850,y:560,r:54},{x:980,y:600,r:58},{x:1130,y:650,r:62},{x:1320,y:690,r:78},{x:1490,y:690,r:78},{x:1670,y:650,r:58},{x:1450,y:810,r:130},{x:1180,y:790,r:62}];
  const rocks = Array.from({length:90},()=>({x:rand()*WORLD.width,y:surfaceY(rand()*WORLD.width)+80+rand()*980,r:12+rand()*46, squish:.45+rand()*.55}));
  const roots = Array.from({length:48},()=>{ const x=rand()*WORLD.width; return {x,y:surfaceY(x),len:140+rand()*360, sway:(rand()-.5)*150, width:1.5+rand()*3}; });
  const speckles = Array.from({length:1300},()=>{ const x=rand()*WORLD.width, y=surfaceY(x)+18+rand()*1260; return {x,y,r:.6+rand()*2.2,c:rand()<.5?'rgba(35,22,14,.18)':'rgba(214,169,103,.16)'}; });
  const plants = Array.from({length:115},()=>{ const x=rand()*WORLD.width; return {x,y:surfaceY(x),h:18+rand()*58, lean:(rand()-.5)*18, flower:rand()<.28}; });
  return { tunnels, rocks, roots, speckles, plants, builds: [], digs: [] };
}
function isTunnel(x,y){ return [...terrain.tunnels,...terrain.digs].some(t=>((x-t.x)**2+(y-t.y)**2)<t.r*t.r); }
function isSoil(x,y){ return y > surfaceY(x)+8 && !isTunnel(x,y); }
function carve(x,y,r){ if (isSoil(x,y)) terrain.digs.push({x,y,r}); }

function randomGenome(parent){
 const base = parent ? {...parent} : {speed:.9+rand()*.6, curiosity:rand(), caution:rand(), social:rand(), dig:.35+rand()*.65, memory:.4+rand()*.6, efficiency:.75+rand()*.5};
 for (const k of Object.keys(base)) base[k]=clamp(base[k]+(rand()-.5)*.14,.05,1.5);
 return base;
}
function createAnt(i, parentGenome, role){ const x=780+rand()*760, y=surfaceY(x)-12; const caste=role || (state.mode==='normal' ? (i<4?'soldier':i<22?'worker':'nurse') : 'evolver'); return {id:`R${state.run}-${i}`,role:caste,x,y,vx:(rand()-.5)*20,vy:0,dir:rand()<.5?-1:1,age:0,energy:70+rand()*30,health:100,action:'explore',genome:randomGenome(parentGenome),memories:[],carry:null,anim:rand()*10,digCooldown:rand()*.5,dead:false,fitness:0}; }
function createPopulation(n, pool){ return Array.from({length:n},(_,i)=>createAnt(i,pool?.[i%pool.length]?.genome)); }
function setMode(mode){ state.mode=mode; state.paused=false; state.time=0; state.run=1; state.queen=mode==='normal'?{x:1450,y:810,health:120,layTimer:0,alive:true}:null; terrain.digs.length=0; terrain.builds.length=0; ants=createPopulation(mode==='normal'?42:34, null); }
function chooseQueenRole(){ const soldiers=ants.filter(a=>!a.dead&&a.role==='soldier').length; const workers=ants.filter(a=>!a.dead&&a.role==='worker').length; return soldiers<workers*.22?'soldier':(rand()<.72?'worker':'nurse'); }
function generateResources(){ return Array.from({length:150},(_,i)=>{ const x=rand()*WORLD.width, toxic=rand()<.12; return {id:i,x,y:surfaceY(x)-5-rand()*18,type:toxic?'toxic berry':(rand()<.55?'seed':'fruit'),energy:toxic?-30:22+rand()*36,size:5+rand()*9,toxic,eaten:false,decay:1}; }); }
function generatePredators(){ return Array.from({length:7},(_,i)=>{ const x=400+rand()*(WORLD.width-800); return {id:i,x,y:surfaceY(x)-18,vx:(rand()<.5?-1:1)*(18+rand()*22),phase:rand()*9}; }); }

function sense(ant){
 const visible = resources.filter(r=>!r.eaten && Math.hypot(r.x-ant.x,r.y-ant.y)<110+ant.genome.memory*70);
 const danger = predators.find(p=>Math.hypot(p.x-ant.x,p.y-ant.y)<170+ant.genome.caution*90);
 const social = ants.filter(a=>!a.dead&&a!==ant&&Math.hypot(a.x-ant.x,a.y-ant.y)<95).length;
 return {visible,danger,social};
}
function decide(ant,s){
 if (ant.dead) return 'dying';
 const rememberedBad = ant.memories.find(m=>m.kind==='harm'&&Math.hypot(m.x-ant.x,m.y-ant.y)<120);
 const hunger = 1-ant.energy/100;
 const nearNest = Math.hypot(ant.x-1450, ant.y-760)<520;
 const utilities = { explore:.25+ant.genome.curiosity*.45, rest:(100-ant.health)/170+(ant.energy<25?.25:0), eat:hunger*.9, flee:(s.danger?.id>=0?1.1+ant.genome.caution:0)+(rememberedBad?.value||0), dig:(isSoil(ant.x,ant.y+24)||nearNest?ant.genome.dig*.55:0), interact:s.social*ant.genome.social*.04 };
 if (s.visible.length) utilities.eat += hunger + .18;
 return Object.entries(utilities).sort((a,b)=>b[1]-a[1])[0][0];
}
function decideNormal(ant,s){
 if (ant.dead) return 'dying';
 const hungry = ant.energy<72;
 const queenDanger = state.queen && s.danger && Math.hypot(s.danger.x-state.queen.x,s.danger.y-state.queen.y)<420;
 if (ant.role==='soldier' && (queenDanger || s.danger)) return 'defend';
 if (hungry && s.visible.length) return 'eat';
 if ((ant.role==='worker'||ant.role==='nurse') && Math.hypot(ant.x-1450, ant.y-740)<620) return 'dig';
 if (ant.role==='nurse' && state.queen) return 'tendQueen';
 return ant.role==='soldier'?'patrol':'forage';
}
function chooseAction(ant,s){ return state.mode==='normal' ? decideNormal(ant,s) : decide(ant,s); }
function steerToward(ant,x,speed){ return Math.sign(x-ant.x)*speed*ant.genome.speed; }

function updateAnt(ant,dt){
 ant.age+=dt; ant.energy-=dt*(.9/ant.genome.efficiency); ant.anim+=dt*(ant.action==='flee'?10:ant.action==='dig'?7:5);
 if(ant.energy<=0||ant.health<=0){ant.dead=true;ant.action='dying';return;}
 const s=sense(ant); ant.action=chooseAction(ant,s); let ax=0;
 if(ant.action==='flee'&&s.danger) ax=Math.sign(ant.x-s.danger.x)*90*ant.genome.speed;
 else if(ant.action==='defend'&&s.danger) ax=steerToward(ant,s.danger.x,95);
 else if(ant.action==='tendQueen'&&state.queen) ax=steerToward(ant,state.queen.x,40);
 else if(ant.action==='forage') ax=ant.dir*(45+ant.genome.curiosity*25);
 else if(ant.action==='patrol'&&state.queen) ax=steerToward(ant,state.queen.x+(Math.sin(ant.age*.7)*220),52);
 else if(ant.action==='eat'&&s.visible.length){ const target=s.visible.sort((a,b)=>Math.hypot(a.x-ant.x,a.y-ant.y)-Math.hypot(b.x-ant.x,b.y-ant.y))[0]; ax=Math.sign(target.x-ant.x)*55*ant.genome.speed; if(Math.hypot(target.x-ant.x,target.y-ant.y)<18){ target.eaten=true; ant.energy=clamp(ant.energy+target.energy,0,125); ant.health+=target.toxic?-24:4; ant.memories.push({kind:target.toxic?'harm':'food',x:target.x,y:target.y,value:target.toxic?.7:.3}); }}
 else if(ant.action==='dig'){ ant.digCooldown-=dt; const nestPull=state.mode==='normal'?Math.sign(1450-ant.x)*12:0; ax=ant.dir*22+nestPull; if(ant.digCooldown<=0){ const digX=ant.x+ant.dir*24, digY=Math.max(ant.y+24,surfaceY(ant.x)+18); carve(digX, digY, 38); terrain.builds.push({x:ant.x-ant.dir*16,y:ant.y+13,r:6+rand()*5,life:1}); ant.digCooldown=state.mode==='normal'?.32:.55; ant.energy-=2.6; }}
 else if(ant.action==='rest') ax*=.2;
 else ax=ant.dir*(25+ant.genome.curiosity*35);
 ant.vx=lerp(ant.vx,ax,dt*2.5); ant.x=clamp(ant.x+ant.vx*dt,25,WORLD.width-25); if(rand()<dt*.18) ant.dir*=-1; if(Math.abs(ant.vx)>3) ant.dir=Math.sign(ant.vx);
 const ground = isTunnel(ant.x,ant.y+14)?ant.y+Math.sin(ant.anim)*.6:surfaceY(ant.x)-12; ant.y=lerp(ant.y,ground,dt*8); ant.fitness=Math.max(ant.fitness,ant.age+ant.energy*.2+ant.memories.length*8);
}
function updatePredators(dt){ predators.forEach(p=>{ const prey=ants.find(a=>!a.dead&&Math.hypot(a.x-p.x,a.y-p.y)<130); p.vx=prey?Math.sign(prey.x-p.x)*70:p.vx; p.x+=p.vx*dt; if(p.x<80||p.x>WORLD.width-80)p.vx*=-1; p.y=surfaceY(p.x)-20; p.phase+=dt; if(prey&&Math.hypot(prey.x-p.x,prey.y-p.y)<20) prey.health-=28*dt; ants.filter(a=>!a.dead&&a.action==='defend'&&Math.hypot(a.x-p.x,a.y-p.y)<24).forEach(()=>p.vx*= -1); }); }
function updateQueen(dt){ if(!state.queen?.alive)return; state.queen.layTimer+=dt; const nurses=ants.filter(a=>!a.dead&&a.role==='nurse'&&Math.hypot(a.x-state.queen.x,a.y-state.queen.y)<170).length; if(nurses && state.queen.layTimer>7){ state.queen.layTimer=0; ants.push(createAnt(ants.length, randomGenome(ants[0]?.genome), chooseQueenRole())); ants.at(-1).x=state.queen.x+(rand()-.5)*80; ants.at(-1).y=state.queen.y-14; } }
function nextRun(){ const survivors=ants.sort((a,b)=>b.fitness-a.fitness).slice(0,10); state.run++; state.time=0; terrain.digs.length=0; terrain.builds.length=0; resources.splice(0,resources.length,...generateResources()); ants=createPopulation(state.mode==='normal'?42:34,survivors.length?survivors:null); if(state.mode==='normal') state.queen={x:1450,y:810,health:120,layTimer:0,alive:true}; state.selected=null; }
function autoAdvanceIfExtinct(){ if (ants.every(a=>a.dead)) nextRun(); }

function resize(){ canvas.width=innerWidth*devicePixelRatio; canvas.height=innerHeight*devicePixelRatio; canvas.style.width=innerWidth+'px'; canvas.style.height=innerHeight+'px'; ctx.setTransform(devicePixelRatio,0,0,devicePixelRatio,0,0); }
addEventListener('resize',resize); resize();
addEventListener('keydown',e=>{ state.keys.add(e.key.toLowerCase()); if(e.key===' ') state.paused=!state.paused; }); addEventListener('keyup',e=>state.keys.delete(e.key.toLowerCase()));
canvas.addEventListener('click',e=>{ const wx=e.clientX+state.camera.x, wy=e.clientY+state.camera.y; state.selected=ants.find(a=>!a.dead&&Math.hypot(a.x-wx,a.y-wy)<26)||null; });
function handleUiAction(e){ const b=e.target.closest('button'); if(!b)return; if(b.dataset.mode) setMode(b.dataset.mode); if(b.dataset.act==='pause' && state.mode) state.paused=!state.paused; if(b.dataset.act==='next' && state.mode) nextRun(); if(b.dataset.speed) state.speed=Number(b.dataset.speed); e.preventDefault(); e.stopPropagation(); }
document.addEventListener('pointerdown',handleUiAction,{capture:true});

function drawSky(){ const g=ctx.createLinearGradient(0,0,0,innerHeight); g.addColorStop(0,'#a8d8ff'); g.addColorStop(.55,'#eaf6ff'); g.addColorStop(1,'#8c6b4d'); ctx.fillStyle=g; ctx.fillRect(0,0,innerWidth,innerHeight); }
function drawTerrain(){ ctx.save(); ctx.translate(-state.camera.x,-state.camera.y); ctx.beginPath(); ctx.moveTo(0,WORLD.height); for(let x=0;x<=WORLD.width;x+=18) ctx.lineTo(x,surfaceY(x)); ctx.lineTo(WORLD.width,WORLD.height); ctx.closePath(); const g=ctx.createLinearGradient(0,380,0,1500); g.addColorStop(0,'#8a5a34'); g.addColorStop(.25,'#6b4328'); g.addColorStop(1,'#3d2a1d'); ctx.fillStyle=g; ctx.fill();
 for(let y=520;y<1500;y+=95){ ctx.strokeStyle=`rgba(255,220,160,.${y%190?10:16})`; ctx.lineWidth=3; ctx.beginPath(); for(let x=0;x<WORLD.width;x+=40) ctx.lineTo(x,y+Math.sin(x*.01+y)*12); ctx.stroke(); }
 terrain.speckles.forEach(d=>{ctx.fillStyle=d.c;ctx.beginPath();ctx.arc(d.x,d.y,d.r,0,7);ctx.fill();});
 terrain.roots.forEach(r=>{ctx.strokeStyle='rgba(74,44,24,.55)';ctx.lineWidth=r.width;ctx.beginPath();ctx.moveTo(r.x,r.y);ctx.bezierCurveTo(r.x+r.sway*.2,r.y+r.len*.3,r.x+r.sway,r.y+r.len*.7,r.x+r.sway*.4,r.y+r.len);ctx.stroke();});
 ctx.globalCompositeOperation='destination-out'; [...terrain.tunnels,...terrain.digs].forEach(t=>{const gr=ctx.createRadialGradient(t.x,t.y,2,t.x,t.y,t.r);gr.addColorStop(0,'rgba(0,0,0,1)');gr.addColorStop(1,'rgba(0,0,0,.78)');ctx.fillStyle=gr;ctx.beginPath();ctx.arc(t.x,t.y,t.r,0,7);ctx.fill();}); ctx.globalCompositeOperation='source-over';
 [...terrain.tunnels,...terrain.digs].forEach(t=>{ctx.strokeStyle='rgba(36,22,13,.45)';ctx.lineWidth=8;ctx.beginPath();ctx.arc(t.x,t.y,t.r,0,7);ctx.stroke();});
 terrain.rocks.forEach(r=>{ctx.fillStyle='#5b5148';ctx.beginPath();ctx.ellipse(r.x,r.y,r.r,r.r*r.squish,.2,0,7);ctx.fill();ctx.fillStyle='rgba(255,255,255,.12)';ctx.beginPath();ctx.ellipse(r.x-r.r*.25,r.y-r.r*.12,r.r*.28,r.r*.1,.2,0,7);ctx.fill();});
 terrain.builds.forEach(b=>{ctx.fillStyle='rgba(79,49,28,.55)';ctx.beginPath();ctx.ellipse(b.x,b.y,b.r*1.5,b.r*.65,0,0,7);ctx.fill();});
 terrain.plants.forEach(p=>{ctx.strokeStyle='#2f7c32';ctx.lineWidth=2;ctx.beginPath();ctx.moveTo(p.x,p.y);ctx.quadraticCurveTo(p.x+p.lean*.35,p.y-p.h*.6,p.x+p.lean,p.y-p.h);ctx.stroke();ctx.fillStyle='#438f3b';ctx.beginPath();ctx.ellipse(p.x+p.lean*.45,p.y-p.h*.45,8,3.5,.5,0,7);ctx.fill();if(p.flower){ctx.fillStyle='#e9c85f';ctx.beginPath();ctx.arc(p.x+p.lean,p.y-p.h,3.5,0,7);ctx.fill();}});
 for(let x=0;x<WORLD.width;x+=36){ const y=surfaceY(x), h=24+Math.sin(x*12.9898)*10; ctx.strokeStyle='#3b7d30'; ctx.lineWidth=2; ctx.beginPath(); ctx.moveTo(x,y); ctx.quadraticCurveTo(x+4,y-h*.7,x+12,y-h); ctx.stroke(); }
 ctx.restore(); }
function drawResource(r){ if(r.eaten)return; ctx.save(); ctx.translate(r.x,r.y); ctx.fillStyle=r.toxic?'#8f45b8':r.type==='seed'?'#d2a64c':'#c94d38'; ctx.beginPath(); ctx.ellipse(0,0,r.size,r.size*.72,0,0,7); ctx.fill(); ctx.restore(); }
function drawAnt(a){ ctx.save(); ctx.translate(a.x,a.y); ctx.scale(a.dir,1); ctx.globalAlpha=a.dead?.35:1; const legPhase=a.anim, ground=14; ctx.strokeStyle='#2b150f'; ctx.lineWidth=2.2; ctx.lineCap='round'; for(let i=0;i<3;i++){ const hip=-10+i*9, foot=hip-5+Math.sin(legPhase+i*2)*5; ctx.beginPath(); ctx.moveTo(hip,2); ctx.quadraticCurveTo(hip-4,8,foot,ground); ctx.stroke(); ctx.beginPath(); ctx.moveTo(hip,-1); ctx.quadraticCurveTo(hip+5,7,foot+8,ground); ctx.stroke(); } ctx.fillStyle='#34150f';ctx.beginPath();ctx.ellipse(-16,0,13,8,0,0,7);ctx.fill(); ctx.fillStyle='#5b291b';ctx.beginPath();ctx.ellipse(0,0,9,6,0,0,7);ctx.fill(); ctx.fillStyle='#421e16'; ctx.beginPath();ctx.ellipse(15,0,10,7,0,0,7);ctx.fill(); ctx.strokeStyle='#24100c'; ctx.beginPath();ctx.moveTo(22,-3);ctx.quadraticCurveTo(32,-16,39,-14);ctx.moveTo(22,3);ctx.quadraticCurveTo(32,16,39,14);ctx.stroke(); ctx.restore(); }
function drawPredator(p){ ctx.save();ctx.translate(p.x,p.y);ctx.scale(Math.sign(p.vx)||1,1);ctx.fillStyle='#2f2926';ctx.beginPath();ctx.ellipse(-4,0,19,12,0,0,7);ctx.fill();ctx.fillStyle='#3d342f';ctx.beginPath();ctx.ellipse(14,-1,10,8,0,0,7);ctx.fill();ctx.strokeStyle='#211';ctx.lineWidth=2;ctx.lineCap='round';for(let i=0;i<4;i++){const hip=-15+i*8;ctx.beginPath();ctx.moveTo(hip,5);ctx.quadraticCurveTo(hip-4,12,hip-10,20);ctx.stroke();ctx.beginPath();ctx.moveTo(hip+2,5);ctx.quadraticCurveTo(hip+7,12,hip+12,20);ctx.stroke();}ctx.restore();}
function drawQueen(){ if(!state.queen?.alive)return; ctx.save(); ctx.translate(state.queen.x,state.queen.y); ctx.fillStyle='#6a2d1e';ctx.beginPath();ctx.ellipse(-18,0,22,13,0,0,7);ctx.fill();ctx.fillStyle='#8a3a25';ctx.beginPath();ctx.ellipse(8,0,14,9,0,0,7);ctx.fill();ctx.strokeStyle='#2b150f';ctx.lineWidth=2;ctx.beginPath();ctx.moveTo(20,-4);ctx.quadraticCurveTo(33,-16,43,-12);ctx.moveTo(20,4);ctx.quadraticCurveTo(33,16,43,12);ctx.stroke();ctx.restore(); }
function draw(){ drawSky(); drawTerrain(); ctx.save(); ctx.translate(-state.camera.x,-state.camera.y); resources.forEach(drawResource); predators.forEach(drawPredator); drawQueen(); ants.forEach(drawAnt); ctx.restore(); }
function updateHud(){ const alive=ants.filter(a=>!a.dead).length; hud.innerHTML=`<div class="stats"><b>${state.mode?`RUN ${state.run}`:'ANT WORLD'}</b><span>MODE ${state.mode||'CHOOSE'}</span><span>POPULATION ${alive}</span><span>QUEEN ${state.queen?.alive?'PROTECTED':state.mode==='normal'?'ABSENT':'EMERGENT'}</span><span>FOOD ${resources.filter(r=>!r.eaten).length}</span><span>TIME ${Math.floor(state.time/60).toString().padStart(2,'0')}:${Math.floor(state.time%60).toString().padStart(2,'0')}</span></div><div class="controls"><button data-act="pause">${state.paused?'▶ Play':'⏸ Pause'}</button><button data-act="next">⏭ Next Run</button>${[1,2,4,8].map(s=>`<button data-speed="${s}" class="${state.speed===s?'on':''}">${s}x</button>`).join('')}</div>${state.mode?'':`<div class="modePicker"><h1>Choose Colony Mode</h1><p>Evolution mode learns from memory and mutation. Normal mode starts with a queen, workers, nurses, soldiers, digging, foraging, and defense instincts.</p><button data-mode="evolution">Evolution Experiment</button><button data-mode="normal">Normal Ant Colony</button></div>`}`; inspector.innerHTML=state.selected?`<h2>Subject ${state.selected.id}</h2><p>${state.selected.role} — ${state.selected.action}</p><dl><dt>Energy</dt><dd>${state.selected.energy.toFixed(0)}</dd><dt>Health</dt><dd>${state.selected.health.toFixed(0)}</dd><dt>Age</dt><dd>${state.selected.age.toFixed(1)}</dd><dt>Genome</dt><dd>${Object.entries(state.selected.genome).map(([k,v])=>`${k}:${v.toFixed(2)}`).join(' ')}</dd><dt>Memories</dt><dd>${state.selected.memories.length}</dd></dl>`:''; }
function tick(t){ const dt=Math.min(.04,(t-state.last)/1000||0); state.last=t; const move=420*dt; if(state.keys.has('arrowleft')||state.keys.has('a'))state.camera.tx-=move; if(state.keys.has('arrowright')||state.keys.has('d'))state.camera.tx+=move; if(state.keys.has('arrowup')||state.keys.has('w'))state.camera.ty-=move; if(state.keys.has('arrowdown')||state.keys.has('s'))state.camera.ty+=move; state.camera.tx=clamp(state.camera.tx,0,WORLD.width-innerWidth); state.camera.ty=clamp(state.camera.ty,0,WORLD.height-innerHeight); state.camera.x=lerp(state.camera.x,state.camera.tx,.08); state.camera.y=lerp(state.camera.y,state.camera.ty,.08); if(state.mode&&!state.paused){ for(let i=0;i<state.speed;i++){ ants.forEach(a=>updateAnt(a,dt)); updatePredators(dt); updateQueen(dt); state.time+=dt; autoAdvanceIfExtinct(); } } draw(); updateHud(); requestAnimationFrame(tick); }
requestAnimationFrame(tick);
export { generateTerrain, randomGenome, createPopulation, sense, decide };
