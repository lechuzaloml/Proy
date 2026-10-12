import dotenv from "dotenv";
import express from "express";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { procesarPersonalizacion } from "./personalizar.js";

const root = resolve(fileURLToPath(new URL("..", import.meta.url)));
dotenv.config({ path: resolve(root, ".env.local") });

const app = express();
const port = Number(process.env.PORT ?? 3000);

app.use(express.json({ limit: "32kb" }));

app.post("/api/personalizar", async (request, response) => {
  const resultado = await procesarPersonalizacion(request.body);
  response.status(resultado.status).json(resultado.body);
});

if (
  process.env.NODE_ENV === "production" ||
  process.argv.includes("--production")
) {
  const dist = resolve(root, "dist");
  app.use(express.static(dist));
  app.use((request, response, next) => {
    if (request.method === "GET" && request.accepts("html")) {
      response.sendFile(resolve(dist, "index.html"));
      return;
    }
    next();
  });
} else {
  const { createServer: createViteServer } = await import("vite");
  const vite = await createViteServer({
    root,
    server: { middlewareMode: true },
    appType: "spa",
  });
  app.use(vite.middlewares);
}

app.use(
  (
    error: unknown,
    _request: express.Request,
    response: express.Response,
    next: express.NextFunction,
  ) => {
    if (response.headersSent) {
      next(error);
      return;
    }

    if (
      error &&
      typeof error === "object" &&
      "type" in error &&
      error.type === "entity.parse.failed"
    ) {
      response
        .status(400)
        .json({ error: "El cuerpo de la solicitud no es JSON válido." });
      return;
    }

    if (
      error &&
      typeof error === "object" &&
      "type" in error &&
      error.type === "entity.too.large"
    ) {
      response
        .status(413)
        .json({ error: "La solicitud excede el tamaño permitido." });
      return;
    }

    console.error("Error inesperado en el servidor:", error);
    response
      .status(500)
      .json({ error: "Ocurrió un error interno del servidor." });
  },
);

app.listen(port, () => {
  console.log(`Servidor disponible en http://localhost:${port}`);
});
