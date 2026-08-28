// ═══════════════════════════════════════════════════════════════════════════
// PANEL DE QA (/admin/qa) — Fase A — tipos y validación compartidos.
//
// Client-safe a propósito: cero imports de node, para que el formulario
// ('use client') y el servidor hablen el mismo contrato. El contrato del
// veredicto calca `VeredictoOraculo` de scripts/qa-agentes/config.qa.ts (la
// Fase 1 del ejército de QA) — no se reescribe la semántica, solo se le da
// forma de fila de tabla para la pantalla.
//
// MODELO DE DATOS (Fase B, 24-ago-2026): las tablas `qa_corrida` /
// `qa_corrida_paso` / `qa_foto` del diseño (00-PANEL-DE-QA.md §4) YA EXISTEN
// — migración 0185. La Fase A había guardado el estado como JSON en Storage
// porque las migraciones estaban congeladas esperando el token de Supabase;
// ese motivo caducó y el ledger se importó con
// `scripts/qa/importar-ledger.ts`. En Storage solo quedan los BYTES: las
// imágenes en `qa-fotos` y los PDF del cierre en `qa-evidencia`.
// ═══════════════════════════════════════════════════════════════════════════

import type { PoliticaGasto } from '@/lib/likida/cuadre/engine';
import { normalizarFecha } from '@/lib/likida/intake/fecha';
import { COMERCIOS } from '@/lib/likida/facturacion/comercios';

export type EstadoCorrida = 'pendiente' | 'corriendo' | 'ok' | 'parcial' | 'fallo' | 'abortada';
export type EstadoPaso = 'pendiente' | 'corriendo' | 'ok' | 'warn' | 'bad';
export type Retencion = 'borrar_al_terminar' | 'conservar';
export type EscenarioId = 'feliz' | 'demo_guion' | 'foto_duplicada';

/** Los escenarios que el selector ofrece HOY. Vive aquí (client-safe) porque
 *  el validador del servidor y el formulario tienen que estar de acuerdo, y
 *  qa-escenarios.ts importa este tipo — no al revés. El catálogo del diseño
 *  tiene 11; los que faltan no se ofrecen, y el rechazo lo DICE. */
export const ESCENARIOS_VALIDOS: readonly EscenarioId[] = ['feliz', 'demo_guion', 'foto_duplicada'];

// ═══════════════════════════════════════════════════════════════════════════
// LA VERDAD-DE-TERRENO (el oráculo humano de la Fase B, pieza 2)
//
// Qué es: lo que una PERSONA leyó mirando la foto del comprobante. No es "lo
// que el sistema cree", ni "lo que el OCR sacó la vez que salió bien": es la
// etiqueta contra la que se mide el OCR, y por eso su forma importa tanto
// como su contenido.
//
// POR QUÉ EL CONTRATO ES TAN ESTRICTO CON LOS `null`. Un `null` a secas
// significa tres cosas incompatibles a la vez:
//
//   a) el papel NO imprime ese campo (un voucher bancario no trae RFC);
//   b) el papel SÍ lo imprime pero en la foto no se distingue (térmico
//      quemado, doblez, dedo encima);
//   c) a quien etiquetó se le pasó.
//
// Las tres se ven idénticas en el JSON, y sin embargo la medición del OCR
// cambia entera según cuál sea: en (a) que el OCR lea algo es una ALUCINACIÓN
// —falla—; en (b) no hay contra qué medir —el campo no cuenta ni a favor ni en
// contra—; y (c) no debería existir. Por eso el contrato EXIGE que todo `null`
// esté clasificado: cada `ClaveVerdad` con valor `null` aparece en `ilegibles`
// o en `noAplica`, en una sola de las dos, y ninguna clave con valor aparece en
// ninguna. `validarVerdadTerreno` lo comprueba y DICE cuál se rompió — y el
// mismo invariante lo repite la base en la 0239, porque un dato que corrompe
// una medición no puede depender de que alguien recuerde llamar al validador.
// ═══════════════════════════════════════════════════════════════════════════

export type ClaveVerdad =
  | 'emisor' | 'rfcEmisor' | 'folio' | 'monto' | 'fecha' | 'sucursal' | 'dominioFacturacion';

/** El orden en el que la pantalla las pinta y en el que se recorren al medir.
 *  Es la lista COMPLETA: `validarVerdadTerreno` la usa para exigir que cada una
 *  esté clasificada, así que agregar una clave aquí endurece la validación de
 *  todas las etiquetas existentes — a propósito. */
export const CLAVES_VERDAD: readonly ClaveVerdad[] = [
  'emisor', 'rfcEmisor', 'folio', 'monto', 'fecha', 'sucursal', 'dominioFacturacion',
];

/** Cómo se llama cada campo en la pantalla. Español, porque quien mira la ficha
 *  es la persona que etiquetó la foto, no quien escribió el tipo. */
export const NOMBRE_CLAVE_VERDAD: Record<ClaveVerdad, string> = {
  emisor: 'Emisor',
  rfcEmisor: 'RFC del emisor',
  folio: 'Folio',
  monto: 'Monto',
  fecha: 'Fecha',
  sucursal: 'Sucursal',
  dominioFacturacion: 'Dominio de facturación',
};

/**
 * QUÉ CLASE DE PAPEL ES. Calca la distinción que `intake/ocr.ts` ya hace en
 * producción (`documento`: voucher_pago / nota_no_fiscal / …) porque es la que
 * decide si el papel puede entrar como gasto:
 *
 *  · `ticket`            — el ticket de compra normal, se factura en el portal.
 *  · `voucher_bancario`  — el papel de la terminal. NO es dinero aparte: su
 *                          ticket fiscal ya representa el mismo gasto. Medir el
 *                          OCR contra un voucher sirve justo para verificar que
 *                          el sistema lo RECONOCE como voucher.
 *  · `cfdi_impreso`      — la representación impresa de un CFDI ya timbrado.
 *  · `no_comprobante`    — la foto no es un comprobante (una borrosa, un
 *                          paisaje, un papel cualquiera). Está en el banco a
 *                          propósito: el pipeline tiene que rechazarla.
 */
export type ClaseComprobante =
  | 'ticket' | 'voucher_bancario' | 'cfdi_impreso' | 'no_comprobante';

export const CLASES_COMPROBANTE: readonly ClaseComprobante[] = [
  'ticket', 'voucher_bancario', 'cfdi_impreso', 'no_comprobante',
];

export interface VerdadTerreno {
  /** clave del comercio en COMERCIOS (facturacion/comercios.ts), o null si el
   *  emisor NO está en el catálogo — ese null es un hallazgo, no un hueco. */
  comercioClave: string | null;
  emisor: string | null;
  rfcEmisor: string | null;
  folio: string | null;
  monto: number | null;
  /** 'yyyy-mm-dd' tal como se lee impreso. */
  fecha: string | null;
  sucursal: string | null;
  /** El dominio del portal de facturación IMPRESO en el comprobante. */
  dominioFacturacion: string | null;
  /** Campos que NO se pudieron leer con claridad en la foto. */
  ilegibles: ClaveVerdad[];
  /** Campos que el comprobante genuinamente NO imprime. */
  noAplica: ClaveVerdad[];
  clase: ClaseComprobante;
  notas: string | null;
}

/** Una foto del banco (tabla `qa_foto`, mig. 0185; los bytes en el bucket
 *  qa-fotos).
 *
 *  `ocrEsperado` DEJÓ de ser `null` en el tipo: la pantalla del oráculo humano
 *  existe (banco-verdad.tsx) y `fotoDeFila` ya lo lee de verdad. `null` sigue
 *  significando "nadie la ha confirmado", que NO es lo mismo que "está bien":
 *  una foto sin verdad-de-terreno no se puede medir, y la medición lo dice en
 *  vez de contarla como acierto. */
export interface FotoBanco {
  id: string;
  /** sha256 de los BYTES del archivo — el mismo criterio que `img_hash` de
   *  producción (`hashImagen`), para que el dedup del banco y el de la base
   *  hablen del mismo hash. */
  hash: string;
  path: string;          // ruta dentro del bucket qa-fotos
  mime: string;
  etiqueta: string;      // hoy: el nombre original del archivo (nadie etiquetó aún)
  bytes: number;
  subidoEn: string;
  ocrEsperado: VerdadTerreno | null;
  /** Cuándo se firmó la verdad-de-terreno. El CHECK
   *  `qa_foto_confirmacion_completa` (0185) hace imposible que uno esté puesto
   *  sin el otro, así que aquí los dos van juntos o no va ninguno. */
  confirmadoEn: string | null;
}

export interface PasoQA {
  n: number;
  nombre: string;
  estado: EstadoPaso;
  /** Costo REAL de este paso, leído de llm_costo (fases ≠ whatsapp) — nunca
   *  una estimación. */
  costoUsd: number;
  detalle?: string;
  inicio?: string;
  fin?: string;
}

export interface FilaVeredicto {
  invariante: string;    // "#1  anticipo − gastos = diferencia"
  oraculo: string;       // "cuadre_balancea (#1)"
  estado: 'ok' | 'fallo' | 'no_verificado';
  severidad: string;     // CRÍTICO | ALTO | MEDIO — la del invariante, aplica si falla
  esperado: unknown;
  real: unknown;
  detalle?: string;
}

export interface TurnoConversacion { rol: 'user' | 'assistant'; texto: string }

export interface ParametrosCorrida {
  anticipo: number;
  rfcEmpresa: string | null;
  ruta: { origen: string; destino: string };
  politica: PoliticaGasto[];
  fotoIds: string[];
  retencion: Retencion;
}

export interface CorridaQA {
  id: string;
  escenario: EscenarioId;
  carril: 'rapido';      // el carril completo (GitHub Actions) es Fase C
  // (la columna de la 0185 ya admite 'completo': la Fase C no pide DDL, solo
  //  abrir este literal y escribir el workflow.)
  parametros: ParametrosCorrida;
  estado: EstadoCorrida;
  /** Por qué se abortó / qué motivo tiene el estado — dicho, nunca en silencio. */
  motivo: string | null;
  tenantId: string | null;
  tenantNombre: string;
  creadaEn: string;
  inicio: string | null;
  fin: string | null;
  /** Última señal de vida del motor: cada escritura de paso lo actualiza. La
   *  pantalla lo usa para decir "sin señales desde hace Ns" si el proceso
   *  murió sin poder escribir su aborto (fallar cerrado en la LECTURA). */
  latidoEn: string;
  pasos: PasoQA[];
  costoUsdTotal: number;
  veredicto: FilaVeredicto[] | null;
  /** La conversación completa (turnos de wa_conversacion): la evidencia de
   *  qué dijo el chofer sintético y qué contestó el sistema. */
  turnos: TurnoConversacion[];
  /** Rutas de PDF que el cierre dejó en el bucket `liquidaciones`. */
  pdfs: string[];
  limpieza: string | null;
}

/** Tope del carril rápido (00-PANEL-DE-QA.md §3): más fotos que esto necesita
 *  el carril completo (Fase C) — el botón lo dice, no falla en silencio. */
export const MAX_FOTOS_CARRIL_RAPIDO = 10;

/** Tope diario del panel (00-PANEL-DE-QA.md §6, default $5). Vive aquí
 *  (client-safe) porque el botón lo enseña; el CANDADO real lo aplica el
 *  servidor (lanzar/route.ts) con el gasto leído, nunca solo la interfaz. */
export const TOPE_DIA_USD = 5;

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const RFC_RE = /^[A-ZÑ&0-9]{12,13}$/;

export interface LanzarValidado {
  escenario: EscenarioId;
  params: ParametrosCorrida;
}

/** Valida el body del POST /api/admin/qa/lanzar. El cliente no es frontera de
 *  confianza (mismo criterio que valida /api/admin/copiloto): todo se
 *  re-chequea aquí y el motivo del rechazo se dice. */
export function validarLanzar(crudo: unknown): { ok: true; datos: LanzarValidado } | { ok: false; error: string } {
  const b = crudo as Record<string, unknown> | null;
  if (!b || typeof b !== 'object') return { ok: false, error: 'body inválido' };

  const escenario = b.escenario as EscenarioId;
  if (!ESCENARIOS_VALIDOS.includes(escenario)) {
    return { ok: false, error: `escenario desconocido — los del selector son ${ESCENARIOS_VALIDOS.map((e) => `"${e}"`).join(', ')}; los ${11 - ESCENARIOS_VALIDOS.length} restantes del catálogo siguen pendientes` };
  }

  const fotoIds = b.fotoIds;
  if (!Array.isArray(fotoIds) || fotoIds.length === 0) return { ok: false, error: 'elige al menos una foto del banco' };
  if (fotoIds.length > MAX_FOTOS_CARRIL_RAPIDO) {
    return { ok: false, error: `más de ${MAX_FOTOS_CARRIL_RAPIDO} fotos no cabe en el carril rápido — eso es carril completo (Fase C)` };
  }
  if (!fotoIds.every((f) => typeof f === 'string' && UUID_RE.test(f))) return { ok: false, error: 'fotoIds inválidos' };

  const anticipo = Number(b.anticipo);
  if (!Number.isFinite(anticipo) || anticipo <= 0 || anticipo > 10_000_000) {
    return { ok: false, error: 'anticipo inválido — debe ser un monto mayor a 0' };
  }

  let rfcEmpresa: string | null = null;
  if (b.rfcEmpresa !== null && b.rfcEmpresa !== undefined && b.rfcEmpresa !== '') {
    if (typeof b.rfcEmpresa !== 'string') return { ok: false, error: 'rfcEmpresa inválido' };
    const rfc = b.rfcEmpresa.toUpperCase().replace(/[^A-ZÑ&0-9]/g, '');
    if (!RFC_RE.test(rfc)) return { ok: false, error: 'rfcEmpresa inválido — 12 o 13 caracteres de RFC' };
    rfcEmpresa = rfc;
  }

  const ruta = b.ruta as Record<string, unknown> | null;
  const origen = typeof ruta?.origen === 'string' ? ruta.origen.trim().slice(0, 80) : '';
  const destino = typeof ruta?.destino === 'string' ? ruta.destino.trim().slice(0, 80) : '';
  if (!origen || !destino) return { ok: false, error: 'ruta incompleta — origen y destino' };

  const politicaCruda = b.politica;
  if (!Array.isArray(politicaCruda) || politicaCruda.length === 0 || politicaCruda.length > 20) {
    return { ok: false, error: 'política inválida — de 1 a 20 conceptos' };
  }
  const politica: PoliticaGasto[] = [];
  for (const p of politicaCruda) {
    const fila = p as Record<string, unknown>;
    const concepto = typeof fila?.concepto === 'string' ? fila.concepto.trim().toLowerCase().slice(0, 40) : '';
    if (!concepto) return { ok: false, error: 'política inválida — un concepto está vacío' };
    const entrada: PoliticaGasto = { concepto };
    if (fila.topeMonto !== undefined && fila.topeMonto !== null && fila.topeMonto !== '') {
      const tope = Number(fila.topeMonto);
      if (!Number.isFinite(tope) || tope < 0 || tope > 10_000_000) return { ok: false, error: `política inválida — tope de "${concepto}"` };
      entrada.topeMonto = tope;
    }
    if (fila.requiereCfdi === true) entrada.requiereCfdi = true;
    politica.push(entrada);
  }

  const retencion: Retencion = b.retencion === 'conservar' ? 'conservar' : 'borrar_al_terminar';

  return {
    ok: true,
    datos: {
      escenario,
      params: { anticipo, rfcEmpresa, ruta: { origen, destino }, politica, fotoIds: fotoIds as string[], retencion },
    },
  };
}

// ── El validador de la verdad-de-terreno ───────────────────────────────────

/** Texto de una etiqueta humana: se recorta, se topa y se rechaza el vacío.
 *  Un `""` NO es lo mismo que `null` — el vacío se cuela como "se leyó una
 *  cadena vacía" y luego mide contra el OCR como si fuera un dato. */
function textoVerdad(v: unknown, campo: string, maxLargo: number): { ok: true; valor: string | null } | { ok: false; error: string } {
  if (v === null || v === undefined) return { ok: true, valor: null };
  if (typeof v !== 'string') return { ok: false, error: `${campo}: se esperaba texto o null, llegó ${typeof v}` };
  const t = v.trim();
  if (t === '') return { ok: false, error: `${campo}: cadena vacía — si no se leyó, va null y clasificado en "ilegibles" o "noAplica"` };
  if (t.length > maxLargo) return { ok: false, error: `${campo}: pasa de ${maxLargo} caracteres (${t.length})` };
  return { ok: true, valor: t };
}

/** Una lista de `ClaveVerdad`: claves conocidas, sin repetidos. Un repetido
 *  no es inocente — delata que la etiqueta se editó a mano dos veces y que
 *  quizá la otra lista quedó a medias. */
function listaClaves(v: unknown, campo: string): { ok: true; valor: ClaveVerdad[] } | { ok: false; error: string } {
  if (v === undefined || v === null) return { ok: false, error: `${campo}: falta — si no hay ninguno, va []` };
  if (!Array.isArray(v)) return { ok: false, error: `${campo}: se esperaba un arreglo` };
  const salida: ClaveVerdad[] = [];
  for (const x of v) {
    if (typeof x !== 'string' || !CLAVES_VERDAD.includes(x as ClaveVerdad)) {
      return { ok: false, error: `${campo}: "${String(x)}" no es un campo medible — los que hay: ${CLAVES_VERDAD.join(', ')}` };
    }
    if (salida.includes(x as ClaveVerdad)) return { ok: false, error: `${campo}: "${x}" aparece dos veces` };
    salida.push(x as ClaveVerdad);
  }
  return { ok: true, valor: salida };
}

/**
 * Valida la verdad-de-terreno de UNA foto y dice qué está mal cuando lo está.
 *
 * El invariante que da sentido a toda la medición, y el único motivo por el que
 * esta función existe en vez de un `as VerdadTerreno`:
 *
 *   para cada ClaveVerdad, valor `null` ⟺ está en `ilegibles` XOR en `noAplica`.
 *
 * Los tres modos de romperlo, y por qué cada uno envenena la medición:
 *
 *   · `null` sin clasificar → "no se sabe por qué falta". Al medir habría que
 *     decidir a ciegas si un OCR que leyó algo alucinó o acertó.
 *   · `null` en las DOS listas → dos afirmaciones que se contradicen ("el papel
 *     no lo trae" y "el papel lo trae pero no se ve").
 *   · valor NO nulo listado como ilegible/noAplica → la etiqueta dice a la vez
 *     que sí se leyó y que no se pudo leer. El campo se descontaría de la
 *     medición teniendo un esperado perfectamente bueno, y el porcentaje del
 *     panel saldría inflado sobre menos campos de los que de verdad se midieron.
 */
export function validarVerdadTerreno(crudo: unknown): { ok: true; datos: VerdadTerreno } | { ok: false; error: string } {
  const b = crudo as Record<string, unknown> | null;
  if (!b || typeof b !== 'object' || Array.isArray(b)) return { ok: false, error: 'verdad-de-terreno inválida: se esperaba un objeto' };

  // comercioClave se comprueba CONTRA EL CATÁLOGO REAL. Una clave inventada
  // ("oxxogas2") pasaría cualquier chequeo de forma y luego no casaría con
  // nada: el hallazgo "este emisor no está en COMERCIOS" se escribe con `null`,
  // que es un dato, no con una clave que no existe, que es basura.
  let comercioClave: string | null = null;
  if (b.comercioClave !== null && b.comercioClave !== undefined) {
    if (typeof b.comercioClave !== 'string') return { ok: false, error: 'comercioClave: se esperaba texto o null' };
    const clave = b.comercioClave.trim();
    if (!COMERCIOS.some((c) => c.clave === clave)) {
      return { ok: false, error: `comercioClave: "${clave}" no está en COMERCIOS (facturacion/comercios.ts). Si el emisor no está en el catálogo, va null — ese null es un hallazgo, no un hueco` };
    }
    comercioClave = clave;
  }

  const emisor = textoVerdad(b.emisor, 'emisor', 160);
  if (!emisor.ok) return emisor;
  const folio = textoVerdad(b.folio, 'folio', 80);
  if (!folio.ok) return folio;
  const sucursal = textoVerdad(b.sucursal, 'sucursal', 120);
  if (!sucursal.ok) return sucursal;
  const dominio = textoVerdad(b.dominioFacturacion, 'dominioFacturacion', 200);
  if (!dominio.ok) return dominio;
  const notas = textoVerdad(b.notas, 'notas', 600);
  if (!notas.ok) return notas;

  const rfcTexto = textoVerdad(b.rfcEmisor, 'rfcEmisor', 20);
  if (!rfcTexto.ok) return rfcTexto;
  let rfcEmisor: string | null = null;
  if (rfcTexto.valor !== null) {
    const rfc = rfcTexto.valor.toUpperCase().replace(/[^A-ZÑ&0-9]/g, '');
    if (!RFC_RE.test(rfc)) return { ok: false, error: `rfcEmisor: "${rfcTexto.valor}" no tiene forma de RFC (12 o 13 caracteres). Si en la foto no se distingue, va null y en "ilegibles"` };
    rfcEmisor = rfc;
  }

  let monto: number | null = null;
  if (b.monto !== null && b.monto !== undefined) {
    if (typeof b.monto !== 'number' || !Number.isFinite(b.monto)) {
      return { ok: false, error: 'monto: se esperaba un número finito o null' };
    }
    // Negativo no existe en un comprobante y 0 tampoco se etiqueta: un ticket
    // de $0.00 no se fotografía. Dejar pasar el 0 lo volvería indistinguible
    // del `null` que esta función existe para no confundir.
    if (b.monto <= 0) return { ok: false, error: `monto: ${b.monto} — un comprobante no ampara cero ni negativo; si no se lee, va null y clasificado` };
    if (b.monto > 10_000_000) return { ok: false, error: `monto: ${b.monto} pasa del tope razonable de un comprobante de viaje` };
    monto = Math.round(b.monto * 100) / 100;
  }

  const fechaTexto = textoVerdad(b.fecha, 'fecha', 10);
  if (!fechaTexto.ok) return fechaTexto;
  let fecha: string | null = null;
  if (fechaTexto.valor !== null) {
    // `normalizarFecha` es la MISMA función que el intake de producción usa, y
    // rechaza el 31 de abril en vez de rodarlo al 1 de mayo en silencio. Se
    // exige que la entrada YA venga en ISO: la verdad-de-terreno la teclea una
    // persona contra un formato fijo, no la adivina un modelo.
    const iso = normalizarFecha(fechaTexto.valor);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(fechaTexto.valor) || iso !== fechaTexto.valor) {
      return { ok: false, error: `fecha: "${fechaTexto.valor}" no es una fecha real en formato yyyy-mm-dd` };
    }
    fecha = iso;
  }

  const clase = b.clase;
  if (typeof clase !== 'string' || !CLASES_COMPROBANTE.includes(clase as ClaseComprobante)) {
    return { ok: false, error: `clase: "${String(clase)}" desconocida — las que hay: ${CLASES_COMPROBANTE.join(', ')}` };
  }

  const ilegibles = listaClaves(b.ilegibles, 'ilegibles');
  if (!ilegibles.ok) return ilegibles;
  const noAplica = listaClaves(b.noAplica, 'noAplica');
  if (!noAplica.ok) return noAplica;

  const datos: VerdadTerreno = {
    comercioClave,
    emisor: emisor.valor,
    rfcEmisor,
    folio: folio.valor,
    monto,
    fecha,
    sucursal: sucursal.valor,
    dominioFacturacion: dominio.valor,
    ilegibles: ilegibles.valor,
    noAplica: noAplica.valor,
    clase: clase as ClaseComprobante,
    notas: notas.valor,
  };

  // ── EL INVARIANTE, campo por campo y con el motivo a la vista ────────────
  for (const clave of CLAVES_VERDAD) {
    const vacio = datos[clave] === null;
    const esIlegible = datos.ilegibles.includes(clave);
    const esNoAplica = datos.noAplica.includes(clave);
    if (esIlegible && esNoAplica) {
      return { ok: false, error: `${clave}: está en "ilegibles" Y en "noAplica" a la vez — o el papel no lo imprime, o lo imprime y no se distingue; las dos cosas no` };
    }
    if (vacio && !esIlegible && !esNoAplica) {
      return { ok: false, error: `${clave}: es null y no está clasificado — ponlo en "ilegibles" (el papel lo trae pero no se lee) o en "noAplica" (el papel no lo imprime). Un null sin motivo corrompe la medición` };
    }
    if (!vacio && (esIlegible || esNoAplica)) {
      return { ok: false, error: `${clave}: tiene valor (${JSON.stringify(datos[clave])}) pero está listado en "${esIlegible ? 'ilegibles' : 'noAplica'}" — o se leyó, o no se leyó` };
    }
  }

  return { ok: true, datos };
}

// ── El lote del botón «correr el OCR» ──────────────────────────────────────

/** Tope de fotos por invocación de `/api/admin/qa/fotos/ocr`. No es una
 *  preferencia: cada foto es una llamada de visión EN SERIE de varios
 *  segundos, y 25 ya rozan el `maxDuration` de 120 s. Pedir las 91 de golpe
 *  sería pedir un corte a media iteración. Vive aquí (client-safe) porque el
 *  botón lo enseña; el candado real lo aplica el servidor. */
export const MAX_FOTOS_OCR = 25;

/** Valida el body del POST /api/admin/qa/fotos/ocr. Igual que `validarLanzar`,
 *  la corre TAMBIÉN el formulario para que el motivo del botón deshabilitado
 *  sea literalmente el mismo texto que el rechazo del servidor. */
export function validarLoteOcr(crudo: unknown): { ok: true; fotoIds: string[] } | { ok: false; error: string } {
  const b = crudo as Record<string, unknown> | null;
  if (!b || typeof b !== 'object') return { ok: false, error: 'body inválido — se esperaba { fotoIds: string[] }' };
  const ids = b.fotoIds;
  if (!Array.isArray(ids) || ids.length === 0) return { ok: false, error: 'elige al menos una foto del banco' };
  if (!ids.every((x) => typeof x === 'string' && UUID_RE.test(x))) {
    return { ok: false, error: 'fotoIds inválidos — se esperaban uuids' };
  }
  // Deduplicar ANTES del tope: la misma foto dos veces se leería dos veces y
  // se cobraría dos veces, y el segundo resultado no aporta nada.
  const unicos = [...new Set(ids as string[])];
  if (unicos.length > MAX_FOTOS_OCR) {
    return { ok: false, error: `${unicos.length} fotos no caben en una invocación — el tope es ${MAX_FOTOS_OCR} (cada foto es una llamada de visión en serie). Mándalas en tandas de ${MAX_FOTOS_OCR}` };
  }
  return { ok: true, fotoIds: unicos };
}

/** El estado final de una corrida a partir de su veredicto: cualquier fallo
 *  manda (fallo), lo no verificado NO cuenta como pasó (parcial — regla
 *  "fallar cerrado y decirlo"), y solo ok limpio es ok. */
export function estadoFinalDe(veredicto: FilaVeredicto[]): Extract<EstadoCorrida, 'ok' | 'parcial' | 'fallo'> {
  if (veredicto.some((v) => v.estado === 'fallo')) return 'fallo';
  if (veredicto.some((v) => v.estado === 'no_verificado')) return 'parcial';
  return 'ok';
}

/** Conteo ✅/⚠️/❌ para el historial. */
export function resumenVeredicto(veredicto: FilaVeredicto[] | null): { ok: number; noVerificado: number; fallo: number } | null {
  if (!veredicto) return null;
  return {
    ok: veredicto.filter((v) => v.estado === 'ok').length,
    noVerificado: veredicto.filter((v) => v.estado === 'no_verificado').length,
    fallo: veredicto.filter((v) => v.estado === 'fallo').length,
  };
}
