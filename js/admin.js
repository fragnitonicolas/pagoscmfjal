import { supabase, MESES, primerDiaMes } from './supabase.js';

// ── Contraseña admin (cambiar aquí para modificarla) ──────────
const ADMIN_PASS = 'cmfjal2024';

// ── Login ─────────────────────────────────────────────────────
const loginPage = document.getElementById('login-page');
const adminPage = document.getElementById('admin-page');

function checkSession() {
  if (sessionStorage.getItem('admin_ok') === '1') showAdmin();
}

document.getElementById('btn-login').addEventListener('click', doLogin);
document.getElementById('inp-pass').addEventListener('keydown', e => { if (e.key === 'Enter') doLogin(); });

function doLogin() {
  const val = document.getElementById('inp-pass').value;
  if (val === ADMIN_PASS) {
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
  cargarTabla();
}

document.getElementById('btn-logout').addEventListener('click', () => {
  sessionStorage.removeItem('admin_ok');
  location.reload();
});

// ── Selector mes filtro ───────────────────────────────────────
function poblarFiltroMes() {
  const sel = document.getElementById('fil-mes');
  sel.innerHTML = '';
  const hoy = new Date();
  for (let i = 0; i < 12; i++) {
    let m = hoy.getMonth() - i;
    let y = hoy.getFullYear();
    if (m < 0) { m += 12; y--; }
    const val = primerDiaMes(y, m);
    const opt = document.createElement('option');
    opt.value = val;
    opt.textContent = MESES[m] + ' ' + y;
    if (i === 0) opt.selected = true;
    sel.appendChild(opt);
  }
}

// ── Cargar tabla ──────────────────────────────────────────────
let todosLosAfiliados = [];
let todosPagos = [];

document.getElementById('btn-filtrar').addEventListener('click', cargarTabla);
document.getElementById('fil-mes').addEventListener('change', cargarTabla);

async function cargarTabla() {
  document.getElementById('msg-tabla').innerHTML = '';
  const mes = document.getElementById('fil-mes').value;
  const filtroEstado = document.getElementById('fil-estado').value;
  const filtroBuscar = document.getElementById('fil-buscar').value.trim().toLowerCase();

  const { data: afiliados, error: e1 } = await supabase
    .from('afiliados')
    .select('*')
    .eq('activo', true)
    .order('apellido');

  if (e1) { showMsg('msg-tabla', 'Error cargando afiliados: ' + e1.message, 'error'); return; }

  const { data: pagos, error: e2 } = await supabase
    .from('pagos')
    .select('*')
    .eq('mes', mes);

  if (e2) { showMsg('msg-tabla', 'Error cargando pagos: ' + e2.message, 'error'); return; }

  todosLosAfiliados = afiliados || [];
  todosPagos = pagos || [];

  const hoy = new Date();
  const [mesY, mesM] = mes.split('-').map(Number);

  const filas = todosLosAfiliados.map(a => {
    const pago = todosPagos.find(p => p.afiliado_id === a.id);
    let estado = 'pendiente';
    if (pago) {
      estado = pago.estado;
    } else {
      const esMesActual = (mesY === hoy.getFullYear() && mesM === hoy.getMonth() + 1);
      const esMesPasado = mesY < hoy.getFullYear() || (mesY === hoy.getFullYear() && mesM < hoy.getMonth() + 1);
      if (esMesPasado || (esMesActual && hoy.getDate() > a.dia_vencimiento)) estado = 'vencido';
    }
    return { ...a, pago, estado };
  });

  // Contadores
  const cnt = { pagado: 0, reportado: 0, pendiente: 0, vencido: 0 };
  filas.forEach(f => cnt[f.estado] = (cnt[f.estado] || 0) + 1);
  document.getElementById('cnt-pagado').textContent   = cnt.pagado;
  document.getElementById('cnt-reportado').textContent = cnt.reportado;
  document.getElementById('cnt-pendiente').textContent = cnt.pendiente;
  document.getElementById('cnt-vencido').textContent  = cnt.vencido;

  // Filtros
  let filtradas = filas;
  if (filtroEstado) filtradas = filtradas.filter(f => f.estado === filtroEstado);
  if (filtroBuscar) filtradas = filtradas.filter(f =>
    f.apellido.toLowerCase().includes(filtroBuscar) ||
    f.nombre.toLowerCase().includes(filtroBuscar));

  renderTabla(filtradas, mes);
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
      <td>${f.dia_vencimiento}</td>
      <td><span class="badge badge-${f.estado}">${f.estado.charAt(0).toUpperCase() + f.estado.slice(1)}</span></td>
      <td>${f.pago?.referencia ? esc(f.pago.referencia) : '<span style="color:#aaa">—</span>'}</td>
      <td class="actions-cell"></td>
    `;
    const cell = tr.querySelector('.actions-cell');

    if (f.pago?.comprobante_url) {
      const btnV = makeBtn('Ver', 'btn-view btn-sm', () => verComprobante(f.pago.comprobante_url));
      cell.appendChild(btnV);
    }

    if (f.estado === 'reportado') {
      const btnC = makeBtn('Confirmar', 'btn-confirm btn-sm', () => confirmarPago(f.pago.id, mes));
      const btnR = makeBtn('Rechazar', 'btn-reject btn-sm', () => abrirRechazo(f.pago.id, mes));
      cell.appendChild(btnC);
      cell.appendChild(btnR);
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

// ── Confirmar pago ────────────────────────────────────────────
async function confirmarPago(pagoId, mes) {
  const { error } = await supabase
    .from('pagos')
    .update({ estado: 'pagado', motivo_rechazo: null })
    .eq('id', pagoId);
  if (error) { showMsg('msg-tabla', 'Error: ' + error.message, 'error'); return; }
  showMsg('msg-tabla', 'Pago confirmado correctamente.', 'success');
  cargarTabla();
}

// ── Rechazar pago ─────────────────────────────────────────────
let pagoIdRechazo = null;

function abrirRechazo(pagoId) {
  pagoIdRechazo = pagoId;
  document.getElementById('inp-motivo').value = '';
  document.getElementById('modal-rechazo').classList.remove('hidden');
}

document.getElementById('btn-cancelar-rechazo').addEventListener('click', () => {
  document.getElementById('modal-rechazo').classList.add('hidden');
});

document.getElementById('btn-confirmar-rechazo').addEventListener('click', async () => {
  const motivo = document.getElementById('inp-motivo').value.trim();
  if (!motivo) { alert('Ingrese el motivo del rechazo.'); return; }

  const { error } = await supabase
    .from('pagos')
    .update({ estado: 'pendiente', motivo_rechazo: motivo })
    .eq('id', pagoIdRechazo);

  document.getElementById('modal-rechazo').classList.add('hidden');
  if (error) { showMsg('msg-tabla', 'Error: ' + error.message, 'error'); return; }
  showMsg('msg-tabla', 'Comprobante rechazado. El afiliado deberá volver a reportar el pago.', 'info');
  cargarTabla();
});

// ── Ver comprobante ───────────────────────────────────────────
function verComprobante(url) {
  const cont = document.getElementById('comprobante-content');
  const isPdf = url.toLowerCase().includes('.pdf');
  if (isPdf) {
    cont.innerHTML = `<a href="${url}" target="_blank" class="btn btn-view btn-sm">Abrir PDF en nueva pestaña</a>`;
  } else {
    cont.innerHTML = `<img src="${url}" style="max-width:100%;max-height:420px;border:1px solid #ddd;" />`;
  }
  document.getElementById('modal-comprobante').classList.remove('hidden');
}

document.getElementById('btn-cerrar-comp').addEventListener('click', () => {
  document.getElementById('modal-comprobante').classList.add('hidden');
});

// ── Importar CSV/Excel ────────────────────────────────────────
document.getElementById('btn-importar').addEventListener('click', importarPadron);

async function importarPadron() {
  const file = document.getElementById('inp-csv').files[0];
  if (!file) { showMsg('msg-import', 'Seleccione un archivo CSV o Excel.', 'error'); return; }

  let rows = [];
  const ext = file.name.split('.').pop().toLowerCase();

  if (ext === 'csv') {
    const text = await file.text();
    const result = Papa.parse(text, { header: true, skipEmptyLines: true });
    rows = result.data;
  } else {
    const buf = await file.arrayBuffer();
    const wb = XLSX.read(buf, { type: 'array' });
    const ws = wb.Sheets[wb.SheetNames[0]];
    rows = XLSX.utils.sheet_to_json(ws, { defval: '' });
  }

  if (rows.length === 0) { showMsg('msg-import', 'El archivo no contiene datos.', 'error'); return; }

  // Normalizar claves (minúsculas, sin espacios)
  const normalize = obj => {
    const n = {};
    Object.keys(obj).forEach(k => { n[k.toLowerCase().trim().replace(/\s+/g,'_')] = obj[k]; });
    return n;
  };

  const afiliados = rows.map(r => {
    const n = normalize(r);
    return {
      nombre: String(n.nombre || '').trim(),
      apellido: String(n.apellido || '').trim(),
      cuota: parseFloat(n.cuota) || 0,
      dia_vencimiento: parseInt(n.dia_vencimiento || n.dia || n.vencimiento) || 10,
      activo: true
    };
  }).filter(a => a.nombre && a.apellido);

  if (afiliados.length === 0) {
    showMsg('msg-import', 'No se encontraron filas válidas. Verifique las columnas: nombre, apellido, cuota, dia_vencimiento.', 'error');
    return;
  }

  const { error } = await supabase.from('afiliados').insert(afiliados);
  if (error) { showMsg('msg-import', 'Error al importar: ' + error.message, 'error'); return; }

  showMsg('msg-import', `Se importaron ${afiliados.length} afiliados correctamente.`, 'success');
  cargarTabla();
}

// ── Exportar CSV ──────────────────────────────────────────────
document.getElementById('btn-exportar').addEventListener('click', exportarCSV);

function exportarCSV() {
  const mes = document.getElementById('fil-mes').value;
  const hoy = new Date();
  const [mesY, mesM] = mes.split('-').map(Number);

  const filas = todosLosAfiliados.map(a => {
    const pago = todosPagos.find(p => p.afiliado_id === a.id);
    let estado = 'pendiente';
    if (pago) {
      estado = pago.estado;
    } else {
      const esMesActual = (mesY === hoy.getFullYear() && mesM === hoy.getMonth() + 1);
      const esMesPasado = mesY < hoy.getFullYear() || (mesY === hoy.getFullYear() && mesM < hoy.getMonth() + 1);
      if (esMesPasado || (esMesActual && hoy.getDate() > a.dia_vencimiento)) estado = 'vencido';
    }
    return {
      Apellido: a.apellido,
      Nombre: a.nombre,
      Cuota: a.cuota,
      'Día vencimiento': a.dia_vencimiento,
      Estado: estado,
      Referencia: pago?.referencia || '',
      'Motivo rechazo': pago?.motivo_rechazo || ''
    };
  });

  const csv = Papa.unparse(filas);
  const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `pagos_${mes}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

// ── Helpers ───────────────────────────────────────────────────
function showMsg(id, text, type) {
  document.getElementById(id).innerHTML = `<div class="msg msg-${type}">${text}</div>`;
  setTimeout(() => { const el = document.getElementById(id); if (el) el.innerHTML = ''; }, 5000);
}

function esc(s) {
  return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
}

// ── Init ──────────────────────────────────────────────────────
checkSession();
