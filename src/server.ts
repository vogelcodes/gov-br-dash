import { createApp } from "./app.js";
import { loadEnv } from "./config/index.js";

const env = loadEnv();

const app = await createApp(env);

await app.listen({ port: env.PORT, host: "0.0.0.0" });

console.log(`Server running at http://localhost:${env.PORT}`);
console.log(`Environment: ${env.NODE_ENV}`);
console.log(`Log level: ${env.LOG_LEVEL}`);
