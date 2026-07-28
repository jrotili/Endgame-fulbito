/**
 * Countdown para el Endgame — API del contador de vasos por equipo.
 *
 * Rutas:
 *   GET  /api/state  -> { date, goal, timezone, members: [{ name, id, glasses, last, snack }] }
 *   PUT  /api/state  -> body { member, glasses, last, snack }  (el cliente manda su fila entera)
 *
 * Todo lo demás lo sirve el binding de assets (public/).
 */

const DEFAULT_TZ = 'America/Argentina/Buenos_Aires';
const KEEP_DAYS = 7;

function roster(env) {
  const raw = env.MEMBERS || 'Joaco,Jere,Maxi,Yago,Nacho';
  return raw.split(',').map(s => s.trim()).filter(Boolean);
}

/** Meta diaria de vasos por persona. */
function goal(env) {
  const n = parseInt(env.GOAL, 10);
  return n > 0 && n <= 30 ? n : 8;
}

function slug(name) {
  return name
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}

/** Fecha "de hoy" según la zona del equipo, no la del dispositivo. */
function today(env) {
  const tz = env.TIMEZONE || DEFAULT_TZ;
  try {
    return new Intl.DateTimeFormat('en-CA', {
      timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit'
    }).format(new Date());
  } catch (e) {
    // Si no hay soporte de zonas, caemos a UTC-3.
    return new Date(Date.now() - 3 * 3600 * 1000).toISOString().slice(0, 10);
  }
}

const key = (date, id) => `d:${date}:${id}`;

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': 'no-store'
    }
  });
}

/** Si definís el secreto TEAM_TOKEN, las escrituras lo piden. Si no, queda abierto. */
function authOk(request, env) {
  if (!env.TEAM_TOKEN) return true;
  return request.headers.get('x-team-token') === env.TEAM_TOKEN;
}

async function readState(env) {
  const date = today(env);
  const names = roster(env);
  const rows = await Promise.all(
    names.map(n => env.AGUA.get(key(date, slug(n)), 'json').catch(() => null))
  );
  return {
    date,
    goal: goal(env),
    timezone: env.TIMEZONE || DEFAULT_TZ,
    members: names.map((name, i) => ({
      name,
      id: slug(name),
      glasses: (rows[i] && rows[i].glasses) || 0,
      last: (rows[i] && rows[i].last) || null,
      snack: rows[i] && typeof rows[i].snack === 'number' ? rows[i].snack : null
    }))
  };
}

async function writeState(request, env) {
  let body;
  try {
    body = await request.json();
  } catch (e) {
    return json({ error: 'Body inválido' }, 400);
  }

  const names = roster(env);
  const name = names.find(n => n === body.member || slug(n) === slug(String(body.member || '')));
  if (!name) return json({ error: 'Ese nombre no está en el equipo' }, 400);

  // El contador se acumula hasta la meta y ahí se planta.
  const glasses = Math.max(0, Math.min(goal(env), parseInt(body.glasses, 10) || 0));
  const snack = Number.isInteger(body.snack) && body.snack >= 0 && body.snack <= 9 ? body.snack : null;
  const last = typeof body.last === 'number' ? body.last : null;

  const date = today(env);
  await env.AGUA.put(
    key(date, slug(name)),
    JSON.stringify({ glasses, last, snack }),
    { expirationTtl: 60 * 60 * 24 * KEEP_DAYS }
  );

  return json(await readState(env));
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (url.pathname === '/api/state') {
      if (request.method === 'GET') return json(await readState(env));
      if (request.method === 'PUT' || request.method === 'POST') {
        if (!authOk(request, env)) return json({ error: 'Token del equipo incorrecto' }, 401);
        return writeState(request, env);
      }
      return json({ error: 'Método no permitido' }, 405);
    }

    if (url.pathname.startsWith('/api/')) return json({ error: 'No existe' }, 404);

    return env.ASSETS.fetch(request);
  }
};
