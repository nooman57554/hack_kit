import { Router } from "express";
import healthRouter from "./health.js";
import authRouter from "../modules/auth/auth.routes.js";
import coursesRouter from "../modules/courses/courses.routes.js";
import batchesRouter from "../modules/batches/batches.routes.js";

const apiRouter = Router();

apiRouter.use("/health", healthRouter);
apiRouter.use("/auth", authRouter);
apiRouter.use("/courses", coursesRouter);
apiRouter.use("/batches", batchesRouter);

export default apiRouter;
