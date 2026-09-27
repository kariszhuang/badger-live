import "server-only";
import postgres from "postgres";
import { Pool, type PoolClient } from "pg";

type Sql = ReturnType<typeof postgres>;
type QueryTarget = Pool | PoolClient;
class JsonValue { constructor(readonly value: unknown) {} }

// Vercel opens many short-lived instances. Supabase's session pooler runs out
// of connections under that pattern, while Postgres.js pipelines queries in a
// way the shared transaction pooler does not reliably support. Node-postgres
// sends one query at a time and keeps explicit transactions on one connection.
function transactionPoolClient(connectionString: string): Sql {
  const url = new URL(connectionString);
  url.port = "6543";
  const pool = new Pool({
    connectionString: url.toString(), max: 1, idleTimeoutMillis: 5_000,
    connectionTimeoutMillis: 3_000, ssl: { rejectUnauthorized: false },
  });

  function queryTag(target: QueryTarget) {
    const tag = (async (parts: TemplateStringsArray, ...values: unknown[]) => {
      const text = parts.reduce((query, part, index) => query + part + (index < values.length ? `$${index + 1}` : ""), "");
      const parameters = values.map((value) => value instanceof JsonValue ? JSON.stringify(value.value) : value);
      const result = await target.query(text, parameters);
      return result.rows;
    }) as unknown as Sql;
    tag.json = ((value: unknown) => new JsonValue(value)) as Sql["json"];
    tag.unsafe = (async (query: string) => (await target.query(query)).rows) as Sql["unsafe"];
    tag.begin = (async (callback: (transaction: Sql) => Promise<unknown>) => {
      const connection = await pool.connect();
      try {
        await connection.query("BEGIN");
        const value = await callback(queryTag(connection));
        await connection.query("COMMIT");
        return value;
      } catch (error) {
        await connection.query("ROLLBACK");
        throw error;
      } finally {
        connection.release();
      }
    }) as unknown as Sql["begin"];
    return tag;
  }

  return queryTag(pool);
}

export function createDatabaseClient(connectionString: string, timeoutSeconds = 3): Sql {
  const url = new URL(connectionString);
  if (process.env.VERCEL === "1" && url.hostname.endsWith(".pooler.supabase.com")) {
    return transactionPoolClient(connectionString);
  }
  return postgres(connectionString, { max: 1, connect_timeout: timeoutSeconds, idle_timeout: 5, prepare: false });
}
