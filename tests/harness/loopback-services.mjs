import crypto from 'node:crypto';
import http from 'node:http';
import { createDisposablePostgres } from './disposable-pg.mjs';

const TEST_FIXTURE_CREDENTIAL = `test-placeholder-${'1'.repeat(12)}`;

export const LOOPBACK_SECRETS = {
  publishableKey: ['sb_publishable', 'disposable', 'test', 'placeholder'].join('_'),
  secretKey: ['sb_secret', 'disposable', 'test', 'placeholder'].join('_'),
  cronSecret: `test-placeholder-cron-${'0'.repeat(16)}`,
  revalidateSecret: `test-placeholder-revalidate-${'0'.repeat(12)}`,
  resendApiKey: ['re', 'disposable', 'test', 'placeholder'].join('_'),
  r2PrivateBucket: 'loopback-private-vault',
  r2PublicBucket: 'loopback-public-assets',
  r2AccessKeyId: 'test-placeholder-r2-id',
  r2SecretAccessKey: `test-placeholder-r2-${'0'.repeat(16)}`,
  totpValidCode: '654321',
};

export const SEEDED_USERS = {
  admin: {
    id: '11111111-1111-4111-8111-111111111111',
    email: 'admin@test.local',
    password: TEST_FIXTURE_CREDENTIAL,
    fullName: 'Md. Redwan Ahmed',
    appRole: 'admin',
    profileRole: 'admin',
    isActive: true,
    mfaEnforced: true,
    factorId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  },
  client: {
    id: '22222222-2222-4222-8222-222222222222',
    email: 'client@test.local',
    password: TEST_FIXTURE_CREDENTIAL,
    fullName: 'Elena Vance',
    appRole: null,
    profileRole: 'client',
    isActive: true,
    mfaEnforced: false,
    factorId: null,
  },
  otherClient: {
    id: '33333333-3333-4333-8333-333333333333',
    email: 'other-client@test.local',
    password: TEST_FIXTURE_CREDENTIAL,
    fullName: 'Marcus Sterling',
    appRole: null,
    profileRole: 'client',
    isActive: true,
    mfaEnforced: false,
    factorId: null,
  },
  recovery: {
    id: '44444444-4444-4444-8444-444444444444',
    email: 'recovery@test.local',
    password: TEST_FIXTURE_CREDENTIAL,
    fullName: 'Nadia Chowdhury',
    appRole: null,
    profileRole: 'client',
    isActive: true,
    mfaEnforced: false,
    factorId: null,
  },
  disabled: {
    id: '55555555-5555-4555-8555-555555555555',
    email: 'disabled@test.local',
    password: TEST_FIXTURE_CREDENTIAL,
    fullName: 'Suspended Account',
    appRole: null,
    profileRole: 'client',
    isActive: false,
    mfaEnforced: false,
    factorId: null,
  },
};

export const INITIAL_RECOVERY_TOKEN_HASH = 'test-placeholder-recovery-001';

export const BLOGGER_FIXTURE_POSTS = Array.from({ length: 12 }, (_, idx) => {
  const num = idx + 1;
  return {
    id: `fixture-post-${num}`,
    title: `Security & Systems Engineering Field Note #${num}`,
    published: new Date(Date.UTC(2026, 9, 28 - idx, 12, 0, 0)).toISOString(),
    updated: new Date(Date.UTC(2026, 9, 28 - idx, 12, 0, 0)).toISOString(),
    url: `https://redwan-cse.blogspot.com/2026/10/field-note-${num}.html`,
    content: `<style>/* Clean Code Block Window */ .code-block-wrap { margin: 24px 0 !important; border: 1px solid #d0d7de; }</style><h2 id="overview-${num}">Architecture Overview <a class="heading-anchor" href="#overview-${num}">#</a></h2><p>Practical analysis #${num} covering OWASP ASVS verification, defense-in-depth architecture, and PostgreSQL row-level security hardening.</p><div class="code-block-header"><span>bash</span><button type="button">Copy</button></div><h3 id="controls-${num}">Key Hardening Controls</h3><p>Verified control checklist for production services.</p>`,
    labels: num % 2 === 0 ? ['Cybersecurity', 'Architecture'] : ['DevSecOps', 'PostgreSQL'],
    author: { displayName: 'Md. Redwan Ahmed' },
  };
});

function setCorsHeaders(res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, PATCH, DELETE, HEAD, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', '*');
  res.setHeader('Access-Control-Expose-Headers', 'Content-Range, Content-Type, Content-Length, ETag, Location');
}

function sendJson(res, status, payload, extraHeaders = {}) {
  setCorsHeaders(res);
  const body = payload === undefined ? '' : JSON.stringify(payload);
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    ...extraHeaders,
  });
  res.end(body);
}

async function readBodyBuffer(req) {
  const chunks = [];
  for await (const chunk of req) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  return Buffer.concat(chunks);
}

async function readJsonBody(req) {
  const raw = (await readBodyBuffer(req)).toString('utf8').trim();
  if (!raw) return {};
  return JSON.parse(raw);
}

function base64UrlEncode(input) {
  const buf = Buffer.isBuffer(input) ? input : Buffer.from(input, 'utf8');
  return buf.toString('base64').replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');
}

function base64UrlDecode(str) {
  const padded = str.replace(/-/g, '+').replace(/_/g, '/');
  const padLen = (4 - (padded.length % 4)) % 4;
  return Buffer.from(padded + '='.repeat(padLen), 'base64');
}

function escapeXml(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function quoteIdent(ident) {
  if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(ident)) {
    throw new Error(`Unsafe SQL identifier: ${ident}`);
  }
  return `"${ident}"`;
}

function splitTopLevelCommas(input) {
  const parts = [];
  let depth = 0;
  let current = '';
  for (let i = 0; i < input.length; i += 1) {
    const ch = input[i];
    if (ch === '(') depth += 1;
    else if (ch === ')') depth = Math.max(0, depth - 1);
    if (ch === ',' && depth === 0) {
      if (current.trim()) parts.push(current.trim());
      current = '';
    } else {
      current += ch;
    }
  }
  if (current.trim()) parts.push(current.trim());
  return parts;
}

function parseSelectItems(selectRaw) {
  const cleaned = (selectRaw || '*').replace(/\s+/g, ' ').trim();
  const tokens = splitTopLevelCommas(cleaned);
  const columns = [];
  const relations = [];

  for (const token of tokens) {
    const parenIdx = token.indexOf('(');
    if (parenIdx === -1) {
      const colPart = token.trim();
      if (colPart === '*') {
        columns.push('*');
      } else if (colPart.includes(':')) {
        const [alias, col] = colPart.split(':').map((s) => s.trim());
        columns.push({ alias, col });
      } else {
        columns.push(colPart);
      }
      continue;
    }

    const head = token.slice(0, parenIdx).trim();
    const inner = token.slice(parenIdx + 1, token.lastIndexOf(')')).trim();
    let alias = null;
    let targetSpec = head;
    if (head.includes(':')) {
      const [a, rest] = head.split(':');
      alias = a.trim();
      targetSpec = rest.trim();
    }
    let targetTable = targetSpec;
    let constraintName = null;
    if (targetSpec.includes('!')) {
      const [tbl, cName] = targetSpec.split('!');
      targetTable = tbl.trim();
      constraintName = cName.trim();
    }
    relations.push({
      alias: alias || targetTable,
      targetTable,
      constraintName,
      nestedSelect: inner || '*',
    });
  }

  return { columns, relations };
}

function parseInList(rawList) {
  const trimmed = rawList.trim();
  const inner =
    trimmed.startsWith('(') && trimmed.endsWith(')') ? trimmed.slice(1, -1) : trimmed;
  if (!inner.trim()) return [];
  const values = [];
  let current = '';
  let inQuotes = false;
  for (let i = 0; i < inner.length; i += 1) {
    const ch = inner[i];
    if (ch === '"' && inner[i - 1] !== '\\') {
      inQuotes = !inQuotes;
      continue;
    }
    if (ch === ',' && !inQuotes) {
      values.push(current.trim());
      current = '';
      continue;
    }
    current += ch;
  }
  if (current.trim() || inner.endsWith(',')) {
    values.push(current.trim());
  }
  return values;
}

async function listenOnPort(server, preferredPort) {
  return new Promise((resolve, reject) => {
    const onError = (err) => {
      if (preferredPort !== 0 && (err.code === 'EADDRINUSE' || err.code === 'EACCES')) {
        server.removeListener('error', onError);
        server.listen(0, '127.0.0.1', () => {
          resolve(server.address().port);
        });
        return;
      }
      reject(err);
    };
    server.once('error', onError);
    server.listen(preferredPort, '127.0.0.1', () => {
      server.removeListener('error', onError);
      resolve(server.address().port);
    });
  });
}

export async function findFreeLoopbackPort(preferredPort = 0) {
  const probe = http.createServer();
  const port = await listenOnPort(probe, preferredPort);
  await new Promise((resolve) => probe.close(resolve));
  return port;
}

export async function startLoopbackServices(options = {}) {
  const preferredSupabasePort = options.supabasePort ?? 24391;
  const preferredR2Port = options.r2Port ?? 24392;
  const preferredResendPort = options.resendPort ?? 24393;

  // 1. Bootstrap real PostgreSQL 17 (PGlite) with migrations 0001..0015
  const pg = await createDisposablePostgres();

  // Seed test accounts into auth.users, public.profiles, and public.client_profiles
  for (const u of Object.values(SEEDED_USERS)) {
    await pg.db.query(
      `INSERT INTO auth.users (id, email, raw_app_meta_data, raw_user_meta_data)
       VALUES ($1::uuid, $2, $3::jsonb, $4::jsonb)
       ON CONFLICT (id) DO UPDATE SET email = EXCLUDED.email, raw_app_meta_data = EXCLUDED.raw_app_meta_data`,
      [
        u.id,
        u.email,
        JSON.stringify(u.appRole ? { provider: 'email', role: u.appRole } : { provider: 'email' }),
        JSON.stringify({ full_name: u.fullName }),
      ]
    );
    await pg.db.query(
      `INSERT INTO public.profiles (id, email, full_name, role, is_active, mfa_enforced)
       VALUES ($1::uuid, $2, $3, $4::public.user_role, $5, $6)
       ON CONFLICT (id) DO UPDATE SET
         email = EXCLUDED.email,
         full_name = EXCLUDED.full_name,
         role = EXCLUDED.role,
         is_active = EXCLUDED.is_active,
         mfa_enforced = EXCLUDED.mfa_enforced`,
      [u.id, u.email, u.fullName, u.profileRole, u.isActive, u.mfaEnforced]
    );
    if (u.profileRole === 'client') {
      await pg.db.query(
        `INSERT INTO public.client_profiles (user_id, company_name, tier, preferred_currency)
         VALUES ($1::uuid, $2, 'standard', 'USD')
         ON CONFLICT (user_id) DO NOTHING`,
        [u.id, `${u.fullName} Ventures`]
      );
    }
  }

  // Introspect public schema metadata (columns, PKs, FKs, and RPC signatures)
  const colsRes = await pg.db.query(`
    SELECT table_name, column_name, data_type, udt_name
    FROM information_schema.columns
    WHERE table_schema = 'public'
    ORDER BY table_name, ordinal_position
  `);
  const tableColumns = new Map();
  for (const row of colsRes.rows) {
    if (!tableColumns.has(row.table_name)) tableColumns.set(row.table_name, new Map());
    tableColumns.get(row.table_name).set(row.column_name, {
      dataType: row.data_type,
      udtName: row.udt_name,
    });
  }

  const pkRes = await pg.db.query(`
    SELECT tc.table_name, kcu.column_name
    FROM information_schema.table_constraints tc
    JOIN information_schema.key_column_usage kcu
      ON tc.constraint_name = kcu.constraint_name
     AND tc.table_schema = kcu.table_schema
    WHERE tc.table_schema = 'public' AND tc.constraint_type = 'PRIMARY KEY'
    ORDER BY tc.table_name, kcu.ordinal_position
  `);
  const tablePrimaryKeys = new Map();
  for (const row of pkRes.rows) {
    if (!tablePrimaryKeys.has(row.table_name)) tablePrimaryKeys.set(row.table_name, []);
    tablePrimaryKeys.get(row.table_name).push(row.column_name);
  }

  const fkRes = await pg.db.query(`
    SELECT
      tc.constraint_name,
      tc.table_name AS source_table,
      kcu.column_name AS source_column,
      ccu.table_name AS target_table,
      ccu.column_name AS target_column
    FROM information_schema.table_constraints tc
    JOIN information_schema.key_column_usage kcu
      ON tc.constraint_name = kcu.constraint_name
     AND tc.table_schema = kcu.table_schema
    JOIN information_schema.constraint_column_usage ccu
      ON ccu.constraint_name = tc.constraint_name
     AND ccu.table_schema = tc.table_schema
    WHERE tc.table_schema = 'public' AND tc.constraint_type = 'FOREIGN KEY'
  `);
  const foreignKeys = fkRes.rows;

  const rpcRes = await pg.db.query(`
    SELECT
      p.proname AS fn_name,
      CASE
        WHEN p.pronargs = 0 OR p.proargnames IS NULL THEN ARRAY[]::text[]
        ELSE p.proargnames[1:p.pronargs]
      END AS arg_names,
      CASE
        WHEN p.pronargs = 0 THEN ARRAY[]::text[]
        ELSE ARRAY(
          SELECT format_type(oid_val::oid, NULL)
          FROM unnest(string_to_array(p.proargtypes::text, ' ')) AS oid_val
        )
      END AS arg_types,
      format_type(p.prorettype, NULL) AS return_type,
      p.proretset AS returns_set
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
  `);
  const rpcSignatures = new Map();
  for (const row of rpcRes.rows) {
    if (!rpcSignatures.has(row.fn_name)) rpcSignatures.set(row.fn_name, []);
    rpcSignatures.get(row.fn_name).push(row);
  }

  // Generate ES256 keypair for GoTrue JWT signing + JWKS verification
  const { publicKey, privateKey } = crypto.generateKeyPairSync('ec', {
    namedCurve: 'prime256v1',
  });
  const publicJwk = {
    ...publicKey.export({ format: 'jwk' }),
    kid: 'loopback-es256-key-1',
    use: 'sig',
    alg: 'ES256',
  };

  // In-memory GoTrue state
  const usersById = new Map();
  const usersByEmail = new Map();
  for (const raw of Object.values(SEEDED_USERS)) {
    const userObj = {
      id: raw.id,
      email: raw.email.toLowerCase(),
      password: raw.password,
      fullName: raw.fullName,
      appRole: raw.appRole,
      factors: raw.factorId
        ? [
            {
              id: raw.factorId,
              type: 'totp',
              factor_type: 'totp',
              status: 'verified',
              friendly_name: 'Command Center Authenticator',
              created_at: '2026-11-04T00:00:00.000Z',
              updated_at: '2026-11-04T00:00:00.000Z',
            },
          ]
        : [],
    };
    usersById.set(userObj.id, userObj);
    usersByEmail.set(userObj.email, userObj);
  }

  const sessionsById = new Map();
  const sessionsByRefresh = new Map();
  const oneTimeTokens = new Map([
    [
      INITIAL_RECOVERY_TOKEN_HASH,
      {
        tokenHash: INITIAL_RECOVERY_TOKEN_HASH,
        userId: SEEDED_USERS.recovery.id,
        type: 'recovery',
        consumed: false,
      },
    ],
  ]);

  let supabaseOrigin = '';

  function serializeUser(user) {
    return {
      id: user.id,
      aud: 'authenticated',
      role: 'authenticated',
      email: user.email,
      email_confirmed_at: '2026-11-04T00:00:00.000Z',
      phone: '',
      app_metadata: {
        provider: 'email',
        providers: ['email'],
        ...(user.appRole ? { role: user.appRole } : {}),
      },
      user_metadata: {
        full_name: user.fullName,
      },
      identities: [],
      factors: user.factors,
      created_at: '2026-11-04T00:00:00.000Z',
      updated_at: new Date().toISOString(),
    };
  }

  function signSessionTokens(session, user) {
    const nowSec = Math.floor(Date.now() / 1000);
    const expSec = nowSec + 3600;
    const header = { alg: 'ES256', typ: 'JWT', kid: 'loopback-es256-key-1' };
    const payload = {
      iss: `${supabaseOrigin}/auth/v1`,
      sub: user.id,
      aud: 'authenticated',
      exp: expSec,
      iat: nowSec,
      email: user.email,
      phone: '',
      app_metadata: {
        provider: 'email',
        providers: ['email'],
        ...(user.appRole ? { role: user.appRole } : {}),
      },
      user_metadata: {
        full_name: user.fullName,
      },
      role: 'authenticated',
      aal: session.aal,
      amr: session.amr,
      session_id: session.id,
      is_anonymous: false,
    };
    const signingInput = `${base64UrlEncode(JSON.stringify(header))}.${base64UrlEncode(
      JSON.stringify(payload)
    )}`;
    const signature = crypto.sign('sha256', Buffer.from(signingInput, 'utf8'), {
      key: privateKey,
      dsaEncoding: 'ieee-p1363',
    });
    const accessToken = `${signingInput}.${base64UrlEncode(signature)}`;
    return {
      access_token: accessToken,
      token_type: 'bearer',
      expires_in: 3600,
      expires_at: expSec,
      refresh_token: session.refreshToken,
      user: serializeUser(user),
    };
  }

  function createSession(user, aal = 'aal1', method = 'password') {
    const nowSec = Math.floor(Date.now() / 1000);
    const session = {
      id: crypto.randomUUID(),
      userId: user.id,
      aal,
      amr: [{ method, timestamp: nowSec }],
      refreshToken: `rt_${crypto.randomUUID().replace(/-/g, '')}`,
      revoked: false,
    };
    sessionsById.set(session.id, session);
    sessionsByRefresh.set(session.refreshToken, session);
    return session;
  }

  function verifyJwtToken(rawToken) {
    try {
      const tokenStr = typeof rawToken === 'string' ? rawToken : '';
      const parts = tokenStr.split('.');
      const headerB64 = parts[0] || '';
      const payloadB64 = parts[1] || '';
      const sigB64 = parts[2] || '';
      const signingInput = `${headerB64}.${payloadB64}`;
      const sig = base64UrlDecode(sigB64);
      const ok = crypto.verify(
        'sha256',
        Buffer.from(signingInput, 'utf8'),
        { key: publicKey, dsaEncoding: 'ieee-p1363' },
        sig
      );
      if (!ok || parts.length !== 3) return null;
      const payload = JSON.parse(base64UrlDecode(payloadB64).toString('utf8'));
      if (typeof payload.exp === 'number' && payload.exp < Math.floor(Date.now() / 1000)) {
        return null;
      }
      const session = payload.session_id ? sessionsById.get(payload.session_id) : null;
      if (session && session.revoked) return null;
      return payload;
    } catch {
      return null;
    }
  }

  function isServiceRoleKey(candidate) {
    if (typeof candidate !== 'string') return false;
    const expected = Buffer.from(LOOPBACK_SECRETS.secretKey, 'utf8');
    const actual = Buffer.from(candidate, 'utf8');
    if (actual.length !== expected.length) return false;
    return crypto.timingSafeEqual(actual, expected);
  }

  function resolveDbSession(req) {
    const apiKey = typeof req.headers['apikey'] === 'string' ? req.headers['apikey'] : '';
    const authHeader =
      typeof req.headers['authorization'] === 'string' ? req.headers['authorization'] : '';
    const bearer = authHeader.startsWith('Bearer ') ? authHeader.slice(7).trim() : '';

    const claims = verifyJwtToken(bearer);
    if (claims?.sub) {
      return {
        role: 'authenticated',
        userId: claims.sub,
        email: claims.email,
        aal: claims.aal || 'aal1',
        appRole: claims.app_metadata?.role || null,
      };
    }
    if (isServiceRoleKey(apiKey) || isServiceRoleKey(bearer)) {
      return { role: 'service_role' };
    }
    return { role: 'anon' };
  }

  function castParamPlaceholder(tableName, colName, idx) {
    const colMeta = tableColumns.get(tableName)?.get(colName);
    if (!colMeta) return `$${idx}`;
    if (colMeta.dataType === 'ARRAY') {
      const elemType = colMeta.udtName.startsWith('_') ? colMeta.udtName.slice(1) : 'text';
      return `$${idx}::${elemType}[]`;
    }
    if (colMeta.udtName === 'jsonb') return `$${idx}::jsonb`;
    if (colMeta.udtName === 'json') return `$${idx}::json`;
    if (colMeta.udtName === 'uuid') return `$${idx}::uuid`;
    if (colMeta.dataType === 'USER-DEFINED') return `$${idx}::public.${colMeta.udtName}`;
    return `$${idx}`;
  }

  function prepareColumnValue(tableName, colName, value) {
    if (value === null || value === undefined) return null;
    const colMeta = tableColumns.get(tableName)?.get(colName);
    if (!colMeta) return value;
    if (colMeta.udtName === 'jsonb' || colMeta.udtName === 'json') {
      return typeof value === 'string' ? value : JSON.stringify(value);
    }
    return value;
  }

  function buildWhereClause(tableName, searchParams, initialParams = []) {
    const clauses = [];
    const params = [...initialParams];
    const reserved = new Set(['select', 'order', 'limit', 'offset', 'on_conflict', 'columns']);

    for (const [rawKey, rawVal] of searchParams.entries()) {
      if (reserved.has(rawKey)) continue;
      const colSql = quoteIdent(rawKey);

      let negated = false;
      let expr = rawVal;
      if (expr.startsWith('not.')) {
        negated = true;
        expr = expr.slice(4);
      }

      const dotIdx = expr.indexOf('.');
      const op = dotIdx === -1 ? 'eq' : expr.slice(0, dotIdx);
      const val = dotIdx === -1 ? expr : expr.slice(dotIdx + 1);

      if (op === 'is') {
        const lower = val.toLowerCase();
        const sqlKeyword =
          lower === 'null' ? 'NULL' : lower === 'true' ? 'TRUE' : lower === 'false' ? 'FALSE' : 'NULL';
        clauses.push(`${colSql} IS ${negated ? 'NOT ' : ''}${sqlKeyword}`);
        continue;
      }

      if (op === 'in') {
        const list = parseInList(val);
        if (list.length === 0) {
          clauses.push(negated ? 'TRUE' : 'FALSE');
          continue;
        }
        const placeholders = list.map((item) => {
          params.push(item);
          return castParamPlaceholder(tableName, rawKey, params.length);
        });
        clauses.push(`${colSql} ${negated ? 'NOT IN' : 'IN'} (${placeholders.join(', ')})`);
        continue;
      }

      const opMap = {
        eq: '=',
        neq: '<>',
        gt: '>',
        gte: '>=',
        lt: '<',
        lte: '<=',
        like: 'LIKE',
        ilike: 'ILIKE',
      };
      const sqlOp = opMap[op] || '=';
      params.push(val);
      const placeholder = castParamPlaceholder(tableName, rawKey, params.length);
      clauses.push(
        negated ? `NOT (${colSql} ${sqlOp} ${placeholder})` : `${colSql} ${sqlOp} ${placeholder}`
      );
    }

    return {
      whereSql: clauses.length > 0 ? `WHERE ${clauses.join(' AND ')}` : '',
      params,
    };
  }

  function buildOrderAndLimitSql(searchParams) {
    let sql = '';
    const orderRaw = searchParams.get('order');
    if (orderRaw) {
      const orderParts = orderRaw.split(',').map((part) => {
        const segs = part.trim().split('.');
        const col = quoteIdent(segs[0]);
        const dir = segs.includes('desc') ? 'DESC' : 'ASC';
        const nulls = segs.includes('nullsfirst')
          ? ' NULLS FIRST'
          : segs.includes('nullslast')
            ? ' NULLS LAST'
            : '';
        return `${col} ${dir}${nulls}`;
      });
      if (orderParts.length > 0) sql += ` ORDER BY ${orderParts.join(', ')}`;
    }
    const limitRaw = searchParams.get('limit');
    if (limitRaw && /^\d+$/.test(limitRaw)) {
      sql += ` LIMIT ${Number(limitRaw)}`;
    }
    const offsetRaw = searchParams.get('offset');
    if (offsetRaw && /^\d+$/.test(offsetRaw)) {
      sql += ` OFFSET ${Number(offsetRaw)}`;
    }
    return sql;
  }

  async function hydrateRelationsAndProject(dbSession, tableName, rows, selectRaw) {
    if (!rows || rows.length === 0) return [];
    const { columns, relations } = parseSelectItems(selectRaw);

    const rowMaps = rows.map((row) => {
      const entryMap = new Map();
      if (columns.includes('*') || columns.length === 0) {
        for (const [k, v] of Object.entries(row)) {
          entryMap.set(k, v);
        }
        return entryMap;
      }
      for (const colSpec of columns) {
        if (typeof colSpec === 'string') {
          if (Object.prototype.hasOwnProperty.call(row, colSpec)) {
            entryMap.set(colSpec, row[colSpec]);
          }
        } else if (colSpec && typeof colSpec === 'object') {
          entryMap.set(String(colSpec.alias), row[colSpec.col]);
        }
      }
      return entryMap;
    });

    for (const rel of relations) {
      // Check outgoing FK (manyToOne: tableName.source_column -> rel.targetTable.target_column)
      const outgoing = foreignKeys.find(
        (fk) =>
          fk.source_table === tableName &&
          fk.target_table === rel.targetTable &&
          (!rel.constraintName || fk.constraint_name === rel.constraintName)
      );

      if (outgoing) {
        const fkValues = [
          ...new Set(rows.map((r) => r[outgoing.source_column]).filter((v) => v != null)),
        ];
        let targetByKey = new Map();
        if (fkValues.length > 0) {
          const placeholders = fkValues.map((_, i) =>
            castParamPlaceholder(rel.targetTable, outgoing.target_column, i + 1)
          );
          const relRes = await pg.queryAs(
            dbSession,
            `SELECT * FROM public.${quoteIdent(rel.targetTable)} WHERE ${quoteIdent(
              outgoing.target_column
            )} IN (${placeholders.join(', ')})`,
            fkValues
          );
          const hydratedTargets = await hydrateRelationsAndProject(
            dbSession,
            rel.targetTable,
            relRes.rows,
            rel.nestedSelect
          );
          relRes.rows.forEach((rawTarget, i) => {
            targetByKey.set(String(rawTarget[outgoing.target_column]), hydratedTargets[i]);
          });
        }
        rows.forEach((rawRow, idx) => {
          const fkVal = rawRow[outgoing.source_column];
          rowMaps[idx].set(
            String(rel.alias),
            fkVal == null ? null : (targetByKey.get(String(fkVal)) ?? null)
          );
        });
        continue;
      }

      // Check incoming FK (oneToMany: rel.targetTable.source_column -> tableName.target_column)
      const incoming = foreignKeys.find(
        (fk) =>
          fk.target_table === tableName &&
          fk.source_table === rel.targetTable &&
          (!rel.constraintName || fk.constraint_name === rel.constraintName)
      );

      if (incoming) {
        const parentValues = [
          ...new Set(rows.map((r) => r[incoming.target_column]).filter((v) => v != null)),
        ];
        const grouped = new Map();
        if (parentValues.length > 0) {
          const placeholders = parentValues.map((_, i) =>
            castParamPlaceholder(rel.targetTable, incoming.source_column, i + 1)
          );
          const targetCols = tableColumns.get(rel.targetTable);
          const defaultOrder = targetCols?.has('position')
            ? ' ORDER BY "position" ASC'
            : targetCols?.has('sort_order')
              ? ' ORDER BY "sort_order" ASC'
              : targetCols?.has('created_at')
                ? ' ORDER BY "created_at" ASC'
                : '';
          const relRes = await pg.queryAs(
            dbSession,
            `SELECT * FROM public.${quoteIdent(rel.targetTable)} WHERE ${quoteIdent(
              incoming.source_column
            )} IN (${placeholders.join(', ')})${defaultOrder}`,
            parentValues
          );
          const hydratedChildren = await hydrateRelationsAndProject(
            dbSession,
            rel.targetTable,
            relRes.rows,
            rel.nestedSelect
          );
          relRes.rows.forEach((rawChild, i) => {
            const key = String(rawChild[incoming.source_column]);
            if (!grouped.has(key)) grouped.set(key, []);
            grouped.get(key).push(hydratedChildren[i]);
          });
        }
        rows.forEach((rawRow, idx) => {
          const key = String(rawRow[incoming.target_column]);
          rowMaps[idx].set(String(rel.alias), grouped.get(key) ?? []);
        });
      }
    }

    return rowMaps.map((m) => Object.fromEntries(m));
  }

  // Supabase HTTP Server (GoTrue + PostgREST + Test Control)
  const supabaseServer = http.createServer(async (req, res) => {
    setCorsHeaders(res);
    if (req.method === 'OPTIONS') {
      res.writeHead(204);
      res.end();
      return;
    }

    const url = new URL(req.url || '/', supabaseOrigin || 'http://127.0.0.1');
    const pathname = url.pathname;

    try {
      // JWKS Discovery
      if (
        req.method === 'GET' &&
        (pathname === '/auth/v1/.well-known/jwks.json' || pathname === '/.well-known/jwks.json')
      ) {
        sendJson(res, 200, { keys: [publicJwk] });
        return;
      }

      // Fixed parameterized test fixture operations (no arbitrary dynamic SQL execution)
      if (pathname === '/__test/fixture-op' && req.method === 'POST') {
        const body = await readJsonBody(req);
        const op = String(body.op || '');
        if (op === 'getOrderStatus') {
          const result = await pg.db.query(
            'SELECT status FROM public.orders WHERE id = $1::uuid',
            [String(body.orderId || '')]
          );
          sendJson(res, 200, { rows: result.rows });
          return;
        }
        if (op === 'setProfileActive') {
          await pg.db.query(
            'UPDATE public.profiles SET is_active = $1::boolean WHERE id = $2::uuid',
            [Boolean(body.isActive), String(body.userId || '')]
          );
          sendJson(res, 200, { rows: [] });
          return;
        }
        if (op === 'getLatestVaultFileForClient') {
          const result = await pg.db.query(
            `SELECT id, r2_key, download_count
             FROM public.vault_files
             WHERE owner_client_id = $1::uuid AND filename = $2
             ORDER BY created_at DESC LIMIT 1`,
            [String(body.clientId || ''), String(body.filename || '')]
          );
          sendJson(res, 200, { rows: result.rows });
          return;
        }
        if (op === 'getVaultFileState') {
          const result = await pg.db.query(
            'SELECT download_count, archived_at FROM public.vault_files WHERE id = $1::uuid',
            [String(body.fileId || '')]
          );
          sendJson(res, 200, { rows: result.rows });
          return;
        }
        if (op === 'getDownloadAuditRows') {
          const result = await pg.db.query(
            `SELECT action FROM public.audit_logs WHERE entity_id = $1::uuid AND action = 'vault_file.downloaded'`,
            [String(body.fileId || '')]
          );
          sendJson(res, 200, { rows: result.rows });
          return;
        }
        if (op === 'expireVaultFileRetention') {
          await pg.db.query(
            `UPDATE public.vault_files
             SET retention_until = now() - interval '2 hours'
             WHERE id = $1::uuid`,
            [String(body.fileId || '')]
          );
          sendJson(res, 200, { rows: [] });
          return;
        }
        if (op === 'clearPendingEmailOutbox') {
          await pg.db.query(
            `DELETE FROM public.email_outbox WHERE status IN ('pending', 'processing')`
          );
          sendJson(res, 200, { rows: [] });
          return;
        }
        if (op === 'getLatestEmailOutboxForRecipient') {
          const result = await pg.db.query(
            `SELECT id, status, attempts FROM public.email_outbox
             WHERE to_email = $1 ORDER BY created_at DESC LIMIT 1`,
            [String(body.toEmail || '')]
          );
          sendJson(res, 200, { rows: result.rows });
          return;
        }
        if (op === 'getEmailOutboxById') {
          const result = await pg.db.query(
            'SELECT status, attempts, last_error FROM public.email_outbox WHERE id = $1::uuid',
            [String(body.id || '')]
          );
          sendJson(res, 200, { rows: result.rows });
          return;
        }
        sendJson(res, 400, { error: 'Unsupported fixture operation' });
        return;
      }

      if (pathname === '/__test/issue-recovery-token' && req.method === 'POST') {
        const { email, tokenHash = `recovery-${crypto.randomUUID()}` } = await readJsonBody(req);
        const user = usersByEmail.get(String(email || '').toLowerCase());
        if (!user) {
          sendJson(res, 404, { error: 'User not found' });
          return;
        }
        oneTimeTokens.set(tokenHash, {
          tokenHash,
          userId: user.id,
          type: 'recovery',
          consumed: false,
        });
        sendJson(res, 200, { tokenHash });
        return;
      }

      // GoTrue Auth Endpoints
      if (pathname === '/auth/v1/token' && req.method === 'POST') {
        const grantType = url.searchParams.get('grant_type');
        const body = await readJsonBody(req);

        if (grantType === 'password') {
          const email = String(body.email || '').trim().toLowerCase();
          const user = usersByEmail.get(email);
          if (!user || user.password !== body.password) {
            sendJson(res, 400, {
              code: 'invalid_credentials',
              error_code: 'invalid_credentials',
              msg: 'Invalid login credentials',
              message: 'Invalid login credentials',
            });
            return;
          }
          const session = createSession(user, 'aal1', 'password');
          sendJson(res, 200, signSessionTokens(session, user));
          return;
        }

        if (grantType === 'refresh_token') {
          const session = sessionsByRefresh.get(body.refresh_token);
          if (!session || session.revoked) {
            sendJson(res, 400, {
              code: 'refresh_token_not_found',
              message: 'Invalid Refresh Token',
            });
            return;
          }
          const user = usersById.get(session.userId);
          sendJson(res, 200, signSessionTokens(session, user));
          return;
        }

        sendJson(res, 400, { message: `Unsupported grant_type: ${grantType}` });
        return;
      }

      if (pathname === '/auth/v1/verify' && req.method === 'POST') {
        const body = await readJsonBody(req);
        const tokenHash = String(body.token_hash || body.token || '').trim();
        const record = oneTimeTokens.get(tokenHash);
        if (!record || record.consumed) {
          sendJson(res, 403, {
            code: 'otp_expired',
            error_code: 'otp_expired',
            msg: 'Email link is invalid or has expired',
            message: 'Email link is invalid or has expired',
          });
          return;
        }
        record.consumed = true;
        const user = usersById.get(record.userId);
        const session = createSession(user, 'aal1', record.type || 'otp');
        sendJson(res, 200, signSessionTokens(session, user));
        return;
      }

      if ((pathname === '/auth/v1/recover' || pathname === '/auth/v1/otp') && req.method === 'POST') {
        const body = await readJsonBody(req);
        const email = String(body.email || '').trim().toLowerCase();
        const user = usersByEmail.get(email);
        if (user) {
          const tokenHash = `otp_${crypto.randomUUID().replace(/-/g, '')}`;
          oneTimeTokens.set(tokenHash, {
            tokenHash,
            userId: user.id,
            type: pathname.endsWith('/recover') ? 'recovery' : 'magiclink',
            consumed: false,
          });
        }
        sendJson(res, 200, {});
        return;
      }

      if (pathname === '/auth/v1/user' && (req.method === 'GET' || req.method === 'PUT')) {
        const authHeader = req.headers['authorization'] || '';
        const bearer = authHeader.startsWith('Bearer ') ? authHeader.slice(7).trim() : '';
        const claims = verifyJwtToken(bearer);
        const user = claims?.sub ? usersById.get(claims.sub) : null;
        if (!user) {
          sendJson(res, 403, { code: 'bad_jwt', message: 'Invalid JWT' });
          return;
        }
        if (req.method === 'PUT') {
          const body = await readJsonBody(req);
          if (typeof body.password === 'string' && body.password.length >= 6) {
            user.password = body.password;
          }
          if (body.data && typeof body.data.full_name === 'string') {
            user.fullName = body.data.full_name;
          }
        }
        sendJson(res, 200, serializeUser(user));
        return;
      }

      if (pathname === '/auth/v1/logout' && req.method === 'POST') {
        const authHeader = req.headers['authorization'] || '';
        const bearer = authHeader.startsWith('Bearer ') ? authHeader.slice(7).trim() : '';
        const claims = verifyJwtToken(bearer);
        if (claims?.session_id && sessionsById.has(claims.session_id)) {
          sessionsById.get(claims.session_id).revoked = true;
        }
        res.writeHead(204);
        res.end();
        return;
      }

      if (pathname === '/auth/v1/factors' && req.method === 'POST') {
        const authHeader = req.headers['authorization'] || '';
        const bearer = authHeader.startsWith('Bearer ') ? authHeader.slice(7).trim() : '';
        const claims = verifyJwtToken(bearer);
        const user = claims?.sub ? usersById.get(claims.sub) : null;
        if (!user) {
          sendJson(res, 403, { message: 'Unauthorized' });
          return;
        }
        const body = await readJsonBody(req);
        const factor = {
          id: crypto.randomUUID(),
          type: 'totp',
          factor_type: 'totp',
          status: 'unverified',
          friendly_name: body.friendly_name || 'Authenticator',
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        };
        user.factors.push(factor);
        sendJson(res, 200, {
          ...factor,
          totp: {
            qr_code: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16"><rect width="16" height="16" fill="#111"/></svg>',
            secret: 'JBSWY3DPEHPK3PXP',
            uri: `otpauth://totp/redwan.work:${encodeURIComponent(user.email)}?secret=JBSWY3DPEHPK3PXP&issuer=redwan.work`,
          },
        });
        return;
      }

      const mfaChallengeMatch = pathname.match(/^\/auth\/v1\/factors\/([^/]+)\/challenge$/);
      if (mfaChallengeMatch && req.method === 'POST') {
        sendJson(res, 200, {
          id: crypto.randomUUID(),
          type: 'totp',
          expires_at: Math.floor(Date.now() / 1000) + 300,
        });
        return;
      }

      const mfaVerifyMatch = pathname.match(/^\/auth\/v1\/factors\/([^/]+)\/verify$/);
      if (mfaVerifyMatch && req.method === 'POST') {
        const factorId = mfaVerifyMatch[1];
        const authHeader = req.headers['authorization'] || '';
        const bearer = authHeader.startsWith('Bearer ') ? authHeader.slice(7).trim() : '';
        const claims = verifyJwtToken(bearer);
        const user = claims?.sub ? usersById.get(claims.sub) : null;
        const session = claims?.session_id ? sessionsById.get(claims.session_id) : null;
        if (!user || !session) {
          sendJson(res, 403, { message: 'Unauthorized' });
          return;
        }
        const body = await readJsonBody(req);
        if (String(body.code || '').trim() !== LOOPBACK_SECRETS.totpValidCode) {
          sendJson(res, 422, {
            code: 'mfa_verification_failed',
            message: 'Invalid TOTP code provided',
          });
          return;
        }
        const factor = user.factors.find((f) => f.id === factorId);
        if (factor) factor.status = 'verified';
        session.aal = 'aal2';
        session.amr.push({ method: 'totp', timestamp: Math.floor(Date.now() / 1000) });
        sendJson(res, 200, signSessionTokens(session, user));
        return;
      }

      if (
        (pathname === '/auth/v1/invite' || pathname === '/auth/v1/admin/users') &&
        req.method === 'POST'
      ) {
        const body = await readJsonBody(req);
        const email = String(body.email || '').trim().toLowerCase();
        let user = usersByEmail.get(email);
        if (!user) {
          user = {
            id: crypto.randomUUID(),
            email,
            password: body.password || `Invited!${crypto.randomUUID()}`,
            fullName: body.data?.full_name || body.user_metadata?.full_name || email,
            appRole: body.app_metadata?.role || null,
            factors: [],
          };
          usersById.set(user.id, user);
          usersByEmail.set(email, user);
          await pg.db.query(
            `INSERT INTO auth.users (id, email, raw_app_meta_data, raw_user_meta_data)
             VALUES ($1::uuid, $2, $3::jsonb, $4::jsonb)
             ON CONFLICT (id) DO NOTHING`,
            [
              user.id,
              user.email,
              JSON.stringify(user.appRole ? { role: user.appRole } : {}),
              JSON.stringify({ full_name: user.fullName }),
            ]
          );
        }
        sendJson(res, 200, serializeUser(user));
        return;
      }

      const adminUserMatch = pathname.match(/^\/auth\/v1\/admin\/users\/([^/]+)$/);
      if (adminUserMatch && req.method === 'GET') {
        const user = usersById.get(adminUserMatch[1]);
        if (!user) {
          sendJson(res, 404, { message: 'User not found' });
          return;
        }
        sendJson(res, 200, serializeUser(user));
        return;
      }

      if (pathname === '/auth/v1/admin/users' && req.method === 'GET') {
        sendJson(res, 200, {
          users: Array.from(usersById.values()).map(serializeUser),
          aud: 'authenticated',
        });
        return;
      }

      // PostgREST RPC Endpoint
      const rpcMatch = pathname.match(/^\/rest\/v1\/rpc\/([a-zA-Z0-9_]+)$/);
      if (rpcMatch && (req.method === 'POST' || req.method === 'GET')) {
        const fnName = rpcMatch[1];
        const dbSession = resolveDbSession(req);
        const argsObj = req.method === 'POST' ? await readJsonBody(req) : {};
        const overloads = rpcSignatures.get(fnName) || [];
        const argKeys = Object.keys(argsObj).filter((k) => argsObj[k] !== undefined);

        // Pick matching overload (or first)
        const chosen =
          overloads.find((ov) => {
            const names = ov.arg_names || [];
            return argKeys.every((k) => names.includes(k));
          }) || overloads[0];

        const params = [];
        const namedAssignments = argKeys.map((key) => {
          const idx = chosen?.arg_names ? chosen.arg_names.indexOf(key) : -1;
          const pgType = idx >= 0 && chosen?.arg_types?.[idx] ? chosen.arg_types[idx] : null;
          let val = argsObj[key];
          if (val !== null && pgType && (pgType === 'jsonb' || pgType === 'json')) {
            val = typeof val === 'string' ? val : JSON.stringify(val);
          }
          params.push(val);
          const castSuffix = pgType ? `::${pgType}` : '';
          return `${quoteIdent(key)} := $${params.length}${castSuffix}`;
        });

        const callExpr = `public.${quoteIdent(fnName)}(${namedAssignments.join(', ')})`;
        const sql = chosen?.returns_set
          ? `SELECT * FROM ${callExpr}`
          : `SELECT ${callExpr} AS result`;
        const rpcQueryRes = await pg.queryAs(dbSession, sql, params);
        const payload = chosen?.returns_set
          ? rpcQueryRes.rows
          : (rpcQueryRes.rows[0]?.result ?? null);
        sendJson(res, 200, payload);
        return;
      }

      // PostgREST Table Endpoint
      const tableMatch = pathname.match(/^\/rest\/v1\/([a-zA-Z0-9_]+)$/);
      if (tableMatch) {
        const tableName = tableMatch[1];
        if (!tableColumns.has(tableName)) {
          sendJson(res, 404, { code: '42P01', message: `Relation ${tableName} does not exist` });
          return;
        }
        const dbSession = resolveDbSession(req);
        const preferHeader = String(req.headers['prefer'] || '');
        const acceptHeader = String(req.headers['accept'] || '');
        const wantsSingleObject = acceptHeader.includes('application/vnd.pgrst.object+json');
        const wantsCountExact = preferHeader.includes('count=exact');
        const wantsRepresentation = preferHeader.includes('return=representation');
        const isUpsert = preferHeader.includes('resolution=merge-duplicates');
        const selectRaw = url.searchParams.get('select') || '*';

        if (req.method === 'GET' || req.method === 'HEAD') {
          const { whereSql, params } = buildWhereClause(tableName, url.searchParams);
          let totalCount = null;
          if (wantsCountExact) {
            const countRes = await pg.queryAs(
              dbSession,
              `SELECT COUNT(*)::int AS cnt FROM public.${quoteIdent(tableName)} ${whereSql}`,
              params
            );
            totalCount = countRes.rows[0]?.cnt ?? 0;
          }

          if (req.method === 'HEAD') {
            setCorsHeaders(res);
            res.writeHead(200, {
              'Content-Range': `*/${totalCount ?? 0}`,
            });
            res.end();
            return;
          }

          const orderLimitSql = buildOrderAndLimitSql(url.searchParams);
          const queryRes = await pg.queryAs(
            dbSession,
            `SELECT * FROM public.${quoteIdent(tableName)} ${whereSql}${orderLimitSql}`,
            params
          );
          const hydrated = await hydrateRelationsAndProject(
            dbSession,
            tableName,
            queryRes.rows,
            selectRaw
          );

          const extraHeaders =
            totalCount !== null
              ? {
                  'Content-Range':
                    hydrated.length > 0
                      ? `0-${hydrated.length - 1}/${totalCount}`
                      : `*/${totalCount}`,
                }
              : {};

          if (wantsSingleObject) {
            if (hydrated.length !== 1) {
              sendJson(res, 406, {
                code: 'PGRST116',
                details: `The result contains ${hydrated.length} rows`,
                hint: null,
                message: 'JSON object requested, multiple (or no) rows returned',
              });
              return;
            }
            sendJson(res, 200, hydrated[0], extraHeaders);
            return;
          }

          sendJson(res, 200, hydrated, extraHeaders);
          return;
        }

        if (req.method === 'POST') {
          const rawBody = await readJsonBody(req);
          const records = Array.isArray(rawBody) ? rawBody : [rawBody];
          if (records.length === 0) {
            sendJson(res, 201, []);
            return;
          }

          const colSet = new Set();
          for (const rec of records) {
            Object.keys(rec).forEach((k) => {
              if (rec[k] !== undefined && tableColumns.get(tableName).has(k)) {
                colSet.add(k);
              }
            });
          }
          const cols = Array.from(colSet);
          const params = [];
          const valueTuples = records.map((rec) => {
            const tuple = cols.map((col) => {
              params.push(prepareColumnValue(tableName, col, rec[col]));
              return castParamPlaceholder(tableName, col, params.length);
            });
            return `(${tuple.join(', ')})`;
          });

          let conflictSql = '';
          if (isUpsert) {
            const onConflictParam = url.searchParams.get('on_conflict');
            const conflictCols = onConflictParam
              ? onConflictParam.split(',').map((c) => c.trim())
              : (tablePrimaryKeys.get(tableName) || []);
            if (conflictCols.length > 0) {
              const updateCols = cols.filter((c) => !conflictCols.includes(c));
              if (updateCols.length > 0) {
                conflictSql = ` ON CONFLICT (${conflictCols.map(quoteIdent).join(', ')}) DO UPDATE SET ${updateCols
                  .map((c) => `${quoteIdent(c)} = EXCLUDED.${quoteIdent(c)}`)
                  .join(', ')}`;
              } else {
                conflictSql = ` ON CONFLICT (${conflictCols.map(quoteIdent).join(', ')}) DO NOTHING`;
              }
            }
          }

          const insertSql =
            cols.length > 0
              ? `INSERT INTO public.${quoteIdent(tableName)} (${cols
                  .map(quoteIdent)
                  .join(', ')}) VALUES ${valueTuples.join(', ')}${conflictSql} RETURNING *`
              : `INSERT INTO public.${quoteIdent(tableName)} DEFAULT VALUES RETURNING *`;

          const insertRes = await pg.queryAs(dbSession, insertSql, params);
          if (!wantsRepresentation && !url.searchParams.has('select') && !wantsSingleObject) {
            sendJson(res, 201, null);
            return;
          }
          const hydrated = await hydrateRelationsAndProject(
            dbSession,
            tableName,
            insertRes.rows,
            selectRaw
          );
          if (wantsSingleObject) {
            if (hydrated.length !== 1) {
              sendJson(res, 406, {
                code: 'PGRST116',
                details: `The result contains ${hydrated.length} rows`,
                hint: null,
                message: 'JSON object requested, multiple (or no) rows returned',
              });
              return;
            }
            sendJson(res, 201, hydrated[0]);
            return;
          }
          sendJson(res, 201, hydrated);
          return;
        }

        if (req.method === 'PATCH') {
          const patchBody = await readJsonBody(req);
          const cols = Object.keys(patchBody).filter(
            (k) => patchBody[k] !== undefined && tableColumns.get(tableName).has(k)
          );
          if (cols.length === 0) {
            sendJson(res, 200, []);
            return;
          }
          const setParams = [];
          const setAssignments = cols.map((col) => {
            setParams.push(prepareColumnValue(tableName, col, patchBody[col]));
            return `${quoteIdent(col)} = ${castParamPlaceholder(tableName, col, setParams.length)}`;
          });
          const { whereSql, params } = buildWhereClause(tableName, url.searchParams, setParams);
          const updateRes = await pg.queryAs(
            dbSession,
            `UPDATE public.${quoteIdent(tableName)} SET ${setAssignments.join(
              ', '
            )} ${whereSql} RETURNING *`,
            params
          );
          if (!wantsRepresentation && !url.searchParams.has('select') && !wantsSingleObject) {
            sendJson(res, 200, []);
            return;
          }
          const hydrated = await hydrateRelationsAndProject(
            dbSession,
            tableName,
            updateRes.rows,
            selectRaw
          );
          if (wantsSingleObject) {
            if (hydrated.length !== 1) {
              sendJson(res, 406, {
                code: 'PGRST116',
                details: `The result contains ${hydrated.length} rows`,
                hint: null,
                message: 'JSON object requested, multiple (or no) rows returned',
              });
              return;
            }
            sendJson(res, 200, hydrated[0]);
            return;
          }
          sendJson(res, 200, hydrated);
          return;
        }

        if (req.method === 'DELETE') {
          const { whereSql, params } = buildWhereClause(tableName, url.searchParams);
          const delRes = await pg.queryAs(
            dbSession,
            `DELETE FROM public.${quoteIdent(tableName)} ${whereSql} RETURNING *`,
            params
          );
          const hydrated = await hydrateRelationsAndProject(
            dbSession,
            tableName,
            delRes.rows,
            selectRaw
          );
          sendJson(res, 200, wantsRepresentation ? hydrated : []);
          return;
        }
      }

      sendJson(res, 404, { message: `Unhandled loopback Supabase route: ${req.method} ${pathname}` });
    } catch (err) {
      sendJson(res, 400, {
        code: err?.code || 'P0001',
        message: err?.message || 'Database error',
        details: err?.detail || null,
        hint: err?.hint || null,
      });
    }
  });

  // 2. Loopback S3 / Cloudflare R2 Server (Path-style buckets)
  const r2Store = new Map(); // `${bucket}/${key}` -> { bucket, key, body: Buffer, contentType, lastModified: Date }

  const r2Server = http.createServer(async (req, res) => {
    setCorsHeaders(res);
    if (req.method === 'OPTIONS') {
      res.writeHead(204);
      res.end();
      return;
    }

    const url = new URL(req.url || '/', 'http://127.0.0.1');
    const pathname = decodeURIComponent(url.pathname);

    if (pathname === '/__test/objects' && req.method === 'GET') {
      const items = Array.from(r2Store.values()).map((obj) => ({
        bucket: obj.bucket,
        key: obj.key,
        size: obj.body.length,
        contentType: obj.contentType,
        lastModified: obj.lastModified.toISOString(),
      }));
      sendJson(res, 200, { objects: items });
      return;
    }

    if (pathname === '/__test/put-stale-object' && req.method === 'POST') {
      const { bucket = LOOPBACK_SECRETS.r2PrivateBucket, key, content = 'stale', lastModified } =
        await readJsonBody(req);
      const buf = Buffer.from(content, 'utf8');
      r2Store.set(`${bucket}/${key}`, {
        bucket,
        key,
        body: buf,
        contentType: 'application/octet-stream',
        lastModified: new Date(lastModified),
      });
      sendJson(res, 200, { ok: true });
      return;
    }

    const trimmed = pathname.replace(/^\/+/, '');
    const slashIdx = trimmed.indexOf('/');
    const bucket = slashIdx === -1 ? trimmed : trimmed.slice(0, slashIdx);
    const key = slashIdx === -1 ? '' : trimmed.slice(slashIdx + 1);

    // S3 ListObjectsV2: GET /<bucket>?list-type=2&prefix=...
    if (req.method === 'GET' && !key && url.searchParams.get('list-type') === '2') {
      const prefix = url.searchParams.get('prefix') || '';
      const matches = Array.from(r2Store.values()).filter(
        (obj) => obj.bucket === bucket && obj.key.startsWith(prefix)
      );
      const contentsXml = matches
        .map(
          (obj) =>
            `<Contents><Key>${escapeXml(obj.key)}</Key><LastModified>${obj.lastModified.toISOString()}</LastModified><ETag>&quot;loopback-etag&quot;</ETag><Size>${obj.body.length}</Size><StorageClass>STANDARD</StorageClass></Contents>`
        )
        .join('');
      const xml = `<?xml version="1.0" encoding="UTF-8"?><ListBucketResult xmlns="http://s3.amazonaws.com/doc/2006-03-01/"><Name>${escapeXml(
        bucket
      )}</Name><Prefix>${escapeXml(prefix)}</Prefix><KeyCount>${
        matches.length
      }</KeyCount><MaxKeys>1000</MaxKeys><IsTruncated>false</IsTruncated>${contentsXml}</ListBucketResult>`;
      res.writeHead(200, { 'Content-Type': 'application/xml' });
      res.end(xml);
      return;
    }

    // S3 DeleteObjects: POST /<bucket>?delete
    if (req.method === 'POST' && url.searchParams.has('delete')) {
      const xmlBody = (await readBodyBuffer(req)).toString('utf8');
      const keys = Array.from(xmlBody.matchAll(/<Key>([\s\S]*?)<\/Key>/g)).map((m) =>
        m[1]
          .replace(/&lt;/g, '<')
          .replace(/&gt;/g, '>')
          .replace(/&quot;/g, '"')
          .replace(/&apos;/g, "'")
          .replace(/&amp;/g, '&')
      );
      for (const k of keys) {
        r2Store.delete(`${bucket}/${k}`);
      }
      const deletedXml = keys
        .map((k) => `<Deleted><Key>${escapeXml(k)}</Key></Deleted>`)
        .join('');
      const respXml = `<?xml version="1.0" encoding="UTF-8"?><DeleteResult xmlns="http://s3.amazonaws.com/doc/2006-03-01/">${deletedXml}</DeleteResult>`;
      res.writeHead(200, { 'Content-Type': 'application/xml' });
      res.end(respXml);
      return;
    }

    if (!bucket || !key) {
      res.writeHead(404);
      res.end();
      return;
    }

    const fullKey = `${bucket}/${key}`;

    if (req.method === 'PUT') {
      const body = await readBodyBuffer(req);
      r2Store.set(fullKey, {
        bucket,
        key,
        body,
        contentType: req.headers['content-type'] || 'application/octet-stream',
        lastModified: new Date(),
      });
      res.writeHead(200, { ETag: '"loopback-etag"' });
      res.end();
      return;
    }

    if (req.method === 'HEAD') {
      const obj = r2Store.get(fullKey);
      if (!obj) {
        res.writeHead(404);
        res.end();
        return;
      }
      res.writeHead(200, {
        'Content-Length': String(obj.body.length),
        'Content-Type': 'application/octet-stream',
        'X-Content-Type-Options': 'nosniff',
        'Last-Modified': obj.lastModified.toUTCString(),
        ETag: '"loopback-etag"',
      });
      res.end();
      return;
    }

    if (req.method === 'GET') {
      const obj = r2Store.get(fullKey);
      if (!obj) {
        const errXml = `<?xml version="1.0" encoding="UTF-8"?><Error><Code>NoSuchKey</Code><Message>The specified key does not exist.</Message></Error>`;
        res.writeHead(404, { 'Content-Type': 'application/xml' });
        res.end(errXml);
        return;
      }
      res.writeHead(200, {
        'Content-Length': String(obj.body.length),
        'Content-Type': 'application/octet-stream',
        'X-Content-Type-Options': 'nosniff',
        'Last-Modified': obj.lastModified.toUTCString(),
        ETag: '"loopback-etag"',
      });
      res.end(obj.body);
      return;
    }

    if (req.method === 'DELETE') {
      r2Store.delete(fullKey);
      res.writeHead(204);
      res.end();
      return;
    }

    res.writeHead(405);
    res.end();
  });

  // 3. Loopback Resend Email Sink
  let resendFailNextCount = 0;
  const resendDeliveries = [];
  const resendIdempotencyCache = new Map();

  const resendServer = http.createServer(async (req, res) => {
    setCorsHeaders(res);
    const url = new URL(req.url || '/', 'http://127.0.0.1');

    if (url.pathname === '/__test/fail-next' && req.method === 'POST') {
      const body = await readJsonBody(req);
      resendFailNextCount = Number(body.count ?? 1);
      sendJson(res, 200, { ok: true, failNextCount: resendFailNextCount });
      return;
    }

    if (url.pathname === '/__test/deliveries' && req.method === 'GET') {
      sendJson(res, 200, { deliveries: resendDeliveries });
      return;
    }

    if (url.pathname === '/__test/deliveries' && req.method === 'DELETE') {
      resendDeliveries.length = 0;
      resendIdempotencyCache.clear();
      resendFailNextCount = 0;
      sendJson(res, 200, { ok: true });
      return;
    }

    if (url.pathname === '/emails' && req.method === 'POST') {
      const body = await readJsonBody(req);
      if (resendFailNextCount > 0) {
        resendFailNextCount -= 1;
        sendJson(res, 503, { message: 'Simulated transient Resend 503 outage' });
        return;
      }
      const idemKey = String(req.headers['idempotency-key'] || '');
      if (idemKey && resendIdempotencyCache.has(idemKey)) {
        sendJson(res, 200, { id: resendIdempotencyCache.get(idemKey) });
        return;
      }
      const messageId = `re_msg_${crypto.randomUUID().replace(/-/g, '')}`;
      if (idemKey) resendIdempotencyCache.set(idemKey, messageId);
      resendDeliveries.push({
        id: messageId,
        idempotencyKey: idemKey,
        to: body.to,
        subject: body.subject,
        html: body.html,
        receivedAt: new Date().toISOString(),
      });
      sendJson(res, 200, { id: messageId });
      return;
    }

    sendJson(res, 404, { message: 'Not found' });
  });

  const supabasePort = await listenOnPort(supabaseServer, preferredSupabasePort);
  const r2Port = await listenOnPort(r2Server, preferredR2Port);
  const resendPort = await listenOnPort(resendServer, preferredResendPort);

  supabaseOrigin = `http://127.0.0.1:${supabasePort}`;
  const r2Origin = `http://127.0.0.1:${r2Port}`;
  const resendOrigin = `http://127.0.0.1:${resendPort}`;

  return {
    supabaseOrigin,
    r2Origin,
    resendOrigin,
    envForApp(appOrigin) {
      return {
        NEXT_PUBLIC_SITE_URL: appOrigin,
        NEXT_PUBLIC_SUPABASE_URL: supabaseOrigin,
        NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: LOOPBACK_SECRETS.publishableKey,
        SUPABASE_SECRET_KEY: LOOPBACK_SECRETS.secretKey,
        CRON_SECRET: LOOPBACK_SECRETS.cronSecret,
        REVALIDATE_SECRET: LOOPBACK_SECRETS.revalidateSecret,
        REVALIDATION_SECRET: LOOPBACK_SECRETS.revalidateSecret,
        LEAD_IP_HASH_SALT: 'loopback-ip-hash-salt-2026',
        NEXT_PUBLIC_TURNSTILE_SITE_KEY: '',
        TURNSTILE_SECRET_KEY: '',
        GOOGLE_CREDENTIALS_B64: '',
        BLOGGER_BLOG_ID: '',
        BLOGGER_ID: '',
        RESEND_API_KEY: LOOPBACK_SECRETS.resendApiKey,
        RESEND_API_BASE_URL: resendOrigin,
        RESEND_FROM_EMAIL: 'Md. Redwan Ahmed <no-reply@redwan.work>',
        EMAIL_OUTBOX_BASE_DELAY_MS: '50',
        R2_ENDPOINT: r2Origin,
        R2_PRIVATE_BUCKET: LOOPBACK_SECRETS.r2PrivateBucket,
        R2_PRIVATE_ACCESS_KEY_ID: LOOPBACK_SECRETS.r2AccessKeyId,
        R2_PRIVATE_SECRET_ACCESS_KEY: LOOPBACK_SECRETS.r2SecretAccessKey,
        R2_PUBLIC_BUCKET: LOOPBACK_SECRETS.r2PublicBucket,
        R2_PUBLIC_ACCESS_KEY_ID: LOOPBACK_SECRETS.r2AccessKeyId,
        R2_PUBLIC_SECRET_ACCESS_KEY: LOOPBACK_SECRETS.r2SecretAccessKey,
        NEXT_PUBLIC_R2_PUBLIC_BASE_URL: `${r2Origin}/${LOOPBACK_SECRETS.r2PublicBucket}`,
        BLOGGER_FIXTURE_POSTS_JSON: JSON.stringify(BLOGGER_FIXTURE_POSTS),
      };
    },
    async close() {
      await Promise.all([
        new Promise((resolve) => supabaseServer.close(() => resolve())),
        new Promise((resolve) => r2Server.close(() => resolve())),
        new Promise((resolve) => resendServer.close(() => resolve())),
      ]);
      await pg.close();
    },
  };
}
