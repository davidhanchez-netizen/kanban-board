This is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://nextjs.org/docs/app/api-reference/cli/create-next-app).

## Autenticación, permisos y Neon

### 1. Configurar variables de entorno

Crea `.env.local` a partir de `.env.example` y conserva el `DATABASE_URL` de Neon que ya usa el proyecto. Define también:

- `AUTH_SECRET`: secreto aleatorio para firmar sesiones (genéralo con `node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"`).
- `AUTH_GOOGLE_ID` y `AUTH_GOOGLE_SECRET`: credenciales OAuth de Google.
- `ADMIN_EMAILS`: lista separada por comas de correos autorizados como administradores.
- `PUSHER_APP_ID`, `PUSHER_KEY`, `PUSHER_SECRET` y `PUSHER_CLUSTER`: credenciales de una aplicación de Pusher Channels. Configura los mismos valores en `.env.local` y en las variables de entorno de Vercel (Production, Preview y Development, según corresponda). No compartas ni expongas `PUSHER_SECRET`.

Registra `http://localhost:3000/api/auth/callback/google` como callback de Google. En producción usa `https://TU-DOMINIO/api/auth/callback/google`.

Los usuarios permitidos por `ADMIN_EMAILS` reciben el rol `ADMIN` al iniciar sesión; el resto queda como `MEMBER`. Para promover a otro administrador sin cambiar esa lista, ejecuta en Neon:

```sql
UPDATE users SET role = 'ADMIN' WHERE lower(email) = lower('persona@empresa.com');
```

### 2. Aplicar la migración en Neon

La base ya existente debe conservar sus tablas `board_columns` y `tasks`. Ejecuta una sola vez el contenido de [`drizzle/0001_auth_and_task_assignments.sql`](./drizzle/0001_auth_and_task_assignments.sql) en el SQL Editor de Neon. La migración crea las tablas requeridas por Auth.js, el enum de roles y la relación opcional `tasks.assignee_id`; también mantiene los campos `position` y `column_id` como `bigint`. No ejecutes la migración base `0000` sobre una base que ya tenga esas tablas.

Para añadir comentarios sin modificar los datos actuales, ejecuta una sola vez [`drizzle/0002_task_comments.sql`](./drizzle/0002_task_comments.sql) en el SQL Editor de Neon. Solo crea la tabla `comments` y sus claves foráneas con borrado en cascada.

Para crear espacios de trabajo persistentes y adjuntos de comentarios, ejecuta una sola vez [`drizzle/0003_workspaces_and_comment_attachments.sql`](./drizzle/0003_workspaces_and_comment_attachments.sql) después de las migraciones anteriores. La migración conserva los espacios existentes y asocia las columnas actuales a sus espacios correspondientes. Los adjuntos aceptan imágenes, PDF, texto y CSV de hasta 2 MB por archivo (máximo 5 por comentario); se guardan como Base64 en Neon.

Para habilitar el perfil y los ajustes persistentes, ejecuta una sola vez [`drizzle/0004_user_preferences.sql`](./drizzle/0004_user_preferences.sql) después de las migraciones anteriores. Esta migración es aditiva y crea preferencias vinculadas a `users` con borrado en cascada; no altera tareas, comentarios ni espacios existentes.

Para habilitar Agentes, Estrategia y Conocimientos, ejecuta una sola vez [`drizzle/0005_workspace_features.sql`](./drizzle/0005_workspace_features.sql) después de las migraciones anteriores. Añade configuraciones y registros de actividad de agentes, metas por espacio y artículos Markdown; sus filas se eliminan en cascada al eliminar el espacio. Personas utiliza los perfiles y tareas existentes y no requiere tablas nuevas.

Para añadir nombre, descripción, icono y color a los espacios existentes, ejecuta una sola vez [`drizzle/0006_workspace_metadata.sql`](./drizzle/0006_workspace_metadata.sql) después de las migraciones anteriores.

Para habilitar proyectos privados, colaboradores e invitaciones pendientes, múltiples asignados, subtareas y eventos de actividad, ejecuta una sola vez [`drizzle/0007_project_management.sql`](./drizzle/0007_project_management.sql) después de las migraciones anteriores. La migración conserva los proyectos existentes como públicos, copia las asignaciones actuales a la nueva relación múltiple y añade invitaciones pendientes, subtareas y eventos al historial de comentarios.

Las tareas previas sin `assignee_id` siguen visibles para los usuarios con acceso al proyecto, pero no se podrán asignar automáticamente a miembros hasta que un administrador las asigne. Los proyectos públicos siguen visibles para usuarios autenticados; los privados se muestran solo a su creador y colaboradores. Las operaciones de escritura y la autorización del canal en tiempo real también se validan en servidor.

### 3. Iniciar y comprobar

Instala dependencias y ejecuta `npm run dev`. Los usuarios inician sesión con Google. Los espacios de trabajo creados desde el botón `+` de la sección Trabajo se comparten con los usuarios autenticados. El panel de asignación aparece a los administradores para asignar tareas a perfiles existentes. Los miembros pueden ver y editar las tareas del equipo, crear nuevas tareas (asignadas automáticamente a ellos) y cambiar columnas o estados; la asignación y eliminación de tareas siguen siendo exclusivas de administradores. Todos los usuarios autenticados pueden gestionar columnas y comentar en tareas. Los comentarios aceptan Markdown; el contenido HTML arbitrario no se interpreta.

Las rutas de Auth.js están en `/api/auth/*`. `/api/columns`, `/api/tasks` y `/api/comments` exigen sesión. Los miembros pueden editar los detalles de las tareas, pero no reasignarlas; la eliminación de tareas y la lista de usuarios/asignables siguen siendo exclusivas de administradores. Los proyectos incluyen vistas de tablero, lista y resumen, miembros seleccionables por cuenta o correo, fechas límite, prioridades, múltiples asignados, subtareas con progreso y un historial automático de cambios. Las invitaciones por correo quedan pendientes y conceden acceso cuando la persona inicia sesión con esa dirección; no se envía un correo automáticamente porque el proyecto no tiene un proveedor de correo configurado.

El menú de usuario incluye el perfil y los ajustes persistentes en `user_preferences`, vinculados únicamente al `user_id` de la sesión. Las preferencias de pantalla y apariencia nunca se publican por Pusher; solo se difunden cambios colaborativos del perfil. Los temas incluyen Aura/Índigo, Cyberpunk/Neón, Bosque/Esmeralda, Atardecer/Cálido y Mínimo/Monocromático, con acentos de navegación personales. Las fotos de perfil (máximo 1 MB) y los audios de pronunciación (máximo 3 MB) se guardan en Neon como Data URL. La bandeja muestra las tareas asignadas al usuario; no es todavía un sistema de notificaciones individuales. Los agentes activados ejecutan automatizaciones al crearse o actualizarse tareas y también se pueden ejecutar manualmente desde el panel; el asignador distribuye tareas pendientes sin responsable, el resumidor registra métricas del espacio y el detector registra vencimientos próximos. Los artículos de Conocimientos y las metas de Estrategia son compartidos por espacio de trabajo y se sincronizan por Pusher cuando está configurado. Personas muestra los miembros conocidos por la aplicación y sus tareas pendientes en el espacio. Las notificaciones por correo e integraciones externas de Slack/Teams, invitaciones por correo, cierre de otras sesiones y eliminación de cuenta requieren servicios o flujos de seguridad que no están configurados.

### Actualizaciones en tiempo real

El tablero usa Pusher Channels con un canal privado por espacio (`private-workspace-{id}`). Las rutas de servidor publican eventos de creación, actualización, movimiento y eliminación de tareas y columnas, además de comentarios y eventos de actividad. La autorización requiere una sesión válida y acceso al proyecto; los espacios privados solo permiten a sus miembros suscribirse. Para activar esta función, crea una app de Pusher Channels y define `PUSHER_APP_ID`, `PUSHER_KEY`, `PUSHER_SECRET` y `PUSHER_CLUSTER` en `.env.local` y en Vercel. El ID de aplicación y la clave pública se entregan al cliente autenticado desde `/api/pusher/config`; el secreto permanece solo en el servidor. Si no se configuran las credenciales, el tablero y sus cambios guardados continúan funcionando, pero la suscripción en tiempo real no estará disponible.

## Getting Started

First, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

You can start editing the page by modifying `app/page.tsx`. The page auto-updates as you edit the file.

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.
