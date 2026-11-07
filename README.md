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

Reinicia Vite tras cambiar estas variables. El backend debe incluir el origen del frontend en `CORS_ORIGINS`. No coloques contraseñas ni `INTERNAL_SERVICE_KEY` en variables `VITE_*`, porque quedan visibles en el navegador.

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

La interfaz usa el [SVG de Teletón Chile alojado en Wikimedia Commons](https://commons.wikimedia.org/wiki/File:Teleton_Chile_Logo.svg). Para funcionamiento sin internet, agrega un recurso autorizado a `public/` y actualiza las dos rutas de imagen en `src/App.tsx`.
