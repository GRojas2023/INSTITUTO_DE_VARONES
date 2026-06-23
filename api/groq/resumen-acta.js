const GROQ_API_URL = "https://api.groq.com/openai/v1/chat/completions";
const GROQ_MODEL = process.env.GROQ_MODEL || "llama-3.1-8b-instant";
const MAX_FIELD_CHARS = 1200;
const MAX_INPUT_CHARS = 9000;

const generarResumenActaConGroq = async ({ datos = [], acta = "" } = {}) => {
  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) {
    throw new Error("Falta configurar GROQ_API_KEY en Vercel.");
  }

  const campos = Array.isArray(datos)
    ? datos
      .map(({ campo, valor }) => {
        const nombre = String(campo || "").trim();
        const contenido = String(valor || "")
          .replace(/\s+/g, " ")
          .trim();

        if (!nombre || !contenido) return "";

        const recortado = contenido.length > MAX_FIELD_CHARS
          ? `${contenido.slice(0, MAX_FIELD_CHARS)}...`
          : contenido;

        return `${nombre}: ${recortado}`;
      })
      .filter(Boolean)
      .join("\n")
    : "";

  const contenidoBase = campos || String(acta || "").replace(/\s+/g, " ").trim();
  const contenido = contenidoBase.length > MAX_INPUT_CHARS
    ? `${contenidoBase.slice(0, MAX_INPUT_CHARS)}...`
    : contenidoBase;
  if (!contenido) {
    throw new Error("No hay informacion cargada para resumir.");
  }

  const response = await fetch(GROQ_API_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: GROQ_MODEL,
      temperature: 0.2,
      max_tokens: 350,
      messages: [
        {
          role: "system",
          content: "Redacta resumenes institucionales en espanol rioplatense, con tono formal, claro y juridico-administrativo. No inventes datos.",
        },
        {
          role: "user",
          content: `Con la informacion siguiente, redacta un resumen breve para incorporar en las conclusiones generales del acta. Debe sintetizar los datos relevantes de todas las areas, mantener nombres, LPU, expediente y tramite cuando existan, y no agregar informacion que no este en el texto.\n\n${contenido}`,
        },
      ],
    }),
  });

  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(data.error?.message || `Groq error: ${response.status}`);
  }

  const resumen = String(data.choices?.[0]?.message?.content || "").trim();
  if (!resumen) {
    throw new Error("Groq no devolvio un resumen.");
  }

  return { resumen, model: GROQ_MODEL };
};

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
    return res.status(200).json(await generarResumenActaConGroq(req.body || {}));
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
};
