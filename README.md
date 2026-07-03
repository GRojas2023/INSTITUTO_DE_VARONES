# Sistema de Gestion de Internos - IFV

Aplicacion web para administrar y consultar informacion operativa del Instituto Federal de Varones. El sistema esta armado principalmente con pantallas HTML/CSS/JavaScript y endpoints Node.js que leen y escriben datos en Google Sheets.

## Estado actual

El proyecto ya cuenta con:

- Pantalla de ingreso provisoria en `index.html`.
- Panel principal de Consejo Correccional en `consejo_correccional.html`.
- Modulo de sanciones dentro del panel de Consejo Correccional.
- Pantalla de resumen de interno en `resumen_de_interno.html`.
- Pantalla de alojamiento general en `alojamiento_general.html`.
- Pantalla de parte diario en `parte_diario.html`.
- Pantallas complementarias para visualizacion, atenciones y boleta de bajada.
- Generacion/renderizado de actas de sanciones.
- Endpoints API para consultar, agregar, editar y eliminar datos en Google Sheets.
- Configuracion basica para despliegue en Vercel mediante `vercel.json`.

## Estructura importante

```text
.
|-- index.html
|-- consejo_correccional.html
|-- resumen_de_interno.html
|-- alojamiento_general.html
|-- parte_diario.html
|-- acta_sanciones.html
|-- acta_cosejo.html
|-- server.js
|-- vercel.json
|-- api/
|   |-- _lib/
|   |   |-- sheets.js
|   |   `-- sancion-acta.js
|   |-- consejo.js
|   |-- sanciones.js
|   |-- interno.js
|   |-- parte-diario.js
|   |-- parte-diario-actual.js
|   |-- parte-diario-archivado.js
|   |-- personal-complejo.js
|   |-- tramites.js
|   |-- archivo.js
|   |-- config/[name].js
|   `-- groq/resumen-acta.js
|-- scripts/
|   |-- generate_sancion_acta.ps1
|   `-- render_sancion_acta_html.ps1
`-- templates/
    |-- modelo_acta_sanciones.odt
    `-- modelo_acta_sanciones_reparado.odt
```

## Pantallas principales

- `index.html`: ingreso provisorio. Por ahora permite entrar sin validar credenciales.
- `resumen_de_interno.html`: vista de datos generales del interno, historial y consultas relacionadas.
- `alojamiento_general.html`: vista orientada a alojamiento y distribucion.
- `panel_de_visualizacion.html`: panel visual general.
- `consejo_correccional.html`: modulo administrativo para Consejo Correccional, tramites, configuraciones y sanciones.
- `parte_diario.html`: carga, guardado y recuperacion del parte diario.
- `acta_sanciones.html`: visualizacion/renderizado de actas de sanciones.
- `acta_cosejo.html`: acta relacionada al Consejo Correccional.

## APIs disponibles

Los endpoints estan en la carpeta `api/` y usan `api/_lib/sheets.js` como capa comun de acceso a Google Sheets.

Endpoints principales:

- `GET /api/consejo`: obtiene registros del Consejo Correccional.
- `POST /api/consejo`: agrega un registro.
- `PUT /api/consejo`: actualiza un registro existente.
- `DELETE /api/consejo`: elimina un registro.
- `GET /api/sanciones`: obtiene sanciones.
- `POST /api/sanciones`: agrega una sancion.
- `PUT /api/sanciones`: actualiza una sancion.
- `DELETE /api/sanciones`: elimina una sancion.
- `POST /api/sanciones/acta-html`: genera HTML para un acta de sancion.
- `GET /api/interno`: obtiene internos.
- `GET /api/interno?lpu=...`: busca un interno por LPU.
- `GET /api/personal-complejo`: obtiene opciones de personal y funciones.
- `GET /api/tramites`: obtiene tramites configurados.
- `POST /api/tramites`: agrega un tramite.
- `PUT /api/tramites`: reemplaza la lista de tramites.
- `GET /api/archivo`: obtiene archivos guardados.
- `POST /api/archivo`: guarda HTML u otro contenido archivado.
- `GET /api/parte-diario-actual`: obtiene el parte diario actual.
- `PUT /api/parte-diario-actual`: guarda el parte diario actual.
- `GET /api/parte-diario-archivado`: obtiene el ultimo parte diario archivado.
- `POST /api/parte-diario`: guarda el parte diario en las hojas correspondientes.
- `POST /api/groq/resumen-acta`: genera resumen de acta usando Groq.
- `GET /api/config/consejo-correccional`: obtiene configuracion del Consejo Correccional.
- `PUT /api/config/consejo-correccional`: actualiza configuracion del Consejo Correccional.
- `GET /api/config/centro-evaluacion-procesados`: obtiene configuracion del CEIP.
- `PUT /api/config/centro-evaluacion-procesados`: actualiza configuracion del CEIP.
- `GET /api/config/sanciones-articulos`: obtiene opciones de articulos para sanciones.
- `GET /api/config/sanciones-calificaciones`: obtiene opciones de calificaciones para sanciones.

## Fuente de datos

La aplicacion usa Google Sheets como base de datos. El ID de la planilla esta definido en el codigo:

```text
1DuK6GHozJGHSUQ7TVDIKODDm5XJnNpq9k9lheHWLvHE
```

Hojas/rangos usados actualmente:

- `consejo`
- `SANCIONES_RESUELTA`
- `internos`
- `archivo`
- `parte_diario_actual`
- `PERSONAL DE SERVICIO`
- `PERSONAL`
- `NOVEDADES`
- `ALOJAMIENTO`
- `OBSERVACIONES`
- `PERSONAL_COMPLEJO`
- `Configuracion`

## Credenciales y variables de entorno

No subir credenciales reales a GitHub.

Para el modo Vercel/API, se esperan estas variables:

```env
GOOGLE_CLIENT_EMAIL=
GOOGLE_PRIVATE_KEY=
GOOGLE_TOKEN_URI=https://oauth2.googleapis.com/token
GROQ_API_KEY=
GROQ_MODEL=llama-3.1-8b-instant
```

Notas:

- `GOOGLE_CLIENT_EMAIL` y `GOOGLE_PRIVATE_KEY` vienen de una cuenta de servicio de Google Cloud.
- La cuenta de servicio debe tener permiso sobre la planilla de Google Sheets.
- `GOOGLE_PRIVATE_KEY` debe conservar los saltos de linea. En Vercel normalmente se carga con `\n`.
- `GROQ_API_KEY` solo hace falta para el resumen automatico de actas.

Para el modo local con `server.js`, el codigo busca un archivo:

```text
credenciales.json
```

Ese archivo no debe subirse a GitHub.

## Ejecucion local

Requisitos:

- Node.js moderno, recomendado Node 18 o superior.
- Acceso a internet para consultar Google Sheets y, si corresponde, Groq.
- Credenciales validas de Google.

Como no hay `package.json` actualmente, no hay dependencias npm declaradas. El servidor usa modulos nativos de Node.

Para correr localmente:

```bash
node server.js
```

Luego abrir:

```text
http://127.0.0.1:8780/consejo_correccional.html
```

El servidor tambien sirve archivos HTML estaticos desde la raiz del proyecto.

## Despliegue

El proyecto incluye `vercel.json` con:

- `cleanUrls` activado.
- `trailingSlash` desactivado.
- Cabeceras basicas de seguridad.

Para desplegar en Vercel, configurar antes las variables de entorno necesarias para Google y Groq.

## Archivos que conviene no subir

Agregar o mantener fuera del repositorio:

```gitignore
credenciales.json
.env
.env.local
node_modules/
__pycache__/
*.log
```

## Puntos pendientes o a revisar

- Agregar autenticacion real al ingreso.
- Crear `package.json` si se agregan dependencias o scripts formales.
- Crear `.env.example` para documentar variables sin exponer claves.
- Revisar textos con problemas de codificacion, por ejemplo algunos caracteres acentuados.
- Separar configuracion sensible del codigo, especialmente IDs o rutas que puedan cambiar.
- Agregar pruebas o una guia de verificacion manual para los flujos principales.
- Confirmar el flujo definitivo de despliegue entre servidor local y endpoints de Vercel.

## Guia para un nuevo colaborador

Para empezar a trabajar:

1. Clonar el repositorio.
2. Pedir al responsable las credenciales reales por un canal seguro.
3. Configurar `credenciales.json` para uso local o variables de entorno para Vercel.
4. Ejecutar `node server.js`.
5. Abrir `http://127.0.0.1:8780/consejo_correccional.html`.
6. Probar primero consultas de solo lectura antes de modificar datos reales.

Antes de subir cambios:

- No incluir credenciales.
- Revisar que no se haya modificado informacion sensible.
- Probar las pantallas afectadas.
- Describir claramente que modulo se cambio.
