const { getSancionConfigD3 } = require("../_lib/sheets");
const { buildSancionActaHtml } = require("../_lib/sancion-acta");

module.exports = async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") {
    return res.status(204).end();
  }

  if (req.method !== "POST") {
    return res.status(405).json({ error: "Metodo no permitido." });
  }

  try {
    const { values = [] } = req.body || {};
    if (!Array.isArray(values) || !values.some((value) => String(value || "").trim() !== "")) {
      return res.status(400).json({ error: "No hay datos de sancion para renderizar el acta." });
    }

    const configSancion = await getSancionConfigD3();
    return res.status(200).json(buildSancionActaHtml({ values, configSancion }));
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
};
