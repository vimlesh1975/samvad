export function getNrcsDbConfig() {
  return {
    host: process.env.DB_HOST,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
  };
}

export function assertNrcsDbConfig(config = getNrcsDbConfig()) {
  if (!config.host || !config.user || !config.database) {
    throw new Error('Set DB_HOST, DB_USER, DB_PASSWORD, and DB_NAME in .env');
  }

  return config;
}
