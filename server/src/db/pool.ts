import pg from 'pg';
import 'dotenv/config';

// BIGINT(OID 20)를 문자열 대신 숫자로 파싱
// JS number는 2^53-1까지 안전, 게임 수치는 충분히 포함됨
pg.types.setTypeParser(20, (v) => parseInt(v, 10));
// NUMERIC(OID 1700)도 숫자로 파싱
pg.types.setTypeParser(1700, (v) => parseFloat(v));

const RAILWAY_DB = 'postgresql://postgres:kkdZoXIuKmAadyDcyOVzhPlJpiitIBhG@postgres.railway.internal:5432/railway';
const connStr = process.env.DATABASE_URL || (process.env.RAILWAY_SERVICE_NAME ? RAILWAY_DB : '');
console.log('[db] DATABASE_URL', connStr ? 'is SET' : 'using localhost fallback');

const POOL_OPTS = {
  max: 70,                        // Railway PG max_connections=100 고정 (증액 시도 거부 — 컨테이너 메모리 제한).
                                  // 롤링 배포 시 2인스턴스 × 70 = 140 > 100 이지만, 구 인스턴스 drain 완료 후 신 인스턴스가 채우므로 대체로 안전.
                                  // 연결수 늘리는 대신 OFFLINE_TICK_INTERVAL_MS 상향으로 쿼리 수 자체를 줄임 (engine.ts).
  idleTimeoutMillis: 30_000,
  connectionTimeoutMillis: 10_000,
  statement_timeout: 10_000,      // 15s → 10s (느린 쿼리 빠른 취소)
  query_timeout: 10_000,
};

export const pool = new pg.Pool(
  connStr
    ? { connectionString: connStr, ...POOL_OPTS }
    : {
        host: 'localhost',
        port: 5432,
        user: 'postgres',
        password: 'postgres',
        database: 'laststory',
        ...POOL_OPTS,
      }
);

pool.on('error', (err) => {
  console.error('[db] pool error', err);
});

export async function query<T extends pg.QueryResultRow = pg.QueryResultRow>(
  text: string,
  params?: unknown[]
): Promise<pg.QueryResult<T>> {
  return pool.query<T>(text, params);
}

export type TxClient = {
  query: <T extends pg.QueryResultRow = pg.QueryResultRow>(
    text: string,
    params?: unknown[]
  ) => Promise<pg.QueryResult<T>>;
};

export type TxOk = { ok: true };
export type TxErr = { error: string; status: number };

export async function withTransaction<T>(fn: (tx: TxClient) => Promise<T>): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const tx: TxClient = {
      query: <R extends pg.QueryResultRow>(text: string, params?: unknown[]) =>
        client.query<R>(text, params),
    };
    const result = await fn(tx);
    await client.query('COMMIT');
    return result;
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}
