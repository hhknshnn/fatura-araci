// ── STATE ─────────────────────────────────────────────────────────────────────
let currentCountry='kz',currentMode='grouped',lastFileData=null,originalFileName='';
let processedWB=null,masterRows=null,workingRows=null;
let groupWeights={},exceptionSkus={};

// ── CONFIG ────────────────────────────────────────────────────────────────────
async function loadSharedConfig() {
  try {
    const res=await fetch('./config.json',{cache:'no-store'});
    if(!res.ok)throw new Error();
    const cfg=await res.json();
    if(cfg.defaultGroupWeights)groupWeights={...cfg.defaultGroupWeights};
    if(cfg.defaultExceptionSkus)exceptionSkus={...cfg.defaultExceptionSkus};
  } catch(e){console.warn('config.json yüklenemedi');}
}

// ── NUMBER PARSING ────────────────────────────────────────────────────────────
function parseNum(v){
  if(v===null||v===undefined)return 0;
  if(typeof v==='number')return Number.isFinite(v)?v:0;
  let s=String(v).trim().replace(/\s|\u00A0/g,'').replace(/[^0-9,.\-]/g,'');
  if(s.includes('.')&&s.includes(','))s=s.replace(/\./g,'').replace(',','.');
  else if(s.includes(','))s=s.replace(',','.');
  const n=Number(s);return Number.isFinite(n)?n:0;
}
function round2(n){return Math.round(parseNum(n)*100)/100;}

// ── UI ────────────────────────────────────────────────────────────────────────
function setCountry(c){
  currentCountry=c;
  ['kz','rs','iq','ge','cy','ru','ba','be'].forEach(k=>{const el=document.getElementById('country-'+k);if(el)el.classList.toggle('active',k===c);});
  document.getElementById('modeSection').style.display=c==='kz'?'block':'none';
  document.getElementById('eurSection').style.display=c==='be'?'block':'none';
  if(workingRows)buildAndDownloadReady();
}
function setMode(m){
  currentMode=m;
  document.getElementById('modeGrouped').classList.toggle('active',m==='grouped');
  document.getElementById('modeRaw').classList.toggle('active',m==='raw');
  if(workingRows)buildAndDownloadReady();
}
function showStatus(type,html){const sb=document.getElementById('statusBox');sb.className='status-box visible '+type;sb.innerHTML=html;}
function toggleKgTable(){const b=document.getElementById('kgTableBody'),a=document.getElementById('kgTableArrow');if(b.style.display==='none'){b.style.display='block';a.textContent='▲';}else{b.style.display='none';a.textContent='▼';}}
function toggleSavedKg(){const b=document.getElementById('savedKgBody'),a=document.getElementById('savedKgArrow');if(b.style.display==='none'){b.style.display='block';a.textContent='▲';}else{b.style.display='none';a.textContent='▼';}}
function toggleExSku(){const b=document.getElementById('exSkuBody'),a=document.getElementById('exSkuArrow');if(b.style.display==='none'){b.style.display='block';a.textContent='▲';}else{b.style.display='none';a.textContent='▼';}}
function onEurRateChanged(){if(currentCountry==='be'&&workingRows)buildAndDownloadReady();}

// ── DOWNLOAD ──────────────────────────────────────────────────────────────────
function downloadResult(){
  if(!processedWB)return;
  if(currentCountry==='be'&&!getEurRate()){showStatus('error','⚠ Belçika için Euro kuru girin.');return;}
  let suffix=COUNTRIES[currentCountry]?.suffix||('_'+currentCountry);
  if(currentCountry==='kz')suffix+=(currentMode==='grouped'?'_gruplu':'_tum');
  XLSX.writeFile(processedWB,originalFileName+suffix+'.xlsx');
}

// ── INIT ──────────────────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded',async()=>{
  await loadSharedConfig();
  // localStorage'dan istisna SKU'ları yükle (config.json'ı override etme, üstüne ekle)
  try{const s=localStorage.getItem('exSkus');if(s){const local=JSON.parse(s);exceptionSkus={...exceptionSkus,...local};}}catch(e){}
  try{const s=localStorage.getItem('gwData');if(s){const local=JSON.parse(s);groupWeights={...groupWeights,...local};}}catch(e){}
  renderExSkuList();
});