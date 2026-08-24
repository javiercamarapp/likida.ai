#!/usr/bin/env bash
# Pruebas offline de los guardas del restore drill. No usa Supabase, AWS ni
# credenciales y no toca el repositorio.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd -P)"
TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT

mkdir -p "$TMP/backup/comprobantes"
printf 'contenido de prueba\n' > "$TMP/backup/comprobantes/a.txt"
sha256_file() { sha256sum "$1" | awk '{print $1}'; }
SHA="$(sha256_file "$TMP/backup/comprobantes/a.txt")"
BYTES="$(wc -c < "$TMP/backup/comprobantes/a.txt" | tr -d '[:space:]')"
jq -n --arg sha "$SHA" --argjson bytes "$BYTES" '{format:"likida-storage-manifest",version:1,object_count:1,objects:[{bucket:"comprobantes",path:"a.txt",bytes:$bytes,sha256:$sha}]}' > "$TMP/backup/MANIFIESTO.json"

# Dry-run no crea destino.
bash "$ROOT/scripts/restore-storage-drill.sh" "$TMP/backup" >/dev/null
[ ! -e "$TMP/dry-run" ]

# Un cambio en el backup debe fallar por SHA-256 aunque el manifiesto exista.
printf 'tampered\n' > "$TMP/backup/comprobantes/a.txt"
if bash "$ROOT/scripts/restore-storage-drill.sh" "$TMP/backup" >/dev/null 2>&1; then
  echo "ERROR: un objeto alterado no falló la verificación." >&2
  exit 1
fi
printf 'contenido de prueba\n' > "$TMP/backup/comprobantes/a.txt"

# Apply exige destino explícito y copia sin destruir.
bash "$ROOT/scripts/restore-storage-drill.sh" "$TMP/backup" --apply --destination "$TMP/restore" >/dev/null
cmp "$TMP/backup/comprobantes/a.txt" "$TMP/restore/comprobantes/a.txt"

# Un conflicto distinto debe fallar sin --overwrite.
printf 'otro contenido\n' > "$TMP/restore/comprobantes/a.txt"
if bash "$ROOT/scripts/restore-storage-drill.sh" "$TMP/backup" --apply --destination "$TMP/restore" >/dev/null 2>&1; then
  echo "ERROR: un conflicto de restore no falló." >&2
  exit 1
fi

echo "OK: pruebas offline de resiliencia (dry-run, copia y conflicto)."
