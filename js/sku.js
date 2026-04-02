// ── İSTİSNA SKU ───────────────────────────────────────────────────────────────
function renderExSkuList(){
  const container=document.getElementById('exSkuList');if(!container)return;
  const entries=Object.entries(exceptionSkus).sort((a,b)=>String(a[0]).localeCompare(String(b[0]),'tr'));
  if(!entries.length){container.innerHTML='<div style="color:var(--muted);font-family:DM Mono,monospace;font-size:12px;">Henüz istisna SKU yok.</div>';return;}
  container.innerHTML=entries.map(([sku,kg])=>`
    <div style="display:flex;justify-content:space-between;align-items:center;padding:6px 10px;border-bottom:1px solid #1f1f1f;font-family:'DM Mono',monospace;font-size:12px;">
      <span style="color:var(--text);">${sku}</span>
      <span style="color:var(--accent);">${parseNum(kg)} kg</span>
      <button onclick="removeExceptionSku('${sku.replace(/'/g,"\\'")}')" style="background:none;border:none;color:var(--error);cursor:pointer;font-size:14px;padding:0 4px;">✕</button>
    </div>`).join('');
}

function addExceptionSku(){
  const sku=document.getElementById('newExSku').value.trim();
  const kg=parseNum(document.getElementById('newExKg').value);
  if(!sku||!kg||kg<=0){alert('SKU ve geçerli bir kilo girin.');return;}
  exceptionSkus[sku]=kg;
  try{localStorage.setItem('exSkus',JSON.stringify(exceptionSkus));}catch(e){}
  document.getElementById('newExSku').value='';
  document.getElementById('newExKg').value='';
  renderExSkuList();
}

function removeExceptionSku(sku){
  if(!confirm(`"${sku}" silinsin mi?`))return;
  delete exceptionSkus[sku];
  try{localStorage.setItem('exSkus',JSON.stringify(exceptionSkus));}catch(e){}
  renderExSkuList();
}