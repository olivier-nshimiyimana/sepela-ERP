/**
 * @tauri-apps/plugin-sql (SQLite) expects $1, $2, … not ? placeholders.
 */

export function toSqliteParams(sql, params = []) {
  let n = 0;
  return {
    sql: sql.replace(/\?/g, () => `$${++n}`),
    params,
  };
}

export async function dbExecute(db, sql, params = []) {
  const { sql: s, params: p } = toSqliteParams(sql, params);
  return db.execute(s, p);
}

export async function dbSelect(db, sql, params = []) {
  const { sql: s, params: p } = toSqliteParams(sql, params);
  return db.select(s, p);
}
