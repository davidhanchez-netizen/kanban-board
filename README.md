This is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://nextjs.org/docs/app/api-reference/cli/create-next-app).

## Autenticación, permisos y Neon

### 1. Configurar variables de entorno

Crea `.env.local` a partir de `.env.example` y conserva el `DATABASE_URL` de Neon que ya usa el proyecto. Define también:

- `AUTH_SECRET`: secreto aleatorio para firmar sesiones (genéralo con `node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"`).
- `AUTH_GOOGLE_ID` y `AUTH_GOOGLE_SECRET`: credenciales OAuth de Google.
- `AUTH_APPLE_ID` y `AUTH_APPLE_SECRET`: identificador del servicio y client secret JWT de Sign in with Apple.
- `ADMIN_EMAILS`: lista separada por comas de correos autorizados como administradores.

Registra `http://localhost:3000/api/auth/callback/google` como callback de Google. En producción usa `https://TU-DOMINIO/api/auth/callback/google`. Apple requiere un dominio HTTPS verificado y usa `https://TU-DOMINIO/api/auth/callback/apple`; Apple no admite `localhost` por HTTP. El client secret de Apple es un JWT generado con la clave privada de Sign in with Apple, no la clave privada en sí.

Los usuarios permitidos por `ADMIN_EMAILS` reciben el rol `ADMIN` al iniciar sesión; el resto queda como `MEMBER`. Para promover a otro administrador sin cambiar esa lista, ejecuta en Neon:

```sql
UPDATE users SET role = 'ADMIN' WHERE lower(email) = lower('persona@empresa.com');
```

### 2. Aplicar la migración en Neon

La base ya existente debe conservar sus tablas `board_columns` y `tasks`. Ejecuta una sola vez el contenido de [`drizzle/0001_auth_and_task_assignments.sql`](./drizzle/0001_auth_and_task_assignments.sql) en el SQL Editor de Neon. La migración crea las tablas requeridas por Auth.js, el enum de roles y la relación opcional `tasks.assignee_id`; también mantiene los campos `position` y `column_id` como `bigint`. No ejecutes la migración base `0000` sobre una base que ya tenga esas tablas.

Las tareas previas no tienen `assignee_id` y por seguridad no se muestran a miembros hasta que un administrador las asigne. Las columnas siguen siendo visibles para los usuarios autenticados, pero sus operaciones de escritura y las tareas se autorizan también en servidor.

### 3. Iniciar y comprobar

Instala dependencias y ejecuta `npm run dev`. Los usuarios inician sesión con Google o Apple. El panel de asignación aparece a los administradores para asignar tareas a perfiles existentes. Los miembros solo reciben desde `/api/tasks` las tareas asignadas a su propio usuario y pueden cambiar su columna o estado.

Las rutas de Auth.js están en `/api/auth/*`. `/api/columns` exige sesión para leer y rol `ADMIN` para escribir; `/api/tasks` exige sesión, filtra por asignación para miembros y restringe los cambios de miembros a columna/estado. La lista de asignables `/api/users` solo está disponible para administradores.

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
