# Countdown para el Endgame

Página de cuenta regresiva a las 19:00 con hidratación desde las 14:00, ventana de snack de 17:00 a 17:30, y un contador de vasos por persona (meta: 8) compartido por los 5 del equipo.

Corre como un Worker de Cloudflare: sirve la página estática desde `public/` y guarda los vasos en Workers KV.

```
public/index.html          la página
src/index.js               el Worker (API + assets)
wrangler.jsonc             configuración: equipo, meta, zona horaria, KV
.github/workflows/deploy.yml   deploy automático (solo para la opción B)
```

## Antes de conectar nada: crear el KV

Esto se hace una sola vez y no depende de GitHub. Dos caminos, el que te quede cómodo:

Desde la terminal:

```bash
npm install
npx wrangler login
npx wrangler kv namespace create AGUA
```

O desde el panel de Cloudflare: **Storage & Databases > KV > Create namespace**, nombre `AGUA`.

En los dos casos te queda un `id`. Copialo en `wrangler.jsonc`, reemplazando `PEGA_ACA_EL_ID_DEL_NAMESPACE`, y commiteá ese cambio. El id no es una credencial: sin acceso a tu cuenta no sirve de nada, así que puede vivir en el repo tranquilo.

## Subir el repo

```bash
git init
git add .
git commit -m "Countdown para el Endgame"
git branch -M main
git remote add origin https://github.com/<usuario>/<repo>.git
git push -u origin main
```

Si corriste `npm install`, va a haber un `package-lock.json`: commitealo. El `.gitignore` ya deja afuera `node_modules/`, `.wrangler/` y `.dev.vars`.

## Deploy desde GitHub: elegí una

### Opción A — Workers Builds (Cloudflare tira del repo)

No necesitás tokens ni workflows: Cloudflare se conecta a GitHub y despliega solo en cada push.

1. En el panel de Cloudflare, **Workers & Pages > Create application > Import a repository**.
2. Autorizá la app de GitHub y elegí el repo.
3. En la configuración del build: comando de build vacío (este proyecto no compila nada), comando de deploy `npx wrangler deploy`, rama de producción `main`.
4. **Save and Deploy**.

Si elegís esta opción, **borrá `.github/workflows/deploy.yml`**, porque si no cada push dispara dos deploys.

### Opción B — GitHub Actions

El workflow ya está escrito en `.github/workflows/deploy.yml`. Solo faltan dos secretos en el repo, en **Settings > Secrets and variables > Actions**:

- `CLOUDFLARE_API_TOKEN`: se crea en el panel de Cloudflare, en API Tokens, con la plantilla **Edit Cloudflare Workers**.
- `CLOUDFLARE_ACCOUNT_ID`: aparece en el panel, en la sección de Workers.

Con eso, cada push a `main` despliega. También podés dispararlo a mano desde la pestaña Actions.

### Opción C — a mano, sin CI

```bash
npx wrangler deploy
```

Sirve igual para probar algo rápido aunque después uses A o B.

## Después del deploy

Queda en `https://endgame-countdown.<tu-subdominio>.workers.dev`. Podés apuntarle un dominio propio desde el panel, en la sección de rutas del Worker.

Para probar antes de subir, `npx wrangler dev` levanta todo local con un KV simulado.

Dos cosas que **no** van al repo: si usás `TEAM_TOKEN`, se carga con `npx wrangler secret put TEAM_TOKEN` o desde el panel del Worker. Los secretos no se leen de `wrangler.jsonc`.

## El equipo y la meta

Están en `wrangler.jsonc`:

```jsonc
"vars": {
  "MEMBERS": "Joaco,Jere,Maxi,Yago,Nacho",
  "GOAL": "8",
  "TIMEZONE": "America/Argentina/Buenos_Aires"
}
```

Esa lista es la única fuente: el Worker valida contra ella y la página dibuja los botones a partir de ella. `GOAL` es la meta diaria de vasos por persona; si la cambiás, la fila de vasos se redibuja sola. Cualquier cambio acá necesita un deploy nuevo (o sea: un push, si conectaste GitHub).

## Cómo funciona el guardado

Cada persona toca su nombre una vez; el navegador se lo acuerda (`localStorage`) y desde ahí el botón "Tomé un vaso" escribe en el servidor.

- Una clave de KV por persona y por día: `d:2026-07-28:joaco` con `{ glasses, last, snack }`.
- El contador se acumula hasta 8 y ahí se planta, tanto en el botón como en el servidor.
- Cada uno escribe solo su propia fila, así que no hay dos personas pisándose.
- Las claves expiran a los 7 días, o sea que se limpia solo.
- El día se calcula con la zona horaria del equipo, no con la del dispositivo: si alguien tiene el celular en otra zona, igual cuenta para el mismo día.
- La página relee el estado cada 30 segundos y cuando volvés a la pestaña.

La cuenta regresiva a las 19:00, en cambio, sí usa el reloj del dispositivo.

## Dos cosas que conviene saber

**KV es eventualmente consistente.** Un vaso que carga otra persona puede tardar algunos segundos en aparecerte. Tu propio número se actualiza al instante porque la página lo pinta antes de esperar la respuesta. Si les molesta el retraso entre miembros, la alternativa es D1 (SQLite, consistente) con la misma forma de datos; es un cambio acotado en `src/index.js`.

**Por defecto la URL está abierta:** cualquiera que la tenga puede sumar vasos. Dos formas de cerrarla, de menor a mayor esfuerzo:

```bash
# Token compartido: la página lo pide una sola vez y lo recuerda
npx wrangler secret put TEAM_TOKEN
```

O poner Cloudflare Access adelante del Worker, que es lo correcto si querés login real por persona. No lo dejé configurado porque depende del plan de tu cuenta.
