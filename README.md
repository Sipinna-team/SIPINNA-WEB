# SIPINNA Web

Aplicación web de SIPINNA para reportar posibles casos de trabajo infantil y consultar su seguimiento. Incluye un portal ciudadano y herramientas para que el personal gestione reportes, consulte indicadores y ubique casos en un mapa.

## Funcionalidades

- Registro de ciudadanos, inicio de sesión con correo o teléfono y acceso con Google.
- Recuperación de contraseña, aceptación de invitaciones y administración de la cuenta.
- Captura de reportes con ubicación y consulta de seguimiento por folio.
- Consulta de reportes del ciudadano.
- Panel de indicadores, gestión de reportes y agrupación en casos para el personal.
- Mapa interactivo, exportación de información a PDF y registro de auditoría.

Las funciones disponibles dependen de la sesión, del rol (`citizen`, `alimentador` o `administrador`) y de los permisos que valida el backend.

## Tecnologías

- React 19 y TypeScript.
- Vite 8 para desarrollo y compilación.
- React Router para navegación.
- Tailwind CSS 4 y estilos CSS propios.
- Mapbox GL JS para mapas y geocodificación.
- Supabase Auth para el acceso con Google.
- jsPDF y AutoTable para exportación a PDF.

## Requisitos

- Node.js 20.19 o superior dentro de la versión 20, o Node.js 22.12 o superior, compatible con Vite 8.
- npm.
- API de SIPINNA disponible; su implementación se mantiene en el proyecto `go-service-sipinna`.
- URL y clave pública de un proyecto Supabase, y un token público de Mapbox.

## Instalación y desarrollo

Desde la raíz del proyecto:

```bash
npm ci
```

Crea un archivo `.env` con los valores correspondientes a tu entorno:

```dotenv
VITE_API_URL=https://api.ejemplo.com
VITE_SUPABASE_URL=https://tu-proyecto.supabase.co
VITE_SUPABASE_ANON_KEY=tu_clave_publica_de_supabase
VITE_MAP_BOX_TOKEN=tu_token_publico_de_mapbox
# Opcional: filtro de zona para el panel y la lista de reportes.
VITE_REPORTS_ZONE=
```

| Variable | Uso |
| --- | --- |
| `VITE_API_URL` | URL base de la API, sin `/` final; el cliente añade las rutas como `/auth/me`. |
| `VITE_SUPABASE_URL` | URL del proyecto Supabase utilizado para el acceso con Google. |
| `VITE_SUPABASE_ANON_KEY` | Clave pública `anon` del proyecto Supabase. |
| `VITE_MAP_BOX_TOKEN` | Token público de Mapbox para mapas y búsqueda de ubicaciones. |
| `VITE_REPORTS_ZONE` | Filtro opcional de zona para el dashboard y la gestión de reportes. |

Las variables `VITE_*` se incorporan al código que recibe el navegador. Usa únicamente claves públicas; nunca incluyas una clave `service_role` de Supabase ni secretos del backend. El archivo `.env` está excluido de Git.

Inicia el servidor de desarrollo:

```bash
npm run dev
```

Abre la dirección que muestre Vite en la terminal, normalmente `http://localhost:5173`. Reinicia el servidor después de modificar las variables de entorno.

### Autenticación y conexión con la API

La sesión de la aplicación se mantiene mediante una cookie `httpOnly` emitida por el backend. El cliente envía las peticiones con `credentials: 'include'` y restaura la sesión mediante `/auth/me`.

Configura en el backend el origen permitido de la web y el soporte de credenciales en CORS. La configuración de las cookies debe ser compatible con los dominios y el protocolo utilizados en cada entorno.

Para el acceso con Google, habilita el proveedor en Supabase y autoriza la URL de retorno de cada entorno:

```text
http://localhost:5173/auth/callback
https://tu-dominio.com/auth/callback
```

La página de retorno intercambia el código de Supabase y envía el token a `/auth/google` para obtener la sesión del backend.

## Comandos

| Comando | Descripción |
| --- | --- |
| `npm run dev` | Inicia el servidor de desarrollo. |
| `npm run build` | Comprueba TypeScript y genera la versión de producción en `dist/`. |
| `npm run preview` | Sirve localmente la compilación de producción. |
| `npm run lint` | Ejecuta ESLint. |

El proyecto no tiene un comando de pruebas automatizadas configurado en `package.json`.

## Rutas principales

| Ruta | Pantalla |
| --- | --- |
| `/` | Redirección según la sesión y el tipo de usuario. |
| `/inicio` | Inicio ciudadano. |
| `/reportar` | Captura de un reporte. |
| `/mis-reportes` | Reportes del ciudadano. |
| `/consultar-folio` | Consulta de seguimiento por folio. |
| `/aviso-privacidad` | Aviso de privacidad. |
| `/login`, `/register`, `/forgot-password` | Acceso, registro y recuperación de contraseña. |
| `/auth/callback` | Retorno del acceso con Google. |
| `/aceptar-invitacion` | Aceptación de invitaciones. |
| `/mi-cuenta` | Administración de la cuenta; requiere sesión. |
| `/dashboard`, `/reports`, `/map` | Indicadores, reportes y mapa; requieren sesión y los permisos correspondientes en la API. |

## Estructura

```text
src/
  assets/       Recursos gráficos
  components/   Componentes compartidos y protección de rutas
  context/      Estado y acciones de autenticación
  lib/          Cliente de API, tipos y utilidades
  pages/        Pantallas de la aplicación
  App.tsx       Definición de rutas
  main.tsx      Punto de entrada
vite.config.ts  Configuración de Vite y alias @ hacia src/
vercel.json     Reescritura de rutas para la SPA
```

## Compilación y despliegue

```bash
npm run lint
npm run build
npm run preview
```

Publica el contenido de `dist/` en un alojamiento de archivos estáticos. Configura las variables de entorno antes de compilar; cualquier cambio en ellas requiere generar una nueva compilación.

En Vercel, utiliza `npm run build` como comando de compilación y `dist` como directorio de salida. El archivo `vercel.json` incluye la reescritura hacia `index.html` necesaria para abrir directamente las rutas de React Router. En otros alojamientos configura una reescritura equivalente.

Antes de publicar, comprueba la conexión con la API, las cookies de sesión, las URLs de retorno de Supabase y las restricciones de dominio del token de Mapbox.
