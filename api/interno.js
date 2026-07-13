const { appendInterno, findInternoByLpu, getInternosRows } = require("./_lib/sheets");

module.exports = async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") {
    return res.status(204).end();
  }

  if (!["GET", "POST"].includes(req.method)) {
    return res.status(405).json({ error: "Metodo no permitido." });
  }

  try {
    if (req.method === "POST") {
      return res.status(201).json(await appendInterno(req.body || {}));
    }

    const url = new URL(req.url, "http://localhost");
    const lpu = url.searchParams.get("lpu") || "";
    if (lpu) {
      return res.status(200).json(await findInternoByLpu(lpu));
    }
    // Sin lpu: devolver todos los internos
    return res.status(200).json(await getInternosRows());
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
};
