const { uploadInternoPhoto } = require("../_lib/cloudinary");

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
    return res.status(201).json(await uploadInternoPhoto(req.body || {}));
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
};
