This is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://nextjs.org/docs/app/api-reference/cli/create-next-app).

## Autenticación, permisos y Neon

### 1. Configurar variables de entorno

Crea `.env.local` a partir de `.env.example` y conserva el `DATABASE_URL` de Neon que ya usa el proyecto. Define también:

- `AUTH_SECRET`: secreto aleatorio para firmar sesiones (genéralo con `node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"`).
- `AUTH_GOOGLE_ID` y `AUTH_GOOGLE_SECRET`: credenciales OAuth de Google.
- `ADMIN_EMAILS`: lista separada por comas de correos autorizados como administradores.

Registra `http://localhost:3000/api/auth/callback/google` como callback de Google. En producción usa `https://TU-DOMINIO/api/auth/callback/google`.

Los usuarios permitidos por `ADMIN_EMAILS` reciben el rol `ADMIN` al iniciar sesión; el resto queda como `MEMBER`. Para promover a otro administrador sin cambiar esa lista, ejecuta en Neon:

```sql
UPDATE users SET role = 'ADMIN' WHERE lower(email) = lower('persona@empresa.com');
```

### 2. Aplicar la migración en Neon

La base ya existente debe conservar sus tablas `board_columns` y `tasks`. Ejecuta una sola vez el contenido de [`drizzle/0001_auth_and_task_assignments.sql`](./drizzle/0001_auth_and_task_assignments.sql) en el SQL Editor de Neon. La migración crea las tablas requeridas por Auth.js, el enum de roles y la relación opcional `tasks.assignee_id`; también mantiene los campos `position` y `column_id` como `bigint`. No ejecutes la migración base `0000` sobre una base que ya tenga esas tablas.

Para añadir comentarios sin modificar los datos actuales, ejecuta una sola vez [`drizzle/0002_task_comments.sql`](./drizzle/0002_task_comments.sql) en el SQL Editor de Neon. Solo crea la tabla `comments` y sus claves foráneas con borrado en cascada.

Para crear espacios de trabajo persistentes y adjuntos de comentarios, ejecuta una sola vez [`drizzle/0003_workspaces_and_comment_attachments.sql`](./drizzle/0003_workspaces_and_comment_attachments.sql) después de las migraciones anteriores. La migración conserva los espacios existentes y asocia las columnas actuales a sus espacios correspondientes. Los adjuntos aceptan imágenes, PDF, texto y CSV de hasta 2 MB por archivo (máximo 5 por comentario); se guardan como Base64 en Neon.

Las tareas previas sin `assignee_id` siguen visibles para los usuarios autenticados, pero no se podrán asignar automáticamente a miembros hasta que un administrador las asigne. Las operaciones de escritura se autorizan también en servidor.

### 3. Iniciar y comprobar

Instala dependencias y ejecuta `npm run dev`. Los usuarios inician sesión con Google. Los espacios de trabajo creados desde el botón `+` de la sección Trabajo se comparten con los usuarios autenticados. El panel de asignación aparece a los administradores para asignar tareas a perfiles existentes. Los miembros pueden ver y editar las tareas del equipo, crear nuevas tareas (asignadas automáticamente a ellos) y cambiar columnas o estados; la asignación y eliminación de tareas siguen siendo exclusivas de administradores. Todos los usuarios autenticados pueden gestionar columnas y comentar en tareas. Los comentarios aceptan Markdown; el contenido HTML arbitrario no se interpreta.

Las rutas de Auth.js están en `/api/auth/*`. `/api/columns`, `/api/tasks` y `/api/comments` exigen sesión. Los miembros pueden editar los detalles de las tareas, pero no reasignarlas; la eliminación de tareas y la lista de usuarios/asignables siguen siendo exclusivas de administradores.

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
