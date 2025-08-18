// index.js
// Run with: node index.js
// Env: DATABASE_URL (Supabase Postgres), PORT (Render provides automatically)

const express = require("express");
const cors = require("cors");
const { Pool } = require("pg");

const app = express();
app.use(cors());
app.use(express.json());

// ---- Postgres (Supabase) ----
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }, // Supabase SSL
});

// Helper: clamp to >= 0 (for remove ops)
const clampNonNeg = (n) => (n < 0 ? 0 : n);

// Helper: list of numeric nutrient fields we accept
const NUTRIENT_FIELDS = ["calories", "protein", "carbs", "fats", "fiber", "water"];

// ---- Health check ----
app.get("/", (_req, res) => res.send("Nutrition API is up!"));

// ---------- USERS ----------

// Get all users
app.get("/api/users", async (req, res) => {
  try {
    const { rows } = await pool.query(`SELECT * FROM users ORDER BY created_at DESC`);
    res.json(rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to fetch users" });
  }
});

// Get one user + today’s daily intake + this week’s intakes
app.get("/api/users/:id", async (req, res) => {
  const userId = req.params.id;

  // Week range (Mon–Sun) in server local time
  const today = new Date();
  const day = today.getDay(); // 0=Sun .. 6=Sat
  const diffToMonday = (day + 6) % 7; // days to Monday
  const monday = new Date(today);
  monday.setDate(today.getDate() - diffToMonday);
  const sunday = new Date(monday);
  sunday.setDate(monday.getDate() + 6);

  const toISO = (d) => d.toISOString().slice(0, 10);

  try {
    const userQ = await pool.query(`SELECT * FROM users WHERE id = $1`, [userId]);
    if (userQ.rows.length === 0) return res.status(404).json({ error: "User not found" });

    const todayStr = toISO(today);
    const weekStart = toISO(monday);
    const weekEnd = toISO(sunday);

    const dailyQ = await pool.query(
      `SELECT * FROM daily_intakes WHERE user_id = $1 AND date = $2`,
      [userId, todayStr]
    );

    const weeklyQ = await pool.query(
      `SELECT * FROM weekly_intakes WHERE user_id = $1 AND date BETWEEN $2 AND $3 ORDER BY date ASC`,
      [userId, weekStart, weekEnd]
    );

    res.json({
      user: userQ.rows[0],
      dailyIntakeToday: dailyQ.rows[0] || null,
      weeklyIntakeThisWeek: weeklyQ.rows,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to fetch user" });
  }
});

// ---------- INTAKES ----------
// We support 3 endpoints you asked for:
// 1) POST  /api/intake/add/:id     -> increment nutrients for given date/scope
// 2) PUT   /api/intake/edit/:id    -> set (overwrite) nutrients for given date/scope
// 3) POST  /api/intake/remove/:id  -> decrement nutrients for given date/scope
//
// Body format (for all three):
// {
//   "scope": "daily" | "weekly",
//   "date": "YYYY-MM-DD",   // required
//   "calories": 2000, "protein": 150, "carbs": 200, "fats": 80, "fiber": 25, "water": 2.5
// }
//
// Notes:
// - add:    creates if missing, otherwise increments existing values
// - edit:   upserts the record to EXACTLY the provided values (missing fields default to 0)
// - remove: decrements; clamped to >= 0; creates empty record if missing then applies clamp

function tableForScope(scope) {
  if (scope === "daily") return "daily_intakes";
  if (scope === "weekly") return "weekly_intakes";
  return null;
}

// ADD (increment)
app.post("/api/intake/add/:id", async (req, res) => {
  const userId = req.params.id;
  const { scope, date, ...payload } = req.body;
  const table = tableForScope(scope);
  if (!table) return res.status(400).json({ error: "scope must be 'daily' or 'weekly'" });
  if (!date) return res.status(400).json({ error: "date is required (YYYY-MM-DD)" });

  try {
    // Fetch existing row
    const { rows } = await pool.query(
      `SELECT * FROM ${table} WHERE user_id = $1 AND date = $2`,
      [userId, date]
    );

    if (rows.length === 0) {
      // Insert new row with provided values (missing -> 0)
      const vals = NUTRIENT_FIELDS.map((f) => Number(payload[f] ?? 0));
      const q = `
        INSERT INTO ${table}
          (user_id, date, ${NUTRIENT_FIELDS.join(", ")})
        VALUES
          ($1, $2, $3, $4, $5, $6, $7, $8)
        RETURNING *`;
      const ins = await pool.query(q, [userId, date, ...vals]);
      return res.json({ status: "created", intake: ins.rows[0] });
    } else {
      // Update by incrementing
      const current = rows[0];
      const newVals = {};
      NUTRIENT_FIELDS.forEach((f) => {
        const addBy = Number(payload[f] ?? 0);
        newVals[f] = Number(current[f] ?? 0) + addBy;
      });

      const q = `
        UPDATE ${table}
        SET calories = $3, protein = $4, carbs = $5, fats = $6, fiber = $7, water = $8, updated_at = NOW()
        WHERE user_id = $1 AND date = $2
        RETURNING *`;
      const upd = await pool.query(q, [
        userId,
        date,
        newVals.calories,
        newVals.protein,
        newVals.carbs,
        newVals.fats,
        newVals.fiber,
        newVals.water,
      ]);
      return res.json({ status: "updated", intake: upd.rows[0] });
    }
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to add intake" });
  }
});

// EDIT (set/overwrite)
app.put("/api/intake/edit/:id", async (req, res) => {
  const userId = req.params.id;
  const { scope, date, ...payload } = req.body;
  const table = tableForScope(scope);
  if (!table) return res.status(400).json({ error: "scope must be 'daily' or 'weekly'" });
  if (!date) return res.status(400).json({ error: "date is required (YYYY-MM-DD)" });

  // Defaults for any missing numeric fields
  const vals = NUTRIENT_FIELDS.map((f) => Number(payload[f] ?? 0));

  try {
    const q = `
      INSERT INTO ${table} (user_id, date, ${NUTRIENT_FIELDS.join(", ")})
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
      ON CONFLICT (user_id, date)
      DO UPDATE SET
        calories = EXCLUDED.calories,
        protein  = EXCLUDED.protein,
        carbs    = EXCLUDED.carbs,
        fats     = EXCLUDED.fats,
        fiber    = EXCLUDED.fiber,
        water    = EXCLUDED.water,
        updated_at = NOW()
      RETURNING *`;
    const up = await pool.query(q, [userId, date, ...vals]);
    res.json({ status: "upserted", intake: up.rows[0] });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to edit intake" });
  }
});

// REMOVE (decrement)
app.post("/api/intake/remove/:id", async (req, res) => {
  const userId = req.params.id;
  const { scope, date, ...payload } = req.body;
  const table = tableForScope(scope);
  if (!table) return res.status(400).json({ error: "scope must be 'daily' or 'weekly'" });
  if (!date) return res.status(400).json({ error: "date is required (YYYY-MM-DD)" });

  try {
    const { rows } = await pool.query(
      `SELECT * FROM ${table} WHERE user_id = $1 AND date = $2`,
      [userId, date]
    );

    const base = rows[0] || {
      calories: 0,
      protein: 0,
      carbs: 0,
      fats: 0,
      fiber: 0,
      water: 0,
    };

    const newVals = {};
    NUTRIENT_FIELDS.forEach((f) => {
      const removeBy = Number(payload[f] ?? 0);
      newVals[f] = clampNonNeg(Number(base[f] ?? 0) - removeBy);
    });

    const q = `
      INSERT INTO ${table} (user_id, date, ${NUTRIENT_FIELDS.join(", ")})
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
      ON CONFLICT (user_id, date)
      DO UPDATE SET
        calories = $3,
        protein  = $4,
        carbs    = $5,
        fats     = $6,
        fiber    = $7,
        water    = $8,
        updated_at = NOW()
      RETURNING *`;

    const up = await pool.query(q, [
      userId,
      date,
      newVals.calories,
      newVals.protein,
      newVals.carbs,
      newVals.fats,
      newVals.fiber,
      newVals.water,
    ]);

    res.json({ status: "updated", intake: up.rows[0] });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to remove intake" });
  }
});

// ----- Start server -----
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Nutrition API listening on :${PORT}`);
});
