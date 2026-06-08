import { supabase, MESES, primerDiaMes } from './supabase.js';

const DIA_VENC = 10;

let afiliadoSel = null;

// ── Autocomplete ──────────────────────────────────────────────
const inpBuscar = document.getElementById('inp-buscar');
const acList    = document.getElementById('autocomplete-list');

inpBuscar.addEventListener('input', async () => {
  const q = inpBuscar.value.trim();
  if (q.length < 2) { acList.classList.add('hidden'); return; }

  const { data } = await supabase
    .from('afiliados')
    .select('id, nombre, apellido, cuota, dia_vencimiento')
    .or(`nombre.ilike.%${q}%,apellido.ilike.%${q}%`)
    .eq('activo', true)
    .limit(10);

  acList.innerHTML = '';
  if (!data || data.length === 0) { acList.classList.add('hidden'); return; }

  data.forEach(a => {
    const li = document.createElement('li');
    li.textContent = `${a.apellido}, ${a.nombre}`;
    li.addEventListener('click', () => seleccionarAfiliado(a));
    acList.appendChild(li);
  });
  acList.classList.remove('hidden');
});

document.addEventListener('click', e => {
  if (!e.target.closest('.autocomplete-wrap')) acList.classList.add('hidden');
});

function seleccionarAfiliado(a) {
  afiliadoSel = a;
  inpBuscar.value = `${a.apellido}, ${a.nombre}`;
  acList.classList.add('hidden');

  document.getElementById('afiliado-seleccionado').classList.remove('hidden');
  document.getElementById('afiliado-info').textContent =
    `Afiliado: ${a.apellido}, ${a.nombre} — Cuota: $${Number(a.cuota).toLocaleString('es-AR')} — Vencimiento: día ${DIA_VENC}`;

  document.getElementById('step-pago').classList.remove('hidden');
  poblarMeses();
  cargarEstado();
}

// ── Selector de meses ─────────────────────────────────────────
function poblarMeses() {
  const sel = document.getElementById('sel-mes');
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

document.getElementById('sel-mes').addEventListener('change', cargarEstado);

async function cargarEstado() {
  if (!afiliadoSel) return;
  const mes = document.getElementById('sel-mes').value;
  const { data } = await supabase
    .from('pagos')
    .select('estado')
    .eq('afiliado_id', afiliadoSel.id)
    .eq('mes', mes)
    .maybeSingle();

  const hoy = new Date();
  let estado = 'pendiente';
  if (data) {
    estado = data.estado;
  } else {
    const [y, m] = mes.split('-').map(Number);
    const esMesActual = (y === hoy.getFullYear() && m === hoy.getMonth() + 1);
    if (!esMesActual || hoy.getDate() > DIA_VENC) estado = 'vencido';
  }

  const el = document.getElementById('estado-actual');
  el.innerHTML = `<span class="badge badge-${estado}">${estado.charAt(0).toUpperCase() + estado.slice(1)}</span>`;

  const grupoCom = document.getElementById('grupo-comprobante');
  const btnEnviar = document.getElementById('btn-enviar');
  if (estado === 'pagado') {
    grupoCom.classList.add('hidden');
    btnEnviar.disabled = true;
    btnEnviar.textContent = 'Pago ya confirmado';
  } else {
    grupoCom.classList.remove('hidden');
    btnEnviar.disabled = false;
    btnEnviar.textContent = 'Enviar comprobante';
  }
}

// ── Upload área ───────────────────────────────────────────────
const uploadArea = document.getElementById('upload-area');
const inpArchivo = document.getElementById('inp-archivo');

uploadArea.addEventListener('click', () => inpArchivo.click());

uploadArea.addEventListener('dragover', e => { e.preventDefault(); uploadArea.style.borderColor = '#111'; });
uploadArea.addEventListener('dragleave', () => { uploadArea.style.borderColor = ''; });
uploadArea.addEventListener('drop', e => {
  e.preventDefault();
  uploadArea.style.borderColor = '';
  if (e.dataTransfer.files[0]) setArchivo(e.dataTransfer.files[0]);
});

inpArchivo.addEventListener('change', () => {
  if (inpArchivo.files[0]) setArchivo(inpArchivo.files[0]);
});

let archivoSel = null;

function setArchivo(f) {
  if (f.size > 5 * 1024 * 1024) {
    showMsg('msg-pago', 'El archivo supera el límite de 5 MB.', 'error');
    return;
  }
  archivoSel = f;
  document.getElementById('archivo-nombre').textContent = `Archivo seleccionado: ${f.name}`;
}

// ── Enviar ────────────────────────────────────────────────────
document.getElementById('btn-enviar').addEventListener('click', enviarComprobante);

async function enviarComprobante() {
  if (!afiliadoSel) return;
  if (!archivoSel) { showMsg('msg-pago', 'Debe seleccionar un archivo.', 'error'); return; }

  const btn = document.getElementById('btn-enviar');
  btn.disabled = true;
  btn.textContent = 'Enviando…';

  const mes = document.getElementById('sel-mes').value;
  const ref = document.getElementById('inp-ref').value.trim();
  const ext = archivoSel.name.split('.').pop();
  const path = `${afiliadoSel.id}/${mes}.${ext}`;

  const { error: upErr } = await supabase.storage
    .from('comprobantes')
    .upload(path, archivoSel, { upsert: true });

  if (upErr) {
    showMsg('msg-pago', 'Error al subir el archivo: ' + upErr.message, 'error');
    btn.disabled = false; btn.textContent = 'Enviar comprobante';
    return;
  }

  const { data: urlData } = supabase.storage.from('comprobantes').getPublicUrl(path);
  const url = urlData.publicUrl;

  const { error: dbErr } = await supabase.from('pagos').upsert({
    afiliado_id: afiliadoSel.id,
    mes,
    estado: 'reportado',
    comprobante_url: url,
    referencia: ref || null,
    motivo_rechazo: null,
    updated_at: new Date().toISOString()
  }, { onConflict: 'afiliado_id,mes' });

  if (dbErr) {
    showMsg('msg-pago', 'Error al registrar el pago: ' + dbErr.message, 'error');
    btn.disabled = false; btn.textContent = 'Enviar comprobante';
    return;
  }

  document.getElementById('step-pago').classList.add('hidden');
  document.getElementById('step-ok').classList.remove('hidden');
}

// ── Cancelar / nuevo ──────────────────────────────────────────
document.getElementById('btn-cancelar').addEventListener('click', resetForm);
document.getElementById('btn-nuevo').addEventListener('click', resetForm);

function resetForm() {
  afiliadoSel = null;
  archivoSel  = null;
  inpBuscar.value = '';
  document.getElementById('inp-ref').value = '';
  document.getElementById('archivo-nombre').textContent = '';
  document.getElementById('afiliado-seleccionado').classList.add('hidden');
  document.getElementById('step-pago').classList.add('hidden');
  document.getElementById('step-ok').classList.add('hidden');
  document.getElementById('msg-pago').innerHTML = '';
  document.getElementById('msg-buscar').innerHTML = '';
}

// ── Helpers ───────────────────────────────────────────────────
function showMsg(id, text, type) {
  document.getElementById(id).innerHTML = `<div class="msg msg-${type}">${text}</div>`;
}
