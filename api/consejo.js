const {
  getConsejoRows,
  insertConsejoRow,
  updateConsejoRow,
  deleteConsejoRow,
} = require("./_lib/sheets");

module.exports = async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") {
    return res.status(204).end();
  }

  try {
    if (req.method === "GET") {
      return res.status(200).json(await getConsejoRows());
    }

    if (req.method === "POST") {
      const { values = [] } = req.body || {};
      return res.status(201).json(await insertConsejoRow(values));
    }

    if (req.method === "PUT") {
      const { rowNumber, values = [] } = req.body || {};
      return res.status(200).json(await updateConsejoRow(rowNumber, values));
    }

    if (req.method === "DELETE") {
      const { rowNumber } = req.body || {};
      return res.status(200).json(await deleteConsejoRow(rowNumber));
    }

    return res.status(405).json({ error: "Metodo no permitido." });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
};
