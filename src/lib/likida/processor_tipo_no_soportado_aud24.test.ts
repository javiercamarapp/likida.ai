import { describe, it, expect, vi } from 'vitest';

// ═══════════════════════════════════════════════════════════════════════════
// AUDITORÍA 24 · WA-9 (MEDIO) — lo que se le contesta a un mensaje que no
// sabemos leer. La lista de formatos era la misma para todo, y por eso no
// servía: el chofer que manda un video de la llanta ponchada leía «solo
// proceso texto, fotos de comprobantes, el XML del CFDI y tu ubicación» sin
// una palabra sobre el video, y concluía que el bot no entiende.
//
// Las reacciones (👍) no llegan a este texto: `extractMessages` las descarta
// antes del inbox (`route_cableado.test.ts`).
// ═══════════════════════════════════════════════════════════════════════════

vi.mock('@/lib/likida/tools', () => ({}));

const { mensajeTipoNoSoportado } = await import('./processor');

describe('mensajeTipoNoSoportado — se nombra lo que mandó, no un catálogo', () => {
  it('el video: se dice que no se lee y qué hacer en su lugar', () => {
    const t = mensajeTipoNoSoportado('video');
    expect(t).toMatch(/video/i);
    expect(t).toMatch(/foto/i);
  });

  it('el sticker: se le pide que escriba, sin sermón de formatos', () => {
    const t = mensajeTipoNoSoportado('sticker');
    expect(t).toMatch(/sticker/i);
    expect(t).not.toMatch(/XML del CFDI y tu ubicación/);
  });

  it('el contacto compartido: se le ofrece la salida que sí existe (yo le aviso)', () => {
    const t = mensajeTipoNoSoportado('contacts');
    expect(t).toMatch(/contactos/i);
    expect(t).toMatch(/jefe/i);
  });

  it('sin subtipo (o uno que no conocemos) queda el texto de siempre', () => {
    expect(mensajeTipoNoSoportado()).toMatch(/solo proceso texto/i);
    expect(mensajeTipoNoSoportado('nfm_reply')).toMatch(/solo proceso texto/i);
  });

  it('todos terminan diciendo qué mandar: el chofer no se queda sin siguiente paso', () => {
    for (const s of [undefined, 'sticker', 'video', 'contacts', 'unsupported']) {
      expect(mensajeTipoNoSoportado(s)).toMatch(/Mándame la foto de tu ticket o el XML/);
    }
  });
});
