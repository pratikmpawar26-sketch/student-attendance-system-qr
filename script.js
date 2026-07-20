// ---------- State ----------
let students = [];   // {id, name, roll, cls}
let attendance = []; // {studentId, name, roll, cls, dateISO, time}
let nextId = 1;
let html5QrCode = null;
let scanning = false;

// ---------- Utilities ----------
function todayISO(){
  return new Date().toISOString().slice(0,10);
}
function showToast(msg){
  const t = document.getElementById('toast');
  t.textContent = msg;
  t.classList.add('show');
  clearTimeout(t._timer);
  t._timer = setTimeout(()=> t.classList.remove('show'), 2200);
}
function fmtDateStamp(){
  const d = new Date();
  return d.toLocaleDateString(undefined, { weekday:'short', year:'numeric', month:'short', day:'numeric' });
}
document.getElementById('todayStamp').textContent = fmtDateStamp();

// ---------- Tabs ----------
document.querySelectorAll('.tab').forEach(tab=>{
  tab.addEventListener('click', ()=>{
    document.querySelectorAll('.tab').forEach(t=>t.classList.remove('active'));
    document.querySelectorAll('.tab-panel').forEach(p=>p.style.display='none');
    tab.classList.add('active');
    document.getElementById('panel-'+tab.dataset.tab).style.display='block';
    if(tab.dataset.tab === 'students') renderStudents();
    if(tab.dataset.tab === 'log') renderLog();
    if(tab.dataset.tab === 'dashboard') renderStats();
    if(tab.dataset.tab !== 'scan' && scanning) stopScanner();
  });
});

// ---------- Add student ----------
function addStudent(name, roll, cls){
  name = (name||'').trim();
  roll = (roll||'').trim();
  cls = (cls||'').trim();
  if(!name || !roll){
    showToast('Name and roll number are required');
    return;
  }
  const dup = students.find(s=> s.roll === roll && s.cls === cls);
  if(dup){
    showToast('A student with that roll number already exists in this class');
    return;
  }
  const id = 'STU-' + String(nextId++).padStart(4,'0');
  students.push({ id, name, roll, cls: cls || '—' });
  showToast(name + ' added to the register');
  renderStudents();
  renderStats();
}

document.getElementById('qa-add').addEventListener('click', ()=>{
  addStudent(
    document.getElementById('qa-name').value,
    document.getElementById('qa-roll').value,
    document.getElementById('qa-class').value
  );
  document.getElementById('qa-name').value = '';
  document.getElementById('qa-roll').value = '';
  document.getElementById('qa-class').value = '';
});

document.getElementById('s-add').addEventListener('click', ()=>{
  addStudent(
    document.getElementById('s-name').value,
    document.getElementById('s-roll').value,
    document.getElementById('s-class').value
  );
  document.getElementById('s-name').value = '';
  document.getElementById('s-roll').value = '';
  document.getElementById('s-class').value = '';
});

function removeStudent(id){
  const s = students.find(x=>x.id===id);
  if(!s) return;
  if(!confirm('Remove ' + s.name + ' from the register? This does not delete their past attendance records.')) return;
  students = students.filter(x=>x.id!==id);
  renderStudents();
  renderStats();
}

// ---------- Render students / QR ----------
function renderStudents(){
  const grid = document.getElementById('studentGrid');
  grid.innerHTML = '';
  if(students.length === 0){
    grid.innerHTML = '<div class="empty" style="grid-column:1/-1;">No students enrolled yet. Add your first student above.</div>';
    return;
  }
  students.forEach(s=>{
    const card = document.createElement('div');
    card.className = 'student-card';
    card.innerHTML = `
      <button class="remove-btn no-print" title="Remove student">✕</button>
      <div class="qr-box" id="qr-${s.id}"></div>
      <div class="s-name">${escapeHtml(s.name)}</div>
      <div class="s-meta">Roll ${escapeHtml(s.roll)} · ${escapeHtml(s.cls)}</div>
      <div class="s-meta">${s.id}</div>
    `;
    card.querySelector('.remove-btn').addEventListener('click', ()=> removeStudent(s.id));
    grid.appendChild(card);

    const qrBox = card.querySelector('.qr-box');
    const img = document.createElement('img');
    img.width = 130;
    img.height = 130;
    img.alt = 'QR code for ' + s.id;
    img.src = 'https://api.qrserver.com/v1/create-qr-code/?size=130x130&data=' + encodeURIComponent(s.id);
    img.onerror = function(){
      qrBox.innerHTML = '<div class="empty" style="padding:20px 8px; font-size:0.7rem;">QR image failed to load — check your internet connection</div>';
    };
    qrBox.appendChild(img);
  });
}

function escapeHtml(str){
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

document.getElementById('printBtn').addEventListener('click', ()=> window.print());

// ---------- Scanning ----------
function markAttendance(studentId){
  const s = students.find(x=>x.id === studentId);
  if(!s){
    addScanRow('Unknown code: ' + studentId, '', '', true, 'Not enrolled');
    return;
  }
  const today = todayISO();
  const already = attendance.find(a=> a.studentId === s.id && a.dateISO === today);
  if(already){
    addScanRow(s.name, s.roll, s.cls, true, 'Already marked');
    showToast(s.name + ' already marked present today');
    return;
  }
  const now = new Date();
  attendance.unshift({
    studentId: s.id,
    name: s.name,
    roll: s.roll,
    cls: s.cls,
    dateISO: today,
    time: now.toLocaleTimeString()
  });
  addScanRow(s.name, s.roll, s.cls, false, 'Marked present');
  showToast(s.name + ' marked present');
  renderStats();
}

function addScanRow(name, roll, cls, isDup, label){
  const feed = document.getElementById('scanFeed');
  const row = document.createElement('div');
  row.className = 'scan-row';
  row.innerHTML = `
    <div>
      <strong>${escapeHtml(name)}</strong>
      <div class="s-meta">${roll ? 'Roll ' + escapeHtml(roll) + ' · ' + escapeHtml(cls) : ''}</div>
    </div>
    <span class="badge ${isDup ? 'dup' : ''}">${label}</span>
  `;
  feed.prepend(row);
}

function startScanner(){
  if(scanning) return;
  html5QrCode = new Html5Qrcode('reader');
  Html5Qrcode.getCameras().then(cams=>{
    if(!cams || !cams.length){
      showToast('No camera found on this device');
      return;
    }
    html5QrCode.start(
      { facingMode: 'environment' },
      { fps: 10, qrbox: 220 },
      (decodedText)=>{ markAttendance(decodedText.trim()); },
      ()=>{ /* ignore per-frame scan errors */ }
    ).then(()=>{ scanning = true; }).catch(err=>{
      showToast('Could not start camera: ' + err);
    });
  }).catch(()=>{
    showToast('Camera access denied or unavailable');
  });
}

function stopScanner(){
  if(html5QrCode && scanning){
    html5QrCode.stop().then(()=>{
      html5QrCode.clear();
      scanning = false;
    }).catch(()=>{ scanning = false; });
  }
}

document.getElementById('scanStart').addEventListener('click', startScanner);
document.getElementById('scanStop').addEventListener('click', stopScanner);

// ---------- Log ----------
function renderLog(){
  const body = document.getElementById('logBody');
  const filterVal = document.getElementById('logFilter').value;
  const rows = filterVal ? attendance.filter(a=>a.dateISO === filterVal) : attendance;
  body.innerHTML = '';
  document.getElementById('logEmpty').style.display = rows.length ? 'none' : 'block';
  rows.forEach(a=>{
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td>${a.dateISO}</td>
      <td>${a.time}</td>
      <td>${escapeHtml(a.name)}</td>
      <td>${escapeHtml(a.roll)}</td>
      <td>${escapeHtml(a.cls)}</td>
    `;
    body.appendChild(tr);
  });
}
document.getElementById('logFilter').addEventListener('change', renderLog);

document.getElementById('exportBtn').addEventListener('click', ()=>{
  if(attendance.length === 0){ showToast('No records to export'); return; }
  let csv = 'Date,Time,Name,Roll No,Class\n';
  attendance.forEach(a=>{
    csv += `${a.dateISO},${a.time},"${a.name}",${a.roll},${a.cls}\n`;
  });
  const blob = new Blob([csv], { type:'text/csv' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = 'attendance-' + todayISO() + '.csv';
  link.click();
  URL.revokeObjectURL(url);
});

// ---------- Stats ----------
function renderStats(){
  const today = todayISO();
  const presentToday = new Set(attendance.filter(a=>a.dateISO===today).map(a=>a.studentId)).size;
  const total = students.length;
  const absent = Math.max(total - presentToday, 0);
  const rate = total ? Math.round((presentToday/total)*100) : 0;
  document.getElementById('statTotal').textContent = total;
  document.getElementById('statPresent').textContent = presentToday;
  document.getElementById('statAbsent').textContent = absent;
  document.getElementById('statRate').textContent = rate + '%';
}

// ---------- Seed a couple of demo students so the app isn't empty on load ----------
addStudent('Aarav Sharma', '01', '10-B');
addStudent('Diya Patel', '02', '10-B');
renderStats();