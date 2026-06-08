import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

export const SUPABASE_URL = 'https://euakgozmzvjvxzrssofe.supabase.co';
export const SUPABASE_KEY = 'sb_publishable_alC4imGToHEbhfSRpOWO3g_zvULEgSe';

export const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

export const MESES = [
  'Enero','Febrero','Marzo','Abril','Mayo','Junio',
  'Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'
];

export function mesLabel(dateStr) {
  const d = new Date(dateStr + 'T00:00:00');
  return MESES[d.getMonth()] + ' ' + d.getFullYear();
}

export function primerDiaMes(year, month) {
  return `${year}-${String(month + 1).padStart(2,'0')}-01`;
}
