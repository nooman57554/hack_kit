import express from "express";
import helmet from "helmet";
import apiRouter from "./routes/index.js";
import { errorHandler } from "./middleware/error.middleware.js";

const app = express();

app.use(helmet());
app.use(express.json());

app.get("/", (_req, res) => {
    res.json({
        name: "Hack Kit API",
        version: "1.0.0",
    });
});

app.use("/api", apiRouter);

// Centralized error handler
app.use(errorHandler);

export default app;