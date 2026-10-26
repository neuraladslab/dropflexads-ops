# Guía de comandos `npm run`

Todos se ejecutan desde la carpeta del proyecto. Los que necesitan base de datos leen `POSTGRES_URL` (y las demás claves) de `.env.local`, así que **apuntan a la base que esté ahí**: confirma si es desarrollo o producción antes de correr uno que escribe.

> En Claude Code, los comandos que piden contraseña o correo de forma interactiva se escriben con `!` delante (por ejemplo `! npm run user:create`) para que la contraseña no quede en la conversación.

Leyenda: 🟢 solo lee · 🟡 escribe datos · 🔴 delicado (cierra sesiones o cambia accesos).

## Día a día

| Comando | Qué hace |
|---|---|
| `npm run dev` | Levanta la app en desarrollo (http://localhost:3000) con recarga automática. |
| `npm run build` | Compila la app como en producción. Úsalo antes de subir para detectar errores. |
| `npm start` | Sirve la app ya compilada (requiere `npm run build` antes). |

## Verificación antes de subir cambios

| Comando | Qué hace |
|---|---|
| `npm run verificar` 🟢 | El chequeo completo: tipos (`tsc`), lint de variables no definidas y todas las pruebas. **Córrelo siempre antes de un commit.** |
| `npm test` 🟢 | Solo las pruebas automáticas (dominio, lectura de Dropi y Meta, IA). |
| `npm run lint` 🟢 | Revisión de estilo y errores con ESLint sobre todo el proyecto. |
| `npm run lint:undef` 🟢 | Busca variables sin definir en `src/lib`, `src/app/api` y `scripts`. |
| `npm run verificar:cifras` 🟢 | Calcula la misma cifra por distintos caminos y comprueba que coincidan las pantallas (usa `USER_ID=1`, o el que indiques). |
| `npm run verificar:empresas` 🟡 | Prueba el aislamiento entre empresas y los límites del superadmin (no puede llamar a las rutas de datos): crea una empresa y un superadmin temporales y los borra. **Solo contra la base de desarrollo.** |
| `npm run security:smoke` 🟢 | Pruebas de seguridad contra una instancia en marcha (abre `npm run dev` en otra terminal; para otra URL: `BASE_URL=https://… npm run security:smoke`). |
| `npm run security:audit` 🟢 | `npm audit` de las dependencias de producción: lista vulnerabilidades conocidas. |

## Base de datos

| Comando | Qué hace |
|---|---|
| `npm run db:migrate` 🟡 | Aplica `database/schema.sql`. Es idempotente (se puede repetir sin dañar nada): crea tablas y columnas nuevas, y la empresa «Portal x» si aún no hay empresas. **Córrelo en cada base antes de desplegar código nuevo.** Los avisos «ya existe, skipping» son normales. |

## Usuarios, empresas y accesos

| Comando | Qué hace |
|---|---|
| `npm run user:create` 🟡 | Crea un usuario (no hay registro público). Pide correo y contraseña (mínimo 12 caracteres). |
| `npm run superadmin -- correo@dominio.com` 🔴 | Da el rol de **superadmin** (administra la plataforma: empresas y sus administradores; **no ve datos de ninguna empresa**). Solo para un usuario que no sea administrador de una empresa: créalo antes con `user:create`. Cierra sus sesiones abiertas. |
| `npm run superadmin -- correo@dominio.com --quitar` 🔴 | Le quita el rol de superadmin (queda como miembro). |
| `npm run user:passwd` 🔴 | Cambia la contraseña de un usuario y cierra todas sus sesiones. |
| `npm run user:disable -- correo@dominio.com` 🔴 | Deshabilita un usuario y cierra sus sesiones (agrega `--enable` para rehabilitarlo). |
| `npm run auth:2fa-reset` 🔴 | Quita la verificación en dos pasos de una cuenta (si perdió el teléfono y los códigos de recuperación). Cierra sus sesiones. |
| `npm run auth:unlock` 🟡 | Quita los bloqueos de inicio de sesión (por cuenta, por IP y el freno global) para poder entrar de inmediato. No toca contraseñas ni sesiones. |
| `npm run auth:revoke-all` 🔴 | Botón de pánico: cierra **todas** las sesiones de **todos** los usuarios. |

Las empresas y sus administradores se crean desde la app (menú **Empresas**, solo superadmin), no por comando. Una contraseña que pone el superadmin (alta o restablecimiento) obliga a cambiarla en el primer ingreso; los usuarios creados con `user:create` o `user:passwd` no tienen esa obligación.

Cada persona gestiona sus dispositivos recordados en la app: **Seguridad** (menú lateral). Cambiar la contraseña, `user:passwd` o `user:disable` los invalidan.

## Claves de la app

| Comando | Qué hace |
|---|---|
| `npm run auth:init` 🟡 | Agrega `AUTH_SECRET` (la clave que firma las sesiones) a `.env.local` si falta. No cambia nada más. |
| `npm run auth:secret` 🟢 | Imprime un secreto nuevo para pegarlo como `AUTH_SECRET` en Vercel. Usa uno distinto al local. Rotarlo cierra todas las sesiones. |

## Datos de prueba y utilidades

| Comando | Qué hace |
|---|---|
| `npm run demo:creativos` 🟡 | Crea la campaña «DEMO \| Prueba creativos» con creativos, conjuntos y gasto ficticios para ver la pantalla Creativos con datos. Si ya existe, la rehace. |
| `npm run demo:creativos -- borrar` 🟡 | Borra todo lo de esa prueba. |
| `npm run captura -- /ruta [/otra]` 🟢 | Toma capturas de pantallas con Playwright (la app debe estar corriendo). Con `DFA_EMAIL` y `DFA_PASSWORD` entra antes; guarda en `./capturas` o en `SHOTS_DIR`. |

## Receta: dejar una base lista para un despliegue

1. `npm run verificar` y `npm run build` en tu máquina.
2. Con `.env.local` apuntando a la base destino: `npm run db:migrate`.
3. Si es la primera vez con empresas: `npm run user:create` (el usuario de plataforma) y luego `npm run superadmin -- ese-correo@dominio.com`.
4. Subir el código.

## Notas

- `npm run security:smoke`, `captura` y `verificar:cifras` leen o prueban pero no deberían modificar datos reales.
- Algunos mensajes de error mencionan `npm run data:rekey`; ese comando **no existe todavía** en este proyecto.
