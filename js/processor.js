// ── FILE ──────────────────────────────────────────────────────────────────────
const dropZone=document.getElementById('dropZone');
dropZone.addEventListener('dragover',e=>{e.preventDefault();dropZone.classList.add('dragover');});
dropZone.addEventListener('dragleave',()=>dropZone.classList.remove('dragover'));
dropZone.addEventListener('drop',e=>{e.preventDefault();dropZone.classList.remove('dragover');if(e.dataTransfer.files[0])handleFile(e.dataTransfer.files[0]);});
function handleFile(file){if(!file)return;originalFileName=file.name.replace(/\.xlsx?$/,'');document.getElementById('fileName').textContent='📄 '+file.name;const r=new FileReader();r.onload=e=>{lastFileData=e.target.result;loadFile(lastFileData);};r.readAsArrayBuffer(file);}
function loadFile(data){
  processedWB=null;workingRows=null;masterRows=null;
  document.getElementById('statusBox').className='status-box';
  document.getElementById('downloadBtn').classList.remove('visible');
  document.getElementById('kgSection').style.display='none';
  document.getElementById('adjustSection').style.display='none';
  document.getElementById('adjustResult').style.display='none';
  try{
    const wb=XLSX.read(data,{type:'array'});
    const rows=XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]],{defval:''});
    if(!rows.length)throw new Error('Dosya boş.');
    const keys=Object.keys(rows[0]);
    if(keys.includes('BRÜT')||keys.includes('NET'))throw new Error('Eski format (BRÜT/NET var). Revize master kullanın.');
    if(!keys.includes('Ürün Ağırlığı (KG)')||!keys.includes('ÜRÜN ARA GRUBU'))throw new Error('Ürün Ağırlığı (KG) veya ÜRÜN ARA GRUBU sütunu bulunamadı.');
    masterRows=rows;
    showStatus('success',`<div class="stat">✓ Dosya yüklendi: <span>${rows.length.toLocaleString('tr')} satır</span></div><div class="stat">Kilo hesaplaması için tabloyu doldurun, ardından ülke seçip indirin.</div>`);
    buildKgTable(rows);
    document.getElementById('kgSection').style.display='block';
  }catch(err){showStatus('error','⚠ '+err.message);}
}

// ── KG TABLE ──────────────────────────────────────────────────────────────────
function buildKgTable(rows){
  const groups=[...new Set(rows.map(r=>String(r['ÜRÜN ARA GRUBU'])).filter(g=>g&&g!==''))].sort();
  const tbody=document.getElementById('kgTable');
  while(tbody.rows.length>1)tbody.deleteRow(1);
  const needsInput=[],alreadyFull=[];
  groups.forEach(g=>{
    const zeroCount=rows.filter(r=>String(r['ÜRÜN ARA GRUBU'])===g&&parseNum(r['Ürün Ağırlığı (KG)'])===0).length;
    if(zeroCount>0)needsInput.push({g,zeroCount});else alreadyFull.push(g);
  });
  const kgBody=document.getElementById('kgTableBody'),kgArrow=document.getElementById('kgTableArrow');
  if(needsInput.length>0){kgBody.style.display='block';kgArrow.textContent='▲';}
  else{kgBody.style.display='none';kgArrow.textContent='▼';}
  if(needsInput.length===0){const tr=tbody.insertRow();tr.innerHTML='<td colspan="3" style="color:var(--accent);padding:12px;">✓ Tüm satırlarda kilo değeri dolu.</td>';}
  else{needsInput.forEach(({g,zeroCount})=>{const id='gw_'+g.replace(/[^a-zA-Z0-9]/g,'_');const saved=groupWeights[g]!==undefined?groupWeights[g]:'';const tr=tbody.insertRow();tr.innerHTML=`<td style="color:var(--text);">${g}</td><td><input class="kg-input" id="${id}" type="text" inputmode="decimal" value="${saved}" placeholder="kg"></td><td style="color:#ff9d72;">${zeroCount} satır</td>`;});}
  const savedSection=document.getElementById('savedKgSection'),savedTable=document.getElementById('savedKgTable');
  savedTable.innerHTML='';
  if(alreadyFull.length>0){
    savedSection.style.display='block';
    alreadyFull.forEach(g=>{const saved=groupWeights[g]!==undefined?groupWeights[g]:'—';const div=document.createElement('div');div.style.cssText='display:flex;justify-content:space-between;padding:6px 10px;border-bottom:1px solid #1f1f1f;font-family:"DM Mono",monospace;font-size:12px;';div.innerHTML=`<span style="color:var(--text);">${g}</span><span style="color:var(--muted);">AG dolu &nbsp;|&nbsp; kayıtlı: <span style="color:var(--accent);">${saved} kg</span></span>`;savedTable.appendChild(div);});
  }else{savedSection.style.display='none';}
}

// ── APPLY GROUP WEIGHTS ───────────────────────────────────────────────────────
function applyGroupWeights(){
  if(!masterRows)return;
  const groups=[...new Set(masterRows.map(r=>String(r['ÜRÜN ARA GRUBU'])).filter(g=>g&&g!==''))];
  groups.forEach(g=>{const id='gw_'+g.replace(/[^a-zA-Z0-9]/g,'_');const el=document.getElementById(id);if(el&&el.value!=='')groupWeights[g]=parseNum(el.value);});
  workingRows=masterRows.map(row=>{
    const r={...row};const sku=String(r['SKU']);let kg;
    if(sku in exceptionSkus){kg=parseNum(exceptionSkus[sku]);}
    else{kg=parseNum(r['Ürün Ağırlığı (KG)']);if(kg===0)kg=parseNum(groupWeights[String(r['ÜRÜN ARA GRUBU'])]||0);}
    const miktar=parseNum(r['Miktar']);
    r['_kg']=kg;r['_hamBrut']=kg*miktar;r['BRÜT']=r['_hamBrut'];r['NET']=r['BRÜT']*0.9;
    return r;
  });
  const totalBrut=workingRows.reduce((s,r)=>s+parseNum(r['BRÜT']),0);
  document.getElementById('calcTotal').textContent=round2(totalBrut);
  document.getElementById('adjustSection').style.display='block';
  document.getElementById('adjustResult').style.display='none';
  buildAndDownloadReady();
}

// ── WEIGHT ADJUSTMENT ─────────────────────────────────────────────────────────
function applyWeightAdjust(){
  if(!workingRows)return;
  const target=parseNum(document.getElementById('targetWeight').value);
  if(!target||target<=0){alert('Lütfen geçerli bir hedef kilo girin.');return;}
  const hamTotal=workingRows.reduce((s,r)=>s+parseNum(r['_hamBrut']),0);
  if(hamTotal<=0){alert('Ham BRÜT hesaplanamadı.');return;}
  const multiplier=target/hamTotal;
  workingRows=workingRows.map(row=>{const r={...row};r['BRÜT']=parseNum(r['_hamBrut'])*multiplier;r['NET']=r['BRÜT']*0.9;return r;});
  const finalBrut=workingRows.reduce((s,r)=>s+parseNum(r['BRÜT']),0);
  const finalNet=workingRows.reduce((s,r)=>s+parseNum(r['NET']),0);
  const res=document.getElementById('adjustResult');res.style.display='block';
  res.innerHTML=`✓ Orantılı ölçekleme &nbsp;|&nbsp; BRÜT: ${round2(finalBrut)} kg &nbsp;|&nbsp; NET: ${round2(finalNet)} kg`;
  buildAndDownloadReady();
}

// ── BUILD OUTPUT ──────────────────────────────────────────────────────────────
function buildAndDownloadReady(){
  if(!workingRows)return;
  if(currentCountry==='be'&&!getEurRate()){showStatus('error','⚠ Belçika için Euro kuru girin.');document.getElementById('downloadBtn').classList.remove('visible');return;}
  buildOutput(workingRows);
}
function buildOutput(rows){
  try{
    if(currentCountry==='kz')buildKZ(rows);
    else if(currentCountry==='rs')buildRS(rows);
    else if(SIMPLE_MAPS[currentCountry])buildSimple(rows,SIMPLE_MAPS[currentCountry]);
    else{showStatus('error','⚠ Bu ülke için sütun tanımı henüz eklenmemiş.');document.getElementById('downloadBtn').classList.remove('visible');}
  }catch(err){showStatus('error','⚠ '+err.message);document.getElementById('downloadBtn').classList.remove('visible');}
}
function getEurRate(){const el=document.getElementById('eurRateInput');const v=el?parseNum(el.value):0;return(v&&v>0)?v:null;}
function getVal(row,src){
  if(src==='__CALC__')return round2(parseNum(row['Miktar'])*parseNum(row['Fiyat']));
  if(src==='Birim Cinsi (1)'){const v=row[src]!==undefined?row[src]:'';return String(v).trim()==='AD'?'PCS':v;}
  if(src==='__EUR__'){const rate=getEurRate();if(!rate)return '';return parseNum(row['Fiyat'])/rate;}
  if(src==='__EUR_TOTAL__'){const rate=getEurRate();if(!rate)return '';return(parseNum(row['Fiyat'])/rate)*parseNum(row['Miktar']);}
  return row[src]!==undefined?row[src]:'';
}
function makeWS(result,headers){const ws=XLSX.utils.json_to_sheet(result,{header:headers});ws['!cols']=headers.map(c=>({wch:Math.min(Math.max(c.length+4,14),35)}));return ws;}

function buildKZ(rows){
  const before=rows.length;let result;
  if(currentMode==='grouped'){
    const grouped={},order=[];
    for(const row of rows){const sku=row['SKU'];if(!grouped[sku]){grouped[sku]={...row};order.push(sku);}else{grouped[sku]['Miktar']=parseNum(grouped[sku]['Miktar'])+parseNum(row['Miktar']);grouped[sku]['BRÜT']=parseNum(grouped[sku]['BRÜT'])+parseNum(row['BRÜT']);grouped[sku]['NET']=parseNum(grouped[sku]['NET'])+parseNum(row['NET']);}}
    result=order.map(sku=>{const r={};KZ_COLS.forEach(c=>r[c]=grouped[sku][c]??'');return r;});
  }else{result=rows.map(row=>{const r={};KZ_COLS.forEach(c=>r[c]=row[c]??'');return r;});}
  processedWB=XLSX.utils.book_new();XLSX.utils.book_append_sheet(processedWB,makeWS(result,KZ_COLS),'Sheet');
  showStatus('success',currentMode==='grouped'?`<div class="stat">✓ Kazakistan — Gruplandırma tamamlandı</div><div class="stat">Orijinal: <span>${before.toLocaleString('tr')} satır</span> → Sonuç: <span>${result.length.toLocaleString('tr')} satır</span></div>`:`<div class="stat">✓ Kazakistan — Tüm satırlar: <span>${result.length.toLocaleString('tr')} satır</span></div>`);
  document.getElementById('downloadBtn').classList.add('visible');
}
function buildRS(rows){
  const invResult=rows.map(row=>{const r={};RS_INV.forEach(m=>r[m.out]=getVal(row,m.src));return r;});
  const invH=RS_INV.map(m=>m.out);
  processedWB=XLSX.utils.book_new();XLSX.utils.book_append_sheet(processedWB,makeWS(invResult,invH),'INV');
  showStatus('success',`<div class="stat">✓ Sırbistan — INV</div><div class="stat">Toplam: <span>${invResult.length.toLocaleString('tr')} satır · ${invH.length} sütun</span></div>`);
  document.getElementById('downloadBtn').classList.add('visible');
}
function buildSimple(rows,colMap){
  const headers=colMap.map(m=>m.out);
  const result=rows.map(row=>{const r={};colMap.forEach(m=>r[m.out]=getVal(row,m.src));return r;});
  processedWB=XLSX.utils.book_new();XLSX.utils.book_append_sheet(processedWB,makeWS(result,headers),'Sheet');
  const label=COUNTRIES[currentCountry]?.label||currentCountry;
  showStatus('success',`<div class="stat">✓ ${label} — Tamamlandı</div><div class="stat">Toplam: <span>${result.length.toLocaleString('tr')} satır · ${headers.length} sütun</span></div>`);
  document.getElementById('downloadBtn').classList.add('visible');
}