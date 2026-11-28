import { Router } from "express";
import { outboxService } from "../modules/outbox/outbox.service.js";

const router = Router();

router.get("/", (_req, res) => {
  res.status(200).json({
    success: true,
    message: "API is running",
    timestamp: new Date().toISOString(),
  });
});

router.get("/outbox", async (_req, res) => {
  res.setHeader("Cache-Control", "no-store, max-age=0");
  const summary = await outboxService.getStatusSummary();
  res.status(200).json({
    success: true,
    data: summary,
    timestamp: new Date().toISOString(),
  });
});

export default router;