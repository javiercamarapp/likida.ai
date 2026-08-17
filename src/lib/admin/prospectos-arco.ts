// ═══════════════════════════════════════════════════════════════════════════
// ARCO DEL CENSO — Likida es RESPONSABLE de los contactos del pipeline
// (LFPDPPP 2025). La flota no puede ejercer este derecho: los datos no son
// de ella. Cancelar = anonimizar nombre, correo y teléfono. La empresa
// publicada (DENUE) no es un dato de una persona y se conserva.
// ═══════════════════════════════════════════════════════════════════════════

import { supabaseAdmin } from '@/lib/supabase/admin';
import { traerTodo } from '@/lib/likida/pg';
import { logger } from '@/lib/logger';

export interface ResultadoCancelacionProspecto {
  encontrados: number;
  anonimizados: number;
  ids: string[];
}

function variantesTelefono(s: string): string[] {
  const digitos = s.replace(/\D/g, '');
  if (digitos.length < 10) return [s.trim().toLowerCase()];
  const diez = digitos.slice(-10);
  return [diez, `52${diez}`, `521${diez}`, `+52${diez}`, `+521${diez}`];
}

/**
 * Anonimiza a TODO prospecto cuyo correo o teléfono coincida con `ref`.
 * Borra toques y contactos de salida. No toca `empresa` ni `vacante`.
 */
export async function ejecutarCancelacionProspecto(ref: string): Promise<ResultadoCancelacionProspecto> {
  const clave = ref.trim();
  if (!clave) return { encontrados: 0, anonimizados: 0, ids: [] };

  const admin = supabaseAdmin();
  const correos = [clave.toLowerCase()];
  const tels = variantesTelefono(clave);

  const porCorreo = await traerTodo<{ id: string }>(
    (d, h) => admin.from('prospecto').select('id').ilike('correo', clave).order('id').range(d, h),
    'arco.prospecto.correo',
  );
  const porTel = await traerTodo<{ id: string }>(
    (d, h) => admin.from('prospecto').select('id').in('telefono', tels).order('id').range(d, h),
    'arco.prospecto.tel',
  );
  const ids = [...new Set([...porCorreo, ...porTel].map((r) => r.id))];
  if (ids.length === 0) return { encontrados: 0, anonimizados: 0, ids: [] };

  let anonimizados = 0;
  for (const id of ids) {
    const { error } = await admin.from('prospecto').update({
      contacto_nombre: null,
      telefono: null,
      correo: null,
      notas: null,
      mensaje_wa: null,
      mensaje_correo: null,
      mensaje_correo_asunto: null,
    }).eq('id', id);
    if (error) {
      logger.error('arco.prospecto.anonimizar', { id, err: error.message });
      continue;
    }
    await admin.from('prospecto_toque').delete().eq('prospecto_id', id);
    await admin.from('prospecto_contacto').delete().eq('prospecto_id', id);
    anonimizados++;
  }
  logger.info('arco.prospecto.cancelado', { ref: correos[0], n: anonimizados });
  return { encontrados: ids.length, anonimizados, ids };
}
