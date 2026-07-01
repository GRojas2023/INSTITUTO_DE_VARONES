const {
  getConfigConsejoCorreccional,
  updateConfigConsejoCorreccional,
  getConfigCentroEvaluacionProcesados,
  updateConfigCentroEvaluacionProcesados,
  getSancionesArticleOptions,
  getSancionesCalificacionOptions,
} = require("../_lib/sheets");

const getRouteName = (req) => {
  const value = req.query?.name;
  if (Array.isArray(value)) return value[0] || "";
  if (value) return value;

  const pathname = new URL(req.url, "http://localhost").pathname;
  return pathname.split("/").filter(Boolean).at(-1) || "";
};

module.exports = async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, PUT, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") {
    return res.status(204).end();
  }

  try {
    const name = getRouteName(req);

    if (name === "consejo-correccional") {
      if (req.method === "GET") {
        return res.status(200).json(await getConfigConsejoCorreccional());
      }

      if (req.method === "PUT") {
        const { rows = [] } = req.body || {};
        return res.status(200).json(await updateConfigConsejoCorreccional(rows));
      }
    }

    if (name === "centro-evaluacion-procesados") {
      if (req.method === "GET") {
        return res.status(200).json(await getConfigCentroEvaluacionProcesados());
      }

      if (req.method === "PUT") {
        const { rows = [] } = req.body || {};
        return res.status(200).json(await updateConfigCentroEvaluacionProcesados(rows));
      }
    }

    if (name === "sanciones-articulos") {
      if (req.method === "GET") {
        return res.status(200).json(await getSancionesArticleOptions());
      }
    }

    if (name === "sanciones-calificaciones") {
      if (req.method === "GET") {
        return res.status(200).json(await getSancionesCalificacionOptions());
      }
    }

    return res.status(405).json({ error: "Metodo no permitido." });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
};
