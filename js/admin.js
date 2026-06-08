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

// ── Parser inteligente de padrón ──────────────────────────────

function normalizeKey(k) {
  return String(k).toLowerCase()
    .normalize('NFD').replace(/[̀-ͯ]/g, '')  // quitar tildes
    .replace(/[^a-z0-9]/g, '');                         // solo alfanumérico
}

// Diccionarios de alias por campo
const ALIASES = {
  nombre:           ['nombre','name','firstname','first','prenombre','names','primer'],
  apellido:         ['apellido','lastname','surname','last','family','segundo','apellidos'],
  cuota:            ['cuota','monto','importe','valor','fee','amount','precio','mensualidad','mensual','pago'],
  dia_vencimiento:  ['diavencimiento','vencimiento','dia','day','diadevencimiento','fechavencimiento',
                     'vence','diadepago','diapago','plazo','limite','vto','vencimientodepago']
};

function scoreKey(key, fieldAliases) {
  const nk = normalizeKey(key);
  for (const alias of fieldAliases) {
    if (nk === alias) return 100;
    if (nk.includes(alias) || alias.includes(nk)) return 70;
    // Levenshtein simple para typos
    if (levenshtein(nk, alias) <= 2) return 50;
  }
  return 0;
}

function levenshtein(a, b) {
  const m = a.length, n = b.length;
  const dp = Array.from({length: m+1}, (_, i) => Array.from({length: n+1}, (_, j) => i||j));
  for (let i=1;i<=m;i++) for (let j=1;j<=n;j++)
    dp[i][j] = a[i-1]===b[j-1] ? dp[i-1][j-1] : 1+Math.min(dp[i-1][j],dp[i][j-1],dp[i-1][j-1]);
  return dp[m][n];
}

function detectarMapping(headers, sampleRows) {
  const mapping = {};

  // 1. Match por nombre de columna
  for (const h of headers) {
    for (const [field, aliases] of Object.entries(ALIASES)) {
      if (mapping[field]) continue;
      if (scoreKey(h, aliases) >= 50) mapping[field] = h;
    }
  }

  // 2. Si faltan campos, detectar por contenido de las celdas
  const missing = Object.keys(ALIASES).filter(f => !mapping[f]);
  if (missing.length && sampleRows.length) {
    for (const h of headers) {
      if (Object.values(mapping).includes(h)) continue;
      const vals = sampleRows.map(r => String(r[h] || '')).filter(Boolean);
      if (!vals.length) continue;

      // ¿Es número con decimales o grande? → cuota
      const nums = vals.map(v => parseFloat(v.replace(/[,$\s]/g,'')));
      const allNum = nums.every(n => !isNaN(n));
      if (allNum && missing.includes('cuota') && nums.some(n => n > 31)) {
        mapping['cuota'] = h; continue;
      }
      // ¿Es entero entre 1 y 31? → dia_vencimiento
      if (allNum && missing.includes('dia_vencimiento') && nums.every(n => n>=1 && n<=31 && Number.isInteger(n))) {
        mapping['dia_vencimiento'] = h; continue;
      }
      // ¿Solo texto, sin números? → nombre o apellido
      const onlyText = vals.every(v => /^[a-záéíóúüñA-ZÁÉÍÓÚÜÑ\s'-]+$/.test(v.trim()));
      if (onlyText) {
        // Heurística: apellidos suelen ir en mayúsculas o primero en la fila
        if (missing.includes('apellido') && !mapping['apellido']) { mapping['apellido'] = h; continue; }
        if (missing.includes('nombre') && !mapping['nombre'])     { mapping['nombre'] = h; continue; }
      }
    }
  }

  // 3. Si nombre y apellido siguen faltando, intentar columna "nombre completo" y dividirla
  if (!mapping['nombre'] || !mapping['apellido']) {
    for (const h of headers) {
      const nk = normalizeKey(h);
      if (['nombrecompleto','nombreyapellido','apellidonombre','apellidoynombre','afiliado','titular','socio'].some(a => nk.includes(a))) {
        mapping['__fullname'] = h;
        break;
      }
    }
  }

  return mapping;
}

function aplicarMapping(rows, mapping) {
  return rows.map(r => {
    let nombre = '', apellido = '';

    if (mapping['__fullname']) {
      const full = String(r[mapping['__fullname']] || '').trim();
      // "Apellido, Nombre" o "Nombre Apellido"
      if (full.includes(',')) {
        const [ap, nom] = full.split(',').map(s => s.trim());
        apellido = ap; nombre = nom;
      } else {
        const parts = full.split(/\s+/);
        apellido = parts.slice(0, Math.ceil(parts.length/2)).join(' ');
        nombre   = parts.slice(Math.ceil(parts.length/2)).join(' ');
      }
    } else {
      nombre   = String(r[mapping['nombre']]   || '').trim();
      apellido = String(r[mapping['apellido']] || '').trim();
    }

    const rawCuota = String(r[mapping['cuota']] || '0').replace(/[,$\s]/g, '');
    const cuota    = parseFloat(rawCuota) || 0;
    const rawDia   = String(r[mapping['dia_vencimiento']] || '10').replace(/[^0-9]/g,'');
    const dia      = Math.min(31, Math.max(1, parseInt(rawDia) || 10));

    return { nombre, apellido, cuota, dia_vencimiento: dia, activo: true };
  }).filter(a => a.nombre && a.apellido);
}

// ── Importar CSV/Excel ────────────────────────────────────────
document.getElementById('btn-importar').addEventListener('click', importarPadron);

async function importarPadron() {
  const file = document.getElementById('inp-csv').files[0];
  if (!file) { showMsg('msg-import', 'Seleccione un archivo CSV o Excel.', 'error'); return; }

  showMsg('msg-import', 'Analizando archivo…', 'info');

  let rows = [];
  const ext = file.name.split('.').pop().toLowerCase();

  try {
    if (ext === 'csv') {
      const text = await file.text();
      // Intentar con y sin encabezados
      const r1 = Papa.parse(text, { header: true,  skipEmptyLines: true });
      const r2 = Papa.parse(text, { header: false, skipEmptyLines: true });
      // Si las keys del primer parse son números, no hay encabezados
      const firstKeys = Object.keys(r1.data[0] || {});
      if (firstKeys.every(k => !isNaN(k))) {
        // Sin encabezados: asignar nombres genéricos
        rows = r2.data.map(arr => {
          const obj = {};
          arr.forEach((v, i) => { obj[`col${i}`] = v; });
          return obj;
        });
      } else {
        rows = r1.data;
      }
    } else {
      const buf = await file.arrayBuffer();
      const wb  = XLSX.read(buf, { type: 'array' });
      const ws  = wb.Sheets[wb.SheetNames[0]];
      // Intentar con encabezados, si falla usar índice
      rows = XLSX.utils.sheet_to_json(ws, { defval: '', raw: false });
      if (!rows.length) {
        const arr = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' });
        rows = arr.slice(1).map(r => {
          const obj = {}; r.forEach((v,i) => { obj[`col${i}`] = v; }); return obj;
        });
      }
    }
  } catch(e) {
    showMsg('msg-import', 'Error leyendo el archivo: ' + e.message, 'error'); return;
  }

  if (!rows.length) { showMsg('msg-import', 'El archivo no contiene datos.', 'error'); return; }

  const headers = Object.keys(rows[0]);
  const sample  = rows.slice(0, 5);
  const mapping = detectarMapping(headers, sample);

  // Verificar que al menos tengamos forma de obtener nombre + apellido
  const tieneNombres = (mapping['nombre'] && mapping['apellido']) || mapping['__fullname'];
  if (!tieneNombres) {
    showMsg('msg-import',
      `No se pudieron identificar las columnas de nombre/apellido. Columnas detectadas: <strong>${headers.join(', ')}</strong>. El sistema buscó variantes en español e inglés. Revisá que el archivo tenga columnas con esos datos.`,
      'error');
    return;
  }

  const afiliados = aplicarMapping(rows, mapping);
  if (!afiliados.length) { showMsg('msg-import', 'No se encontraron filas válidas después de procesar.', 'error'); return; }

  // Mostrar preview antes de insertar
  mostrarPreviewImport(afiliados, mapping, headers);
}

let afiliadosPreview = [];

function mostrarPreviewImport(afiliados, mapping, headers) {
  afiliadosPreview = afiliados;
  const camposDetectados = Object.entries(mapping)
    .filter(([k]) => !k.startsWith('__'))
    .map(([campo, col]) => `<strong>${campo}</strong> → "${col}"`)
    .join(' &nbsp;|&nbsp; ');

  const filasMuestra = afiliados.slice(0, 4).map(a =>
    `<tr><td>${esc(a.apellido)}</td><td>${esc(a.nombre)}</td><td>$${a.cuota}</td><td>${a.dia_vencimiento}</td></tr>`
  ).join('');

  document.getElementById('msg-import').innerHTML = `
    <div class="msg msg-info" style="margin-bottom:12px;">
      <strong>Detección automática de columnas:</strong><br/>
      <span style="font-size:0.82rem;">${camposDetectados}</span>
    </div>
    <div style="margin-bottom:12px;font-size:0.85rem;color:#444;">
      <strong>${afiliados.length}</strong> afiliados detectados. Vista previa de los primeros:
    </div>
    <div class="table-wrap" style="margin-bottom:14px;">
      <table style="font-size:0.82rem;">
        <thead><tr><th>Apellido</th><th>Nombre</th><th>Cuota</th><th>Día venc.</th></tr></thead>
        <tbody>${filasMuestra}</tbody>
      </table>
    </div>
    <div style="display:flex;gap:10px;">
      <button class="btn btn-primary btn-sm" id="btn-confirm-import">Confirmar importación</button>
      <button class="btn btn-secondary btn-sm" id="btn-cancel-import">Cancelar</button>
    </div>
  `;

  document.getElementById('btn-confirm-import').addEventListener('click', confirmarImport);
  document.getElementById('btn-cancel-import').addEventListener('click', () => {
    document.getElementById('msg-import').innerHTML = '';
    afiliadosPreview = [];
  });
}

async function confirmarImport() {
  if (!afiliadosPreview.length) return;
  const { error } = await supabase.from('afiliados').insert(afiliadosPreview);
  if (error) { showMsg('msg-import', 'Error al importar: ' + error.message, 'error'); return; }
  showMsg('msg-import', `Se importaron ${afiliadosPreview.length} afiliados correctamente.`, 'success');
  afiliadosPreview = [];
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
