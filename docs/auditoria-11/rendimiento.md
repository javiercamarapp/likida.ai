<thinking>
Necesito auditar el rubro 11 con herramientas reales. Voy a explorar la estructura del repo y leer los archivos clave. Empiezo listando directorios relevantes.
</thinking>

<bash>
find src -maxdepth 3 -type f \( -name "*.ts" -o -name "*.tsx" \) | head -200
</bash>
<bash>
find app -maxdepth 4 -type f 2>/dev/null | head -200
</bash>
<bash>
find src -type d | head -100
</bash>