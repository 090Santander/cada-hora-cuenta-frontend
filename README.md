# Cada hora cuenta · Frontend

Dashboard React, TypeScript, Vite y Tailwind para la planificación asistencial de Teletón Chile. Este directorio es la **raíz del repositorio frontend** y se ejecuta de forma independiente del repositorio backend.

## Requisitos

- Node.js 20 o superior y npm
- Servicios de identidad, planificación e ingesta activos (o backend en modo monolito)

## Linux

Desde la raíz del repositorio frontend:

```bash
npm ci
npm run dev
```

## Windows (PowerShell)

Desde la raíz del repositorio frontend:

```powershell
npm ci
npm run dev
```

Abre `http://localhost:5173` e inicia sesión con una cuenta creada en el backend. Para compilar la versión de producción, ejecuta `npm run build`. La salida se genera en `dist/`.

## Conectar las API

Por defecto el frontend conecta al mismo equipo en los puertos `8002` (planificación), `8001` (ingesta) y `8003` (identidad). Si los servicios tienen otra dirección, copia `.env.example` a `.env.local` y ajusta:

```dotenv
VITE_PLANNING_URL=http://127.0.0.1:8002
VITE_INGESTION_URL=http://127.0.0.1:8001
VITE_AUTH_URL=http://127.0.0.1:8003
```

Si ejecutas el backend como **monolito modular** en el puerto `8000`, copia `monolith.env.example` a `.env.local` en lugar de `.env.example`. En Linux: `cp monolith.env.example .env.local`. En PowerShell: `Copy-Item monolith.env.example .env.local`.

Al aprobar un cambio, la app solo registra la decisión: el proceso 3 de Blue Prism retoma el caso y recalcula. Si el bot no está disponible, agrega `VITE_MANUAL_RECALC=1` a `.env.local` y la app recalculará al aprobar y mostrará el botón "Recalcular plan".

Reinicia Vite tras cambiar estas variables. El backend debe incluir el origen del frontend en `CORS_ORIGINS`. No coloques contraseñas ni `INTERNAL_SERVICE_KEY` en variables `VITE_*`, porque quedan visibles en el navegador.

## Publicar el frontend en GitHub Pages

GitHub Pages sirve únicamente el frontend estático. Para que el acceso y los datos funcionen, publica el backend por separado bajo HTTPS antes de activar Pages. Las tres direcciones de API son públicas y **no** deben contener credenciales.

1. En `090Santander/cada-hora-cuenta-frontend`, abre **Settings → Secrets and variables → Actions → Variables** y crea `VITE_AUTH_URL`, `VITE_PLANNING_URL` y `VITE_INGESTION_URL` con las URL HTTPS de los servicios. Si usas el monolito modular, pueden ser `https://tu-dominio/auth`, `https://tu-dominio/planning` y `https://tu-dominio/ingestion`.
2. En el backend, configura `CORS_ORIGINS=https://090santander.github.io` (agrega los orígenes locales separados por comas si también desarrollarás en localhost). Reinicia los servicios.
3. En el repositorio frontend, abre **Settings → Pages → Build and deployment** y selecciona **GitHub Actions** como origen.
4. Envía el commit a `main`. El workflow [pages.yml](.github/workflows/pages.yml) instalará dependencias, compilará con la ruta base correcta y publicará `dist/`. Revisa **Actions** para confirmar que terminó correctamente.
5. Abre `https://090santander.github.io/cada-hora-cuenta-frontend/` y comprueba el inicio de sesión y los tres indicadores de servicio.

El workflow falla de forma explícita si falta una URL HTTPS de API. GitHub Pages no ejecuta FastAPI ni aloja SQLite. No uses datos reales en una demostración pública sin la autorización institucional correspondiente.

## Vistas por rol

| Perfil | Secciones |
| --- | --- |
| Superadministrador | Todas, incluidas cuentas, auditoría y edición de parámetros |
| Administrador | Resumen, dotación, cambios, plan vs real, parámetros en consulta, ingesta y asistente |
| Usuario | Resumen, dotación, plan vs real y asistente |

Los permisos también se verifican en los microservicios. La sesión se conserva en `sessionStorage` hasta cerrar la pestaña o cerrar sesión.

## Estado del sistema

El semáforo consulta `/health` de los tres servicios cada 15 segundos: verde si todos responden, amarillo si responde al menos uno y rojo si no responde ninguno. Las consultas y la carga de datos requieren que el backend esté levantado.

## Blue Prism

La vista del asistente está preparada visualmente. El campo de chat permanecerá desactivado hasta recibir el bot y su contrato de integración; el adaptador y las credenciales pertenecerán al backend.

## Logo

La interfaz usa `public/teleton-logo.svg`, copia local del [SVG de Teletón Chile en Wikimedia Commons](https://commons.wikimedia.org/wiki/File:Teleton_Chile_Logo.svg), para funcionar sin internet.
