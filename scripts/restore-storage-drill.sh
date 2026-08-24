#!/usr/bin/env bash
# Restore drill de Storage. Seguro por defecto: solo verifica el backup.
#
# Dry-run (por defecto):
#   bash scripts/restore-storage-drill.sh /ruta/backup
#
# Copia local no destructiva (destino explícito y nunca producción):
#   bash scripts/restore-storage-drill.sh /ruta/backup \
#     --apply --destination /ruta/restauracion
#
# No implementa escritura contra Supabase. Esa operación requiere un runbook,
# aprobación humana y una herramienta específica del proyecto destino.
set -euo pipefail

BACKUP=""
DESTINO=""
APPLY=false
OVERWRITE=false

while [ "$#" -gt 0 ]; do
  case "$1" in
    --apply) APPLY=true; shift ;;
    --overwrite) OVERWRITE=true; shift ;;
    --destination)
      [ "$#" -ge 2 ] || { echo "ERROR: --destination necesita una ruta." >&2; exit 2; }
      DESTINO="$2"; shift 2 ;;
    --help|-h)
      sed -n '1,28p' "$0"; exit 0 ;;
    -*) echo "ERROR: opción desconocida: $1" >&2; exit 2 ;;
    *)
      [ -z "$BACKUP" ] || { echo "ERROR: solo se acepta un backup." >&2; exit 2; }
      BACKUP="$1"; shift ;;
  esac
done

[ -n "$BACKUP" ] || { echo "ERROR: especifica la ruta del backup." >&2; exit 2; }
[ -f "$BACKUP/MANIFIESTO.json" ] || {
  echo "ERROR: falta MANIFIESTO.json; genera un backup nuevo." >&2
  exit 3
}
command -v jq >/dev/null || { echo "ERROR: falta jq." >&2; exit 2; }

sha256_file() {
  if command -v sha256sum >/dev/null 2>&1; then sha256sum "$1" | awk '{print $1}'
  elif command -v shasum >/dev/null 2>&1; then shasum -a 256 "$1" | awk '{print $1}'
  else echo "ERROR: se necesita sha256sum o shasum." >&2; exit 2
  fi
}

format="$(jq -r '.format // empty' "$BACKUP/MANIFIESTO.json")"
version="$(jq -r '.version // empty' "$BACKUP/MANIFIESTO.json")"
[ "$format" = "likida-storage-manifest" ] && [ "$version" = "1" ] || {
  echo "ERROR: formato de manifiesto no soportado." >&2; exit 3;
}

if $APPLY; then
  [ -n "$DESTINO" ] || { echo "ERROR: --apply exige --destination explícito." >&2; exit 2; }
  [ "$DESTINO" != "/" ] || { echo "ERROR: destino raíz rechazado." >&2; exit 2; }
  mkdir -p "$DESTINO"
  BACKUP_ABS="$(cd "$BACKUP" && pwd -P)"
  DESTINO_ABS="$(cd "$DESTINO" && pwd -P)"
  [ "$BACKUP_ABS" != "$DESTINO_ABS" ] || {
    echo "ERROR: destino no puede ser el backup original." >&2; exit 2;
  }
  echo "APPLY no destructivo: $BACKUP_ABS -> $DESTINO_ABS"
else
  BACKUP_ABS="$(cd "$BACKUP" && pwd -P)"
  echo "DRY-RUN: no se escribirá nada. Backup: $BACKUP_ABS"
fi

TOTAL="$(jq -r '.object_count // -1' "$BACKUP/MANIFIESTO.json")"
COUNT=0
while IFS= read -r objeto; do
  bucket="$(jq -r '.bucket' <<<"$objeto")"
  ruta="$(jq -r '.path' <<<"$objeto")"
  bytes="$(jq -r '.bytes' <<<"$objeto")"
  esperado="$(jq -r '.sha256' <<<"$objeto")"
  case "$ruta" in
    /*|../*|*/../*|..|*$'\t'*|*$'\n'*)
      echo "ERROR: ruta insegura en manifiesto: $bucket/$ruta" >&2; exit 3 ;;
  esac
  archivo="$BACKUP_ABS/$bucket/$ruta"
  [ -f "$archivo" ] || { echo "ERROR: falta objeto: $bucket/$ruta" >&2; exit 3; }
  [ ! -L "$archivo" ] || { echo "ERROR: objeto es symlink: $bucket/$ruta" >&2; exit 3; }
  real_bytes="$(wc -c < "$archivo" | tr -d '[:space:]')"
  real_sha="$(sha256_file "$archivo")"
  [ "$real_bytes" = "$bytes" ] || { echo "ERROR: bytes no coinciden: $bucket/$ruta" >&2; exit 3; }
  [ "$real_sha" = "$esperado" ] || { echo "ERROR: SHA-256 no coincide: $bucket/$ruta" >&2; exit 3; }
  if $APPLY; then
    salida="$DESTINO_ABS/$bucket/$ruta"
    mkdir -p "$(dirname "$salida")"
    if [ -e "$salida" ]; then
      [ -f "$salida" ] || { echo "ERROR: destino no es archivo: $salida" >&2; exit 3; }
      destino_sha="$(sha256_file "$salida")"
      [ "$destino_sha" = "$esperado" ] || {
        $OVERWRITE || { echo "ERROR: conflicto existente; usa --overwrite explícito." >&2; exit 4; }
      }
    fi
    if [ ! -e "$salida" ] || $OVERWRITE; then cp -p "$archivo" "$salida"; fi
  fi
  COUNT=$((COUNT + 1))
done < <(jq -c '.objects[]' "$BACKUP/MANIFIESTO.json")

[ "$COUNT" = "$TOTAL" ] || {
  echo "ERROR: manifiesto declara $TOTAL objetos y se verificaron $COUNT." >&2; exit 3;
}

if $APPLY; then
  printf '%s\n' "$(date -u +%Y-%m-%dT%H:%M:%SZ)" > "$DESTINO_ABS/RESTORE_DRILL_COMPLETADO_UTC"
  echo "OK: $COUNT objetos verificados y copiados sin borrar archivos existentes."
else
  echo "OK: $COUNT objetos verificados; dry-run completado sin escribir."
fi
