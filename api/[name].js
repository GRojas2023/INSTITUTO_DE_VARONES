const {
  getAlojamientoRows,
  getNovedadesRows,
  getParteDiarioActual,
  getParteDiarioArchivado,
  getPartePersonalServicioArchivo,
  saveParteDiarioActual,
  saveParteDiario,
} = require("./_lib/sheets");

const getParteDiarioConfig = () => ({
  googleSheetsUrl: process.env.GOOGLE_SHEETS_URL || process.env.APPS_SCRIPT_URL || "",
});

const getRouteName = (req) => {
  const url = new URL(req.url, "http://localhost");
  const value = url.searchParams.get("name");
  if (value) return value;

  const pathname = url.pathname;
  return pathname.split("/").filter(Boolean).at(-1) || "";
};

module.exports = async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, PUT, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") {
    return res.status(204).end();
  }

  try {
    const name = getRouteName(req);

    if (name === "alojamiento") {
      if (req.method === "GET") {
        return res.status(200).json(await getAlojamientoRows());
      }
      return res.status(405).json({ error: "Metodo no permitido." });
    }

    if (name === "novedades") {
      if (req.method === "GET") {
        return res.status(200).json(await getNovedadesRows());
      }
      return res.status(405).json({ error: "Metodo no permitido." });
    }

    if (name === "parte-diario-config") {
      if (req.method === "GET") {
        return res.status(200).json(getParteDiarioConfig());
      }
      return res.status(405).json({ error: "Metodo no permitido." });
    }

    if (name === "parte-diario-actual") {
      if (req.method === "GET") {
        return res.status(200).json(await getParteDiarioActual());
      }

      if (req.method === "PUT") {
        const { sections } = req.body || {};
        return res.status(200).json(await saveParteDiarioActual(sections || {}));
      }

      return res.status(405).json({ error: "Metodo no permitido." });
    }

    if (name === "parte-diario-archivado") {
      if (req.method === "GET") {
        return res.status(200).json(await getParteDiarioArchivado());
      }
      return res.status(405).json({ error: "Metodo no permitido." });
    }

    if (name === "parte-diario-personal-servicio") {
      if (req.method === "GET") {
        return res.status(200).json(await getPartePersonalServicioArchivo());
      }
      return res.status(405).json({ error: "Metodo no permitido." });
    }

    if (name === "parte-diario") {
      if (req.method === "POST") {
        const { sections } = req.body || {};
        return res.status(201).json(await saveParteDiario(sections || {}));
      }
      return res.status(405).json({ error: "Metodo no permitido." });
    }

    return res.status(404).json({ error: "Endpoint no encontrado." });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
};
