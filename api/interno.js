const { findInternoByLpu } = require("./_lib/sheets");

module.exports = async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") {
    return res.status(204).end();
  }

  if (req.method !== "GET") {
    return res.status(405).json({ error: "Metodo no permitido." });
  }

  try {
    const lpu = req.query.lpu || "";
    return res.status(200).json(await findInternoByLpu(lpu));
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
};
