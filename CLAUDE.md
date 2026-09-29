# CLAUDE.md

## Delegación de tareas a Cursor Agent

Está disponible el CLI de Cursor Agent para delegar tareas. **Solo está instalado en la PC-N8N** (el servidor del entorno de pruebas): si Claude corre en otra máquina (p. ej. SIS5, que ve el repo como `Z:\` por red), el comando `agent` no existe y tampoco hay acceso remoto a la PC-N8N para correrlo ni para manejar `pm2`. Se corre desde **PowerShell**, en la **raíz del repo** en la PC-N8N:

```powershell
agent -p "INSTRUCCIÓN" --output-format text --force
```

### Reglas

1. **La instrucción tiene que ser autocontenida.** Cursor no tiene el contexto de esta conversación: incluir en el prompt los archivos involucrados (con rutas), el objetivo, las restricciones y el criterio de "terminado".
2. **Siempre usar `--force`.** Evita que el agente se quede colgado esperando confirmación interactiva.
3. **Revisar el resultado con `git diff` antes de dar la tarea por terminada.** Verificar que los cambios hagan lo pedido y no toquen nada fuera de alcance.
