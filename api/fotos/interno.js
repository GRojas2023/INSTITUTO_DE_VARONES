const { createInternoPhotoUploadSignature, getInternoPhotoDeliveryUrl } = require("../_lib/cloudinary");

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
    if (req.method === "GET") {
      const url = new URL(req.url, "http://localhost");
      return res.status(200).json(getInternoPhotoDeliveryUrl(url.searchParams.get("lpu") || ""));
    }

    return res.status(200).json(createInternoPhotoUploadSignature(req.body || {}));
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
};
