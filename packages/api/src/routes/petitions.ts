import { Router } from "express";
import { listPetitions, getPetition } from "@ki-bundestag/engine";

const router = Router();

/** GET /api/petitions — list petitions, newest first. Optional ?status and ?category filters. */
router.get("/api/petitions", (req, res) => {
  const { status, category } = req.query;
  const limitRaw = Number.parseInt(String(req.query.limit ?? "100"), 10);
  const limit = Number.isFinite(limitRaw) ? Math.min(Math.max(limitRaw, 1), 500) : 100;

  let petitions = listPetitions(limit);
  if (typeof status === "string") {
    petitions = petitions.filter(p => p.status === status);
  }
  if (typeof category === "string") {
    petitions = petitions.filter(p => p.category === category);
  }
  res.json({ petitions });
});

/** GET /api/petitions/:id — detail with signature timeline. */
router.get("/api/petitions/:id", (req, res) => {
  const petition = getPetition(req.params.id);
  if (!petition) {
    res.status(404).json({ error: "petition not found" });
    return;
  }
  res.json({ petition });
});

export default router;
