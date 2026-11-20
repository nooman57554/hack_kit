import express from "express";
import helmet from "helmet";
import healthRouter from "./routes/health.js";

const app = express();

app.use(helmet());

app.use(express.json());

app.get("/", (_req, res) => {
    res.json({
        name: "Hack Kit API",
        version: "1.0.0"
    });
});

app.use("/api/health", healthRouter);

export default app;