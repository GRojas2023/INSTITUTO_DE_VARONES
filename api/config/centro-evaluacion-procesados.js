const {
  getConfigCentroEvaluacionProcesados,
  updateConfigCentroEvaluacionProcesados,
} = require("../_lib/sheets");

module.exports = async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, PUT, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") {
    return res.status(204).end();
  }

  try {
    if (req.method === "GET") {
      return res.status(200).json(await getConfigCentroEvaluacionProcesados());
    }

    if (req.method === "PUT") {
      const { rows = [] } = req.body || {};
      return res.status(200).json(await updateConfigCentroEvaluacionProcesados(rows));
    }

    return res.status(405).json({ error: "Metodo no permitido." });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
};
