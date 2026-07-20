const fs = require("fs/promises");
const path = require("path");

const TEMPLATE_PATH = path.resolve(__dirname, "..", "..", "ACTA_SANCION.html");

const escapeHtml = (value) => String(value || "")
  .replace(/&/g, "&amp;")
  .replace(/</g, "&lt;")
  .replace(/>/g, "&gt;")
  .replace(/"/g, "&quot;")
  .replace(/'/g, "&#39;");

const formatDateForSancionActa = (value) => {
  const text = String(value || "").trim();
  if (!text) return "";

  const isoMatch = text.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (isoMatch) {
    const [, year, month, day] = isoMatch;
    return `${day}/${month}/${year}`;
  }

  return text;
};

const getSpanishMonthName = (date) => new Intl.DateTimeFormat("es-AR", { month: "long" })
  .format(date)
  .replace(/^./, (letter) => letter.toUpperCase());

const normalizeMarkerKey = (value) => String(value || "")
  .replace(/<[^>]+>/g, " ")
  .replace(/&nbsp;/gi, " ")
  .replace(/Â/g, "")
  .replace(/Ã¡/g, "a")
  .replace(/Ã©/g, "e")
  .replace(/Ã­/g, "i")
  .replace(/Ã³/g, "o")
  .replace(/Ãº/g, "u")
  .replace(/Ã±/g, "n")
  .replace(/â€œ|â€|“|”/g, "")
  .toLowerCase()
  .normalize("NFD")
  .replace(/[\u0300-\u036f]/g, "")
  .replace(/[^a-z0-9]/g, "");

const buildReplacementMap = ({ values = [], configSancion = "" } = {}) => {
  const row = Array.from({ length: 19 }, (_, index) => String(values[index] || "").trim());
  const now = new Date();
  const day = String(now.getDate());
  const month = getSpanishMonthName(now);
  const year = String(now.getFullYear());
  const currentLongDate = `${day} dias del mes de ${month} del ano ${year}`;
  const currentLongDateAlt = `${day} dias del ${month} del ano ${year}`;
  const sancion = row[10] || configSancion;
  const entries = {
    "ACTA N": row[1],
    "ACTA N°": row[1],
    "año actual": year,
    "ano actual": year,
    "mes actual": month,
    "fecha actual en el formato 20 dias del Julio del año 2026": currentLongDateAlt,
    "fecha actual en el formato 20 dias del Julio del ano 2026": currentLongDateAlt,
    "fecha actual en el formato 20 dias del mes de Julio del año 2026": currentLongDate,
    "fecha actual en el formato 20 dias del mes de Julio del ano 2026": currentLongDate,
    EXPEDIENTE: row[0],
    INTERNO: row[2],
    LPU: row[3],
    "FECHA DEL HECHO": formatDateForSancionActa(row[4]),
    "DESCRIPCION DEL HECHO": row[5],
    TIPO: row[6],
    ARTICULOS: row[7],
    "ORDEN INTERNA": row[8],
    "FECHA ORDEN INTERNA": formatDateForSancionActa(row[9]),
    SANCION: sancion,
    "CONDUCTA INICIO": row[11],
    "CONCEPTO INICIO": row[12],
    "FASE INICIO": row[13],
    "CRITERIO CONDUCTA": row[14],
    "CRITERIO CONCEPTO": row[15],
    "CONDUCTA FINALIZA": row[16],
    "CONCEPTO FINALIZA": row[17] || row[12],
    "FASE FINALIZA": row[18],
    "es el valor que existe en el rango D3 de la hoja Configuracion": configSancion,
  };

  return Object.fromEntries(
    Object.entries(entries).map(([key, value]) => [normalizeMarkerKey(key), escapeHtml(value)])
  );
};

const replaceTemplateMarkers = (template, replacements) => template.replace(
  /(Â«|«)([\s\S]*?)(Â»|»)/g,
  (match, _open, rawKey) => {
    const key = normalizeMarkerKey(rawKey);
    return Object.prototype.hasOwnProperty.call(replacements, key) ? replacements[key] : "";
  }
);

const buildSancionActaHtml = async ({ values = [], configSancion = "" } = {}) => {
  const row = Array.from({ length: 19 }, (_, index) => String(values[index] || "").trim());
  const template = await fs.readFile(TEMPLATE_PATH, "utf8");
  const replacements = buildReplacementMap({ values: row, configSancion });
  const actaNumber = row[1] || "000";
  const title = `ACTA N ${actaNumber} / ${new Date().getFullYear()} C.C.`;

  return {
    html: replaceTemplateMarkers(template, replacements),
    title,
  };
};

module.exports = {
  buildSancionActaHtml,
};
