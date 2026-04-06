import pg from 'pg';
import 'dotenv/config';

// BIGINT(OID 20)를 문자열 대신 숫자로 파싱
// JS number는 2^53-1까지 안전, 게임 수치는 충분히 포함됨
pg.types.setTypeParser(20, (v) => parseInt(v, 10));
// NUMERIC(OID 1700)도 숫자로 파싱
pg.types.setTypeParser(1700, (v) => parseFloat(v));

export const pool = new pg.Pool({
  connectionString: process.env.DATABASE_URL,
});

pool.on('error', (err) => {
  console.error('[db] pool error', err);
});

export async function query<T extends pg.QueryResultRow = pg.QueryResultRow>(
  text: string,
  params?: unknown[]
): Promise<pg.QueryResult<T>> {
  return pool.query<T>(text, params);
}
