import { supabase, MESES, primerDiaMes } from './supabase.js';

const ADMIN_PASS  = 'cmfjal2024';
const DIA_VENC    = 10;   // vencimiento fijo día 10

// ─── LOGIN ────────────────────────────────────────────────────
const loginPage = document.getElementById('login-page');
const adminPage = document.getElementById('admin-page');

function checkSession() {
  if (sessionStorage.getItem('admin_ok') === '1') showAdmin();
}

document.getElementById('btn-login').addEventListener('click', doLogin);
document.getElementById('inp-pass').addEventListener('keydown', e => { if (e.key === 'Enter') doLogin(); });

function doLogin() {
  if (document.getElementById('inp-pass').value === ADMIN_PASS) {
    sessionStorage.setItem('admin_ok', '1');
    showAdmin();
  } else {
    document.getElementById('msg-login').innerHTML = '<div class="msg msg-error">Contraseña incorrecta.</div>';
  }
}

function showAdmin() {
  loginPage.classList.add('hidden');
  adminPage.classList.remove('hidden');
  poblarFiltroMes();
  showTab('pagos');
}

document.getElementById('btn-logout').addEventListener('click', () => {
  sessionStorage.removeItem('admin_ok');
  location.reload();
});

// ─── TABS ─────────────────────────────────────────────────────
const tabs = { pagos: null, morosos: null, padron: null };

function showTab(name) {
  ['pagos','morosos','padron'].forEach(t => {
    document.getElementById(`tab-${t}`).classList.toggle('hidden', t !== name);
    document.getElementById(`tab-${t}-link`).classList.toggle('active', t !== name ? false : true);
  });
  if (name === 'pagos'   && !tabs.pagos)   { tabs.pagos   = true; cargarTabla(); }
  if (name === 'morosos' && !tabs.morosos) { tabs.morosos = true; cargarMorosos(); }
  if (name === 'padron'  && !tabs.padron)  { tabs.padron  = true; cargarPadron(); }
}

document.getElementById('tab-pagos-link').addEventListener('click',   e => { e.preventDefault(); showTab('pagos');   });
document.getElementById('tab-morosos-link').addEventListener('click', e => { e.preventDefault(); showTab('morosos'); });
document.getElementById('tab-padron-link').addEventListener('click',  e => { e.preventDefault(); showTab('padron');  });

// ─── SELECTOR MES ─────────────────────────────────────────────
function poblarFiltroMes() {
  const sel = document.getElementById('fil-mes');
  sel.innerHTML = '';
  const hoy = new Date();
  for (let i = 0; i < 12; i++) {
    let m = hoy.getMonth() - i, y = hoy.getFullYear();
    if (m < 0) { m += 12; y--; }
    const opt = document.createElement('option');
    opt.value = primerDiaMes(y, m);
    opt.textContent = MESES[m] + ' ' + y;
    if (i === 0) opt.selected = true;
    sel.appendChild(opt);
  }
}

// ─── PAGOS DEL MES ────────────────────────────────────────────
let todosLosAfiliados = [];
let todosPagos = [];

document.getElementById('btn-filtrar').addEventListener('click', cargarTabla);
document.getElementById('fil-mes').addEventListener('change', cargarTabla);

async function cargarTabla() {
  document.getElementById('msg-tabla').innerHTML = '';
  const mes          = document.getElementById('fil-mes').value;
  const filtroEstado = document.getElementById('fil-estado').value;
  const filtroBuscar = document.getElementById('fil-buscar').value.trim().toLowerCase();

  const [{ data: afiliados, error: e1 }, { data: pagos, error: e2 }] = await Promise.all([
    supabase.from('afiliados').select('*').eq('activo', true).order('apellido'),
    supabase.from('pagos').select('*').eq('mes', mes)
  ]);

  if (e1 || e2) { showMsg('msg-tabla', 'Error cargando datos.', 'error'); return; }

  todosLosAfiliados = afiliados || [];
  todosPagos        = pagos || [];

  const filas = buildFilas(todosLosAfiliados, todosPagos, mes);

  const cnt = { pagado:0, reportado:0, pendiente:0, vencido:0 };
  filas.forEach(f => cnt[f.estado] = (cnt[f.estado]||0) + 1);
  document.getElementById('cnt-pagado').textContent    = cnt.pagado;
  document.getElementById('cnt-reportado').textContent = cnt.reportado;
  document.getElementById('cnt-pendiente').textContent = cnt.pendiente;
  document.getElementById('cnt-vencido').textContent   = cnt.vencido;

  let filtradas = filas;
  if (filtroEstado) filtradas = filtradas.filter(f => f.estado === filtroEstado);
  if (filtroBuscar) filtradas = filtradas.filter(f =>
    f.apellido.toLowerCase().includes(filtroBuscar) || f.nombre.toLowerCase().includes(filtroBuscar));

  renderTabla(filtradas, mes);
}

function buildFilas(afiliados, pagos, mes) {
  const hoy = new Date();
  const [mesY, mesM] = mes.split('-').map(Number);
  return afiliados.map(a => {
    const pago   = pagos.find(p => p.afiliado_id === a.id);
    let estado   = 'pendiente';
    if (pago) {
      estado = pago.estado;
    } else {
      const esMesActual  = mesY === hoy.getFullYear() && mesM === hoy.getMonth() + 1;
      const esMesPasado  = mesY < hoy.getFullYear() || (mesY === hoy.getFullYear() && mesM < hoy.getMonth() + 1);
      if (esMesPasado || (esMesActual && hoy.getDate() > DIA_VENC)) estado = 'vencido';
    }
    return { ...a, pago, estado };
  });
}

function renderTabla(filas, mes) {
  const tbody = document.getElementById('tbody-afiliados');
  tbody.innerHTML = '';
  document.getElementById('sin-resultados').classList.toggle('hidden', filas.length > 0);

  filas.forEach(f => {
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td>${esc(f.apellido)}</td>
      <td>${esc(f.nombre)}</td>
      <td>$${Number(f.cuota).toLocaleString('es-AR')}</td>
      <td><span class="badge badge-${f.estado}">${labelEstado(f.estado)}</span></td>
      <td>${f.pago?.referencia ? esc(f.pago.referencia) : '<span style="color:var(--mid)">—</span>'}</td>
      <td class="actions-cell"></td>`;
    const cell = tr.querySelector('.actions-cell');
    if (f.pago?.comprobante_url)
      cell.appendChild(makeBtn('Ver', 'btn-view btn-sm', () => verComprobante(f.pago.comprobante_url)));
    if (f.estado === 'reportado') {
      cell.appendChild(makeBtn('Confirmar', 'btn-confirm btn-sm', () => confirmarPago(f.pago.id)));
      cell.appendChild(makeBtn('Rechazar',  'btn-reject btn-sm',  () => abrirRechazo(f.pago.id)));
    }
    tbody.appendChild(tr);
  });
}

function makeBtn(label, cls, fn) {
  const b = document.createElement('button');
  b.className = 'btn ' + cls;
  b.textContent = label;
  b.addEventListener('click', fn);
  return b;
}

// ─── CONFIRMAR / RECHAZAR ─────────────────────────────────────
async function confirmarPago(pagoId) {
  const { error } = await supabase.from('pagos').update({ estado: 'pagado', motivo_rechazo: null }).eq('id', pagoId);
  if (error) { showMsg('msg-tabla', 'Error: ' + error.message, 'error'); return; }
  showMsg('msg-tabla', 'Pago confirmado.', 'success');
  tabs.morosos = null;   // invalidar caché morosos
  cargarTabla();
}

let pagoIdRechazo = null;
function abrirRechazo(pagoId) {
  pagoIdRechazo = pagoId;
  document.getElementById('inp-motivo').value = '';
  document.getElementById('modal-rechazo').classList.remove('hidden');
}

document.getElementById('btn-cancelar-rechazo').addEventListener('click', () =>
  document.getElementById('modal-rechazo').classList.add('hidden'));

document.getElementById('btn-confirmar-rechazo').addEventListener('click', async () => {
  const motivo = document.getElementById('inp-motivo').value.trim();
  if (!motivo) { alert('Ingrese el motivo del rechazo.'); return; }
  const { error } = await supabase.from('pagos')
    .update({ estado: 'pendiente', motivo_rechazo: motivo }).eq('id', pagoIdRechazo);
  document.getElementById('modal-rechazo').classList.add('hidden');
  if (error) { showMsg('msg-tabla', 'Error: ' + error.message, 'error'); return; }
  showMsg('msg-tabla', 'Comprobante rechazado.', 'info');
  tabs.morosos = null;
  cargarTabla();
});

// ─── VER COMPROBANTE ──────────────────────────────────────────
function verComprobante(url) {
  const cont  = document.getElementById('comprobante-content');
  cont.innerHTML = url.toLowerCase().includes('.pdf')
    ? `<a href="${url}" target="_blank" class="btn btn-view btn-sm">Abrir PDF en nueva pestaña</a>`
    : `<img src="${url}" style="max-width:100%;max-height:420px;border:1px solid var(--rule);" />`;
  document.getElementById('modal-comprobante').classList.remove('hidden');
}

document.getElementById('btn-cerrar-comp').addEventListener('click', () =>
  document.getElementById('modal-comprobante').classList.add('hidden'));

// ─── EXPORTAR CSV (pagos del mes) ─────────────────────────────
document.getElementById('btn-exportar').addEventListener('click', () => {
  const mes    = document.getElementById('fil-mes').value;
  const filas  = buildFilas(todosLosAfiliados, todosPagos, mes).map(f => ({
    Apellido: f.apellido, Nombre: f.nombre, Cuota: f.cuota,
    Estado: f.estado, Referencia: f.pago?.referencia || '',
    'Motivo rechazo': f.pago?.motivo_rechazo || ''
  }));
  descargarCSV(filas, `pagos_${mes}.csv`);
});

// ─── MOROSOS ─────────────────────────────────────────────────
let morososData = [];

document.getElementById('btn-filtrar-morosos').addEventListener('click',  () => renderMorosos());
document.getElementById('btn-exportar-morosos').addEventListener('click', exportarMorosos);

async function cargarMorosos() {
  showMsg('msg-morosos', 'Calculando morosos…', 'info');

  const hoy  = new Date();
  // Generar los últimos 12 meses completos (no incluir el mes actual si no venció)
  const mesesPasados = [];
  for (let i = 1; i <= 12; i++) {
    let m = hoy.getMonth() - i, y = hoy.getFullYear();
    if (m < 0) { m += 12; y--; }
    mesesPasados.push(primerDiaMes(y, m));
  }
  // Incluir mes actual si ya venció el día 10
  if (hoy.getDate() > DIA_VENC) {
    mesesPasados.unshift(primerDiaMes(hoy.getFullYear(), hoy.getMonth()));
  }

  const [{ data: afiliados }, { data: pagos }] = await Promise.all([
    supabase.from('afiliados').select('*').eq('activo', true).order('apellido'),
    supabase.from('pagos').select('afiliado_id, mes, estado')
      .in('mes', mesesPasados)
      .in('estado', ['pagado', 'reportado'])
  ]);

  if (!afiliados) { showMsg('msg-morosos', 'Error cargando datos.', 'error'); return; }

  const pagosOk = new Set((pagos || []).map(p => `${p.afiliado_id}_${p.mes}`));

  morososData = afiliados.map(a => {
    const mesesAdeudados = mesesPasados.filter(mes => !pagosOk.has(`${a.id}_${mes}`));
    return { ...a, mesesAdeudados, deuda: mesesAdeudados.length * Number(a.cuota) };
  }).filter(a => a.mesesAdeudados.length > 0);

  document.getElementById('msg-morosos').innerHTML = '';
  renderMorosos();
}

function renderMorosos() {
  const buscar   = document.getElementById('mor-buscar').value.trim().toLowerCase();
  const minMeses = parseInt(document.getElementById('mor-min-meses').value) || 1;

  let filtrados = morososData.filter(a => a.mesesAdeudados.length >= minMeses);
  if (buscar) filtrados = filtrados.filter(a =>
    a.apellido.toLowerCase().includes(buscar) || a.nombre.toLowerCase().includes(buscar));

  // Ordenar por mayor deuda primero
  filtrados.sort((a, b) => b.mesesAdeudados.length - a.mesesAdeudados.length);

  const tbody = document.getElementById('tbody-morosos');
  tbody.innerHTML = '';
  document.getElementById('sin-morosos').classList.toggle('hidden', filtrados.length > 0);

  filtrados.forEach(a => {
    const detalle = a.mesesAdeudados
      .map(m => { const d = new Date(m + 'T00:00:00'); return MESES[d.getMonth()] + ' ' + d.getFullYear(); })
      .join(', ');
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td>${esc(a.apellido)}</td>
      <td>${esc(a.nombre)}</td>
      <td>$${Number(a.cuota).toLocaleString('es-AR')}</td>
      <td><span style="font-weight:500;color:var(--red)">${a.mesesAdeudados.length}</span></td>
      <td style="font-weight:500;">$${Number(a.deuda).toLocaleString('es-AR')}</td>
      <td style="font-size:.78rem;color:var(--mid);">${esc(detalle)}</td>`;
    tbody.appendChild(tr);
  });
}

function exportarMorosos() {
  const filas = morososData
    .filter(a => a.mesesAdeudados.length >= parseInt(document.getElementById('mor-min-meses').value||1))
    .map(a => ({
      Apellido: a.apellido,
      Nombre:   a.nombre,
      Cuota:    a.cuota,
      'Meses adeudados': a.mesesAdeudados.length,
      'Deuda total':     a.deuda,
      'Detalle meses':   a.mesesAdeudados
        .map(m => { const d = new Date(m+'T00:00:00'); return MESES[d.getMonth()]+' '+d.getFullYear(); })
        .join(' | ')
    }));
  descargarCSV(filas, `morosos_${new Date().toISOString().slice(0,10)}.csv`);
}

// ─── PADRÓN ───────────────────────────────────────────────────
let padronData   = [];
let padronesData = [];

document.getElementById('btn-filtrar-padron').addEventListener('click', renderPadron);
document.getElementById('fil-padron-buscar').addEventListener('keydown', e => { if (e.key === 'Enter') renderPadron(); });

async function cargarPadron() {
  const [{ data: afiliados }, { data: padrones }] = await Promise.all([
    supabase.from('afiliados').select('*, padron:padron_id(id,fecha_carga)').eq('activo', true).order('apellido'),
    supabase.from('padrones').select('*').order('fecha_carga', { ascending: false })
  ]);
  padronData   = afiliados || [];
  padronesData = padrones  || [];
  renderPadronesLista();
  renderPadron();
}

function formatFecha(iso) {
  const d = new Date(iso);
  return d.toLocaleDateString('es-AR', { day:'2-digit', month:'long', year:'numeric', hour:'2-digit', minute:'2-digit' });
}

function renderPadronesLista() {
  const tbody = document.getElementById('tbody-padrones');
  tbody.innerHTML = '';
  document.getElementById('sin-padrones').classList.toggle('hidden', padronesData.length > 0);

  padronesData.forEach(p => {
    const activos = padronData.filter(a => a.padron_id === p.id).length;
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td>${esc(formatFecha(p.fecha_carga))}</td>
      <td>${p.cantidad}</td>
      <td>${activos}</td>
      <td><button class="btn btn-reject btn-sm btn-eliminar-padron" data-id="${p.id}" data-fecha="${esc(formatFecha(p.fecha_carga))}">Eliminar</button></td>`;
    tbody.appendChild(tr);
  });

  tbody.querySelectorAll('.btn-eliminar-padron').forEach(b =>
    b.addEventListener('click', () => eliminarPadron(b.dataset.id, b.dataset.fecha)));
}

async function eliminarPadron(padronId, fechaLabel) {
  const activos = padronData.filter(a => a.padron_id === padronId).length;
  if (!confirm(
    `¿Eliminar el padrón cargado el ${fechaLabel}?\n\n` +
    `Esto dará de baja a los ${activos} afiliados activos de ese padrón.\n` +
    `El historial de pagos de cada uno se conserva.`
  )) return;

  // Dar de baja afiliados de este padrón
  const { error } = await supabase.from('afiliados')
    .update({ activo: false })
    .eq('padron_id', padronId);
  if (error) { showMsg('msg-padrones-lista', 'Error: ' + error.message, 'error'); return; }

  // Eliminar el registro de padrón
  await supabase.from('padrones').delete().eq('id', padronId);

  showMsg('msg-padrones-lista', `Padrón eliminado. ${activos} afiliados dados de baja.`, 'success');
  tabs.morosos = null;
  // Recargar
  padronData   = padronData.filter(a => a.padron_id !== padronId);
  padronesData = padronesData.filter(p => p.id !== padronId);
  renderPadronesLista();
  renderPadron();
}

function renderPadron() {
  const buscar = document.getElementById('fil-padron-buscar').value.trim().toLowerCase();
  let lista = padronData;
  if (buscar) lista = lista.filter(a =>
    a.apellido.toLowerCase().includes(buscar) || a.nombre.toLowerCase().includes(buscar));

  const tbody = document.getElementById('tbody-padron');
  tbody.innerHTML = '';
  document.getElementById('sin-padron').classList.toggle('hidden', lista.length > 0);

  lista.forEach(a => {
    const fechaPadron = a.padron?.fecha_carga
      ? new Date(a.padron.fecha_carga).toLocaleDateString('es-AR', { day:'2-digit', month:'2-digit', year:'numeric' })
      : '—';
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td>${esc(a.apellido)}</td>
      <td>${esc(a.nombre)}</td>
      <td>$${Number(a.cuota).toLocaleString('es-AR')}</td>
      <td style="font-size:.8rem;color:var(--mid);">${fechaPadron}</td>
      <td><button class="btn btn-secondary btn-sm btn-dar-baja" data-id="${a.id}">Dar de baja</button></td>`;
    tbody.appendChild(tr);
  });

  tbody.querySelectorAll('.btn-dar-baja').forEach(b =>
    b.addEventListener('click', () => darDeBaja(b.dataset.id)));
}

async function darDeBaja(id) {
  if (!confirm('¿Dar de baja a este afiliado? Su historial de pagos se conserva.')) return;
  const { error } = await supabase.from('afiliados').update({ activo: false }).eq('id', id);
  if (error) { showMsg('msg-padron-lista', 'Error: ' + error.message, 'error'); return; }
  padronData = padronData.filter(a => a.id !== id);
  renderPadronesLista();
  renderPadron();
  tabs.morosos = null;
}

// ─── IMPORTAR CSV/EXCEL (upsert) ──────────────────────────────
document.getElementById('btn-importar').addEventListener('click', importarPadron);

function normalizeKey(k) {
  return String(k).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g,'').replace(/[^a-z0-9]/g,'');
}

const ALIASES = {
  nombre:   ['nombre','name','firstname','first','prenombre'],
  apellido: ['apellido','lastname','surname','last','family'],
  cuota:    ['cuota','monto','importe','valor','fee','amount','precio','mensualidad','mensual']
};

function levenshtein(a, b) {
  const m = a.length, n = b.length;
  const dp = Array.from({length:m+1},(_,i)=>Array.from({length:n+1},(_,j)=>i||j));
  for (let i=1;i<=m;i++) for (let j=1;j<=n;j++)
    dp[i][j] = a[i-1]===b[j-1] ? dp[i-1][j-1] : 1+Math.min(dp[i-1][j],dp[i][j-1],dp[i-1][j-1]);
  return dp[m][n];
}

function detectarMapping(headers, sampleRows) {
  const mapping = {};
  for (const h of headers) {
    for (const [field, aliases] of Object.entries(ALIASES)) {
      if (mapping[field]) continue;
      const nk = normalizeKey(h);
      if (aliases.some(a => nk===a || nk.includes(a) || a.includes(nk) || levenshtein(nk,a)<=2))
        mapping[field] = h;
    }
  }
  if (!mapping['nombre'] || !mapping['apellido']) {
    for (const h of headers) {
      if (Object.values(mapping).includes(h)) continue;
      const nk = normalizeKey(h);
      if (['nombrecompleto','nombreyapellido','apellidonombre','afiliado','titular','socio'].some(a=>nk.includes(a))) {
        mapping['__fullname'] = h; break;
      }
    }
  }
  if (!mapping['cuota'] && sampleRows.length) {
    for (const h of headers) {
      if (Object.values(mapping).includes(h)) continue;
      const nums = sampleRows.map(r=>parseFloat(String(r[h]||'').replace(/[,$\s]/g,''))).filter(n=>!isNaN(n));
      if (nums.length === sampleRows.length && nums.some(n=>n>31)) { mapping['cuota'] = h; break; }
    }
  }
  return mapping;
}

function aplicarMapping(rows, mapping) {
  return rows.map(r => {
    let nombre = '', apellido = '';
    if (mapping['__fullname']) {
      const full = String(r[mapping['__fullname']]||'').trim();
      if (full.includes(',')) { [apellido, nombre] = full.split(',').map(s=>s.trim()); }
      else { const p=full.split(/\s+/); apellido=p.slice(0,Math.ceil(p.length/2)).join(' '); nombre=p.slice(Math.ceil(p.length/2)).join(' '); }
    } else {
      nombre   = String(r[mapping['nombre']]  ||'').trim();
      apellido = String(r[mapping['apellido']]||'').trim();
    }
    const cuota = parseFloat(String(r[mapping['cuota']]||'0').replace(/[,$\s]/g,'')) || 0;
    return { nombre, apellido, cuota, dia_vencimiento: DIA_VENC, activo: true };
  }).filter(a => a.nombre && a.apellido);
}

async function importarPadron() {
  const file = document.getElementById('inp-csv').files[0];
  if (!file) { showMsg('msg-import','Seleccione un archivo.','error'); return; }
  showMsg('msg-import','Analizando archivo…','info');

  let rows = [];
  const ext = file.name.split('.').pop().toLowerCase();
  try {
    if (ext === 'csv') {
      const text = await file.text();
      const r = Papa.parse(text, { header: true, skipEmptyLines: true });
      rows = r.data;
    } else {
      const buf = await file.arrayBuffer();
      const wb  = XLSX.read(buf, { type:'array' });
      rows = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { defval:'', raw:false });
    }
  } catch(e) { showMsg('msg-import','Error leyendo archivo: '+e.message,'error'); return; }

  if (!rows.length) { showMsg('msg-import','El archivo no tiene datos.','error'); return; }

  const headers = Object.keys(rows[0]);
  const mapping = detectarMapping(headers, rows.slice(0,5));
  const tieneNombres = (mapping['nombre'] && mapping['apellido']) || mapping['__fullname'];
  if (!tieneNombres) {
    showMsg('msg-import',`No se identificaron columnas de nombre/apellido. Columnas: <strong>${headers.join(', ')}</strong>`,'error');
    return;
  }

  const afiliados = aplicarMapping(rows, mapping);
  if (!afiliados.length) { showMsg('msg-import','Sin filas válidas.','error'); return; }

  mostrarPreviewImport(afiliados, mapping, headers);
}

let afiliadosPreview = [];

function mostrarPreviewImport(afiliados, mapping) {
  afiliadosPreview = afiliados;
  const campos = Object.entries(mapping).filter(([k])=>!k.startsWith('__'))
    .map(([f,c])=>`<strong>${f}</strong> → "${c}"`).join(' &nbsp;·&nbsp; ');
  const muestra = afiliados.slice(0,4)
    .map(a=>`<tr><td>${esc(a.apellido)}</td><td>${esc(a.nombre)}</td><td>$${a.cuota}</td></tr>`).join('');

  document.getElementById('msg-import').innerHTML = `
    <div class="msg msg-info" style="margin-bottom:12px;">
      <span style="font-size:.78rem;">Columnas detectadas: ${campos}</span>
    </div>
    <p style="font-size:.82rem;margin-bottom:12px;color:var(--ink-soft);">
      <strong>${afiliados.length}</strong> afiliados. Existentes → se actualiza solo la cuota. Nuevos → se insertan.
    </p>
    <div class="table-wrap" style="margin-bottom:14px;">
      <table style="font-size:.82rem;">
        <thead><tr><th>Apellido</th><th>Nombre</th><th>Cuota</th></tr></thead>
        <tbody>${muestra}</tbody>
      </table>
    </div>
    <div style="display:flex;gap:10px;">
      <button class="btn btn-primary btn-sm" id="btn-confirm-import">Confirmar</button>
      <button class="btn btn-secondary btn-sm" id="btn-cancel-import">Cancelar</button>
    </div>`;

  document.getElementById('btn-confirm-import').addEventListener('click', confirmarImport);
  document.getElementById('btn-cancel-import').addEventListener('click',  () => {
    document.getElementById('msg-import').innerHTML = '';
    afiliadosPreview = [];
  });
}

async function confirmarImport() {
  if (!afiliadosPreview.length) return;

  // 1. Crear registro de padrón
  const { data: padronRec, error: e1 } = await supabase
    .from('padrones')
    .insert({ cantidad: afiliadosPreview.length })
    .select()
    .single();
  if (e1) { showMsg('msg-import','Error creando registro de padrón: '+e1.message,'error'); return; }

  // 2. Upsert afiliados con padron_id del nuevo padrón
  const conPadron = afiliadosPreview.map(a => ({ ...a, padron_id: padronRec.id }));
  const { error: e2 } = await supabase.from('afiliados')
    .upsert(conPadron, { onConflict: 'nombre,apellido', ignoreDuplicates: false });
  if (e2) { showMsg('msg-import','Error: '+e2.message,'error'); return; }

  showMsg('msg-import',`Padrón cargado — ${afiliadosPreview.length} registros procesados.`,'success');
  afiliadosPreview = [];
  tabs.morosos = null;
  tabs.padron  = null;
  cargarPadron();
}

// ─── HELPERS ──────────────────────────────────────────────────
function labelEstado(e) {
  return { pagado:'Pagado', reportado:'Reportado', pendiente:'Pendiente', vencido:'Vencido' }[e] || e;
}

function esc(s) {
  return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
}

function showMsg(id, html, type) {
  document.getElementById(id).innerHTML = `<div class="msg msg-${type}">${html}</div>`;
  if (type !== 'info') setTimeout(()=>{ const el=document.getElementById(id); if(el) el.innerHTML=''; }, 5000);
}

function descargarCSV(filas, nombre) {
  const csv  = Papa.unparse(filas);
  const blob = new Blob(['﻿'+csv], { type:'text/csv;charset=utf-8;' });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href = url; a.download = nombre; a.click();
  URL.revokeObjectURL(url);
}

// ─── INIT ─────────────────────────────────────────────────────
checkSession();
