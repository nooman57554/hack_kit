import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import express from "express";
import helmet from "helmet";
import swaggerUi from "swagger-ui-express";
import YAML from "yaml";
import apiRouter from "./routes/index.js";
import { errorHandler } from "./middleware/error.middleware.js";

function findOpenApiPath(): string | null {
  const currentDir = dirname(fileURLToPath(import.meta.url));
  const candidates = [
    resolve(currentDir, "../../../docs/openapi.yaml"),
    resolve(process.cwd(), "docs/openapi.yaml"),
    resolve(process.cwd(), "../../docs/openapi.yaml"),
  ];
  for (const candidate of candidates) {
    if (existsSync(candidate)) {
      return candidate;
    }
  }
  return null;
}

const app = express();

app.use(
  helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        styleSrc: ["'self'", "'unsafe-inline'"],
        imgSrc: ["'self'", "data:"],
        scriptSrc: ["'self'"],
      },
    },
  })
);
app.use(express.json());

app.get("/", (_req, res) => {
  res.json({
    name: "Hack Kit API",
    version: "1.0.0",
    docs: "/api-docs",
    openapi: "/openapi.yaml",
  });
});

const openApiPath = findOpenApiPath();
if (openApiPath) {
  const openApiRaw = readFileSync(openApiPath, "utf8");
  const openApiSpec = YAML.parse(openApiRaw) as Record<string, unknown>;

  app.get("/openapi.yaml", (_req, res) => {
    res.type("text/yaml; charset=utf-8").send(openApiRaw);
  });

  app.use(
    "/api-docs",
    swaggerUi.serve,
    swaggerUi.setup(openApiSpec, {
      customSiteTitle: "SkillPass API Documentation",
    })
  );
}

app.use("/api", apiRouter);

// Centralized error handler
app.use(errorHandler);

export default app;
