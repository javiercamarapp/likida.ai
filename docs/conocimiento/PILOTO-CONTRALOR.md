# Piloto con un contralor — lo que falta para el 7

El código no firma un cliente. Este documento es el protocolo para que el
primer contralor cruce un PDF de Likida contra su semana real. Sin ese
cruce, la nota de startup no sube: el resto de esta ronda cierra huecos
fiscales y legales, no el hueco de mercado.

## Condición de terminación

Un contralor de una flota mexicana, con viajes reales de al menos 5 días,
tiene en la mano:

1. El PDF de liquidación de Likida.
2. Su Excel / ERP de esa misma semana.
3. Una lista de diferencias (puede ser vacía) firmada por él.

Eso no se fabrica en el repo.

## Qué preparar antes de la reunión

- Un número de WhatsApp de prueba whitelisted (sandbox Meta).
- La flota dada de alta con **su RFC real** (si queda el genérico, el motor
  apaga la validación de receptor y el PDF miente).
- Política de topes capturada (diésel, caseta, viáticos).
- 8–15 tickets del mismo viaje, no un fajo mezclado.
- `LIKIDA_RECUPERAR_CIERRE_PARCIAL` sin `=0`.
- Confirmar en Vercel que el deployment es el commit de esta ronda.

## Durante

El operador manda fotos y escribe `listo`. El contralor no mira el chat:
mira el PDF y lo cruza renglón a renglón (folio, litros, RFC, IVA, peaje).
Cualquier cifra que él no pueda defender se anota con el folio del ticket.

## Después

Si el PDF cuadra: se pide el sí del piloto de 30 días.
Si no cuadra: se abre hallazgo con folio + cifra de él + cifra de Likida.
No se “arregla a ojo” en la sala.

## Qué el código ya no debe hacer en esa sala

- Inflar el 50% de peaje sobre una caseta en efectivo.
- Acreditar IVA de un CFDI a nombre de un tercero.
- Decir “0% · sin movimiento” cuando no hay periodo anterior.
- Dejar un ticket como procesado si el OCR se murió a mitad.
