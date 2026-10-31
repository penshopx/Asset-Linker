import { execFile } from "node:child_process";
import { mkdir, mkdtemp, rm } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import pg from "pg";

const exec = promisify(execFile);

/**
 * A disposable PostgreSQL cluster, not a connection to the workspace database.
 * Requires initdb/pg_ctl on PATH. Missing binaries fail the tests (never skip).
 * No TCP listener, inherited PG* settings, credentials, or external URL.
 */
export async function isolatedPostgres() {
  const generated = fileURLToPath(new URL("../../../../../generated-artifacts/", import.meta.url));
  await mkdir(generated, { recursive: true });
  const root = await mkdtemp(path.join(generated, "status-history-"));
  const data = path.join(root, "data");
  const socket = path.join(root, "socket");
  const env = { PATH: process.env.PATH, LANG: "C", LC_ALL: "C" };
  let started = false;
  const clients = new Set<pg.Client>();

  async function close() {
    await Promise.all([...clients].map((client) => client.end()));
    clients.clear();
    if (started) {
      await exec("pg_ctl", ["-D", data, "-m", "immediate", "-w", "stop"], { env, timeout: 15_000 });
      started = false;
    }
    await rm(root, { recursive: true, force: true });
  }

  try {
    await mkdir(socket, { mode: 0o700 });
    await exec("initdb", ["-D", data, "-U", "audit_test", "-A", "trust", "--no-locale", "--encoding=UTF8"], {
      env, timeout: 30_000,
    });
    await exec("pg_ctl", [
      "-D", data, "-l", path.join(root, "postgres.log"), "-w",
      "-o", `-F -k ${socket} -c listen_addresses='' -c max_connections=12`,
      "start",
    ], { env, timeout: 30_000 });
    started = true;
  } catch (error) {
    await close();
    throw error;
  }

  return {
    async connect(database = "postgres") {
      const client = new pg.Client({
        host: socket, port: 5432, user: "audit_test", password: "", database,
        ssl: false, connectionTimeoutMillis: 5_000, query_timeout: 8_000,
        statement_timeout: 7_000,
      });
      clients.add(client);
      await client.connect();
      return client;
    },
    async disconnect(client: pg.Client) {
      await client.end();
      clients.delete(client);
    },
    close,
  };
}
