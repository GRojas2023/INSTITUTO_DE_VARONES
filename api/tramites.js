const { getTramites, appendTramite, updateTramites } = require("./_lib/sheets");

module.exports = async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, PUT, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") {
    return res.status(204).end();
  }

  try {
    if (req.method === "GET") {
      return res.status(200).json(await getTramites());
    }

    if (req.method === "POST") {
      const { tramite } = req.body || {};
      return res.status(201).json(await appendTramite(tramite));
    }

    if (req.method === "PUT") {
      const { tramites = [] } = req.body || {};
      return res.status(200).json(await updateTramites(tramites));
    }

    return res.status(405).json({ error: "Metodo no permitido." });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
};
