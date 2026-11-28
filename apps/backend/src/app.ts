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

const swaggerAuthScript = String.raw`
(() => {
  const panelId = "skillpass-email-password-auth";

  function addLoginPanel() {
    const containers = document.querySelectorAll(
      ".swagger-ui .auth-container"
    );

    containers.forEach((container) => {
      if (container.querySelector("#" + panelId)) {
        return;
      }

      const heading = container.querySelector("h4, h5");
      if (!heading || !/BearerAuth/i.test(heading.textContent || "")) {
        return;
      }

      const panel = document.createElement("form");
      panel.id = panelId;
      panel.style.cssText =
        "margin:12px 0 18px;padding:14px;border:1px solid #bbb;" +
        "border-radius:4px;background:rgba(127,127,127,.06);";

      panel.innerHTML = [
        '<strong style="display:block;margin-bottom:10px;">Sign in with email and password</strong>',
        '<label for="skillpass-auth-email" style="display:block;margin:8px 0 4px;">Email</label>',
        '<input id="skillpass-auth-email" type="email" autocomplete="username" required style="box-sizing:border-box;width:100%;max-width:420px;padding:8px;">',
        '<label for="skillpass-auth-password" style="display:block;margin:8px 0 4px;">Password</label>',
        '<input id="skillpass-auth-password" type="password" autocomplete="current-password" required style="box-sizing:border-box;width:100%;max-width:420px;padding:8px;">',
        '<div style="display:flex;align-items:center;gap:10px;margin-top:10px;">',
        '<button type="submit" class="btn authorize">Sign in</button>',
        '<span id="skillpass-auth-message" role="alert"></span>',
        '</div>',
        '<p style="margin:10px 0 0;">Or enter a JWT directly in the Bearer token field below.</p>'
      ].join("");

      const jwtInput = container.querySelector("input");
      const jwtSection =
        jwtInput?.closest(".wrapper") || jwtInput?.parentElement;

      if (jwtSection && jwtSection.parentElement === container) {
        container.insertBefore(panel, jwtSection);
      } else {
        container.insertBefore(panel, container.firstChild);
      }

      panel.addEventListener("submit", async (event) => {
        event.preventDefault();

        const emailInput = panel.querySelector("#skillpass-auth-email");
        const passwordInput = panel.querySelector("#skillpass-auth-password");
        const message = panel.querySelector("#skillpass-auth-message");
        const submitButton = panel.querySelector('button[type="submit"]');

        const email = emailInput.value.trim();
        const password = passwordInput.value;

        message.textContent = "";
        message.style.color = "#b42318";
        submitButton.disabled = true;
        submitButton.textContent = "Signing in…";

        try {
          const response = await fetch(
            new URL("/api/auth/login", window.location.origin),
            {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
                Accept: "application/json",
              },
              body: JSON.stringify({ email, password }),
            }
          );

          const payload = await response.json().catch(() => null);
          const token = payload?.data?.token;

          if (!response.ok || typeof token !== "string" || !token) {
            throw new Error(
              payload?.error?.message ||
                "Sign-in failed. Check your email and password."
            );
          }

          if (
            !window.ui ||
            typeof window.ui.preauthorizeApiKey !== "function"
          ) {
            throw new Error(
              "Swagger authorization is not ready. Reload the docs and try again."
            );
          }

          window.ui.preauthorizeApiKey("BearerAuth", token);

          message.style.color = "#198754";
          message.textContent = "Signed in. Bearer authorization is set.";
          passwordInput.value = "";
        } catch (error) {
          message.style.color = "#b42318";
          message.textContent =
            error instanceof Error ? error.message : "Sign-in failed.";
        } finally {
          submitButton.disabled = false;
          submitButton.textContent = "Sign in";
        }
      });
    });
  }

  function start() {
    addLoginPanel();

    const observer = new MutationObserver(addLoginPanel);
    observer.observe(document.body, {
      childList: true,
      subtree: true,
    });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", start, { once: true });
  } else {
    start();
  }
})();
`;

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

    app.get("/swagger-auth.js", (_req, res) => {
        res.type("application/javascript; charset=utf-8").send(swaggerAuthScript);
    });

    app.use(
        "/api-docs",
        swaggerUi.serve,
        swaggerUi.setup(openApiSpec, {
            customSiteTitle: "SkillPass API Documentation",
            customJs: "/swagger-auth.js",
        })
    );
}

app.use("/api", apiRouter);

// Centralized error handler
app.use(errorHandler);

export default app;