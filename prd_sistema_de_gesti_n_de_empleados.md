# PRD: Sistema de Gestión de Empleados (Employee Management System)

## 1. Visión General
El Sistema de Gestión de Empleados es una plataforma CRUD (Crear, Leer, Actualizar, Borrar) administrativa diseñada para centralizar y gestionar la información crítica del personal. El sistema permite el seguimiento detallado de la situación legal, alojamiento, historial médico/atenciones, novedades, calificaciones y sanciones de cada empleado en un entorno profesional y coherente.

## 2. Objetivos del Proyecto
- Centralizar la información del personal en una única fuente de verdad.
- Facilitar el registro estandarizado de eventos (atenciones, novedades, sanciones).
- Proporcionar una interfaz intuitiva para la consulta de perfiles de empleados.
- Asegurar la consistencia visual y terminológica mediante un sistema de diseño profesional.

## 3. Público Objetivo
- Administradores de Recursos Humanos.
- Gerentes de Operaciones y Planta.
- Personal Administrativo encargado del seguimiento de personal.

## 4. Requisitos Funcionales

### 4.1. Gestión de Lista de Empleados
- Visualización tabular de la nómina activa.
- Información clave: Foto, Nombre, Puesto, ID de Empleado, Estado (Activo, Suspendido, En Licencia).
- Acceso directo a perfiles individuales.

### 4.2. Perfil de Empleado e Historiales
- **Información Básica:** Foto de perfil, nombre completo, puesto, ID, correo, teléfono, fecha de ingreso y ubicación.
- **Módulos de Historial (Secciones Expandibles):**
    - **Situación Legal:** Seguimiento de estados de visa y certificados de cumplimiento.
    - **Historial de Alojamiento:** Gestión de residencias, unidades ocupadas y fechas de estancia.
    - **Historial de Atenciones:** Registro de exámenes físicos y sesiones médicas.
    - **Novedades:** Documentación de promociones, cambios de rol o incidentes menores.
    - **Historial de Calificaciones:** Registro de evaluaciones de desempeño y certificaciones técnicas.
    - **Historial de Sanciones:** Control de advertencias y faltas disciplinarias.
- **Notas Administrativas:** Campo de texto libre para observaciones generales con guardado global.

### 4.3. Registro de Datos (CRUD)
- Formularios modales para la creación de nuevos registros.
- Uso de listas desplegables (dropdowns) para estandarizar categorías y motivos.
- Carga de evidencia (archivos/documentos) asociada a cada registro.

## 5. Especificaciones de Diseño
- **Sistema de Diseño:** Professional Admin System (Inter, Paleta Azul Corporativa #0f4c81).
- **Idioma:** Español (Interfaz completa).
- **Layout:** Panel lateral de navegación fijo, barra superior de búsqueda y área de contenido centralizada.
- **Componentes Clave:** Acordeones expandibles para historiales, tarjetas de estadísticas en el roster, y diálogos modales para formularios.

## 6. Mapa de Pantallas
1. **Lista de Empleados:** Dashboard principal con métricas generales y tabla de personal.
2. **Perfil de Empleado:** Vista detallada con todos los módulos de historial expandibles.
3. **Formulario de Registro:** Interfaz de entrada de datos para novedades y atenciones.

## 7. Roadmap Futuro (Opcional)
- Sistema de búsqueda avanzada y filtros por departamento.
- Exportación de perfiles a PDF.
- Notificaciones automáticas para vencimientos de documentos legales.
