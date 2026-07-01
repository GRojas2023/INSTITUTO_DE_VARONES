const crypto = require("crypto");
const { execFile } = require("child_process");
const fs = require("fs/promises");
const http = require("http");
const os = require("os");
const path = require("path");
const { promisify } = require("util");

const execFileAsync = promisify(execFile);

const PORT = Number(process.env.PORT || 8780);
const HOST = "127.0.0.1";
const ROOT = __dirname;
const SPREADSHEET_ID = "1DuK6GHozJGHSUQ7TVDIKODDm5XJnNpq9k9lheHWLvHE";
const SHEET_RANGE = "consejo";
const SANCIONES_RANGE = "'SANCIONES_RESUELTA'!A:S";
const ARCHIVO_SHEET = "archivo";
const ARCHIVO_RANGE = "'archivo'!A:C";
const PARTE_DIARIO_ACTUAL_RANGE = "parte_diario_actual";
const PARTE_PERSONAL_SERVICIO_SHEET = "PERSONAL DE SERVICIO";
const PARTE_PERSONAL_SHEET = "PERSONAL";
const PARTE_NOVEDADES_SHEET = "NOVEDADES";
const PARTE_ALOJAMIENTO_SHEET = "ALOJAMIENTO";
const PARTE_OBSERVACIONES_SHEET = "OBSERVACIONES";
const CONFIG_TRAMITES_RANGE = "Configuracion!A:A";
const CONFIG_CONSEJO_RANGE = "Configuracion!C1:E10";
const CONFIG_CEIP_RANGE = "Configuracion!H1:J10";
const CONFIG_SANCIONES_ARTICULOS_RANGE = "Configuracion!N:P";
const INTERNOS_RANGE = "internos";
const PERSONAL_COMPLEJO_RANGE = "PERSONAL_COMPLEJO!E:F";
const ALOJAMIENTO_RANGE = "ALOJAMIENTO";
const SHEET_ID = 0;
const CREDENTIALS_PATH = path.join(ROOT, "credenciales.json");
const SANCIONES_ACTA_TEMPLATE_PATH = path.join(ROOT, "templates", "modelo_acta_sanciones_reparado.odt");
const SANCIONES_ACTA_SCRIPT_PATH = path.join(ROOT, "scripts", "generate_sancion_acta.ps1");
const SANCIONES_ACTA_HTML_SCRIPT_PATH = path.join(ROOT, "scripts", "render_sancion_acta_html.ps1");
const SHEET_CACHE_MS = 60000;
const GROQ_API_URL = "https://api.groq.com/openai/v1/chat/completions";
const GROQ_MODEL = process.env.GROQ_MODEL || "llama-3.1-8b-instant";
const SANCIONES_HEADERS = [
  "EXPEDIENTE",
  "ACTA N.º",
  "INTERNO",
  "LPU",
  "FECHA DEL HECHO",
  "DESCRIPCION DEL HECHO",
  "TIPO",
  "ARTICULOS",
  "ORDEN INTERNA",
  "FECHA ORDEN INTERNA",
  "SANCION",
  "CONDUCTA INICIO",
  "CONCEPTO INICIO",
  "FASE INICIO",
  "CRITERIO CONDUCTA",
  "CRITERIO CONCEPTO",
  "CONDUCTA FINALIZA",
  "CONCEPTO FINALIZA",
  "FASE FINALIZA",
];

let tokenCache = null;
let sheetCache = null;
let sancionesCache = null;
let tramitesCache = null;
let configConsejoCache = null;
let configCeipCache = null;
let configSancionesArticulosCache = null;
let internosCache = null;
let personalComplejoCache = null;
let alojamientoCache = null;
let parteDiarioActualCache = null;

const sendJson = (res, status, payload) => {
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Access-Control-Allow-Origin": "*",
  });
  res.end(JSON.stringify(payload));
};

const base64Url = (value) => Buffer.from(value)
  .toString("base64")
  .replace(/=/g, "")
  .replace(/\+/g, "-")
  .replace(/\//g, "_");

const getAccessToken = async () => {
  if (tokenCache && tokenCache.expiresAt > Date.now() + 60000) {
    return tokenCache.token;
  }

  const credentials = JSON.parse(await fs.readFile(CREDENTIALS_PATH, "utf8"));
  const now = Math.floor(Date.now() / 1000);
  const header = base64Url(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  const claim = base64Url(JSON.stringify({
    iss: credentials.client_email,
    scope: "https://www.googleapis.com/auth/spreadsheets",
    aud: credentials.token_uri,
    exp: now + 3600,
    iat: now,
  }));
  const unsignedJwt = `${header}.${claim}`;
  const signature = crypto
    .createSign("RSA-SHA256")
    .update(unsignedJwt)
    .sign(credentials.private_key, "base64")
    .replace(/=/g, "")
    .replace(/\+/g, "-")
    .replace(/\//g, "_");
  const jwt = `${unsignedJwt}.${signature}`;

  const response = await fetch(credentials.token_uri, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion: jwt,
    }),
  });

  if (!response.ok) {
    throw new Error(`Google auth error: ${response.status}`);
  }

  const data = await response.json();
  tokenCache = {
    token: data.access_token,
    expiresAt: Date.now() + (data.expires_in * 1000),
  };

  return tokenCache.token;
};

const getConsejoRows = async (forceRefresh = false) => {
  if (!forceRefresh && sheetCache && sheetCache.expiresAt > Date.now()) {
    return sheetCache.data;
  }

  const token = await getAccessToken();
  const url = new URL(`https://sheets.googleapis.com/v4/spreadsheets/${SPREADSHEET_ID}/values/${encodeURIComponent(SHEET_RANGE)}`);
  const response = await fetch(url, {
    headers: { Authorization: `Bearer ${token}` },
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Google Sheets error: ${response.status} ${text}`);
  }

  const data = await response.json();
  const values = data.values || [];
  const headers = values[0] || [];
  const rowPairs = values.slice(1)
    .map((row, index) => ({ row, rowNumber: index + 2 }))
    .filter(({ row }) => row.some((cell) => String(cell || "").trim() !== ""));
  const rows = rowPairs.map(({ row }) => row);
  const rowNumbers = rowPairs.map(({ rowNumber }) => rowNumber);

  sheetCache = {
    data: { headers, rows, rowNumbers, cachedAt: new Date().toISOString() },
    expiresAt: Date.now() + SHEET_CACHE_MS,
  };

  return sheetCache.data;
};

const rowsFromSheetValues = (values) => {
  const headers = values[0] || [];
  const rowPairs = values.slice(1)
    .map((row, index) => ({ row, rowNumber: index + 2 }))
    .filter(({ row }) => row.some((cell) => String(cell || "").trim() !== ""));

  return {
    headers,
    rows: rowPairs.map(({ row }) => row),
    rowNumbers: rowPairs.map(({ rowNumber }) => rowNumber),
    cachedAt: new Date().toISOString(),
  };
};

const getSancionesRows = async (forceRefresh = false) => {
  if (!forceRefresh && sancionesCache && sancionesCache.expiresAt > Date.now()) {
    return sancionesCache.data;
  }

  const values = await getSheetValues(SANCIONES_RANGE);
  const data = rowsFromSheetValues(values);
  const headers = SANCIONES_HEADERS.map((header, index) => data.headers[index] || header);
  const rows = data.rows.map((row) => {
    if (row.length <= 17) {
      return [
        ...row.slice(0, 9),
        "",
        "",
        ...row.slice(9),
      ];
    }
    return row;
  });

  sancionesCache = {
    data: { ...data, headers, rows },
    expiresAt: Date.now() + SHEET_CACHE_MS,
  };

  return sancionesCache.data;
};

const getSancionesArticleOptions = async (forceRefresh = false) => {
  if (!forceRefresh && configSancionesArticulosCache && configSancionesArticulosCache.expiresAt > Date.now()) {
    return configSancionesArticulosCache.data;
  }

  const values = await getSheetValues(CONFIG_SANCIONES_ARTICULOS_RANGE);
  const normalizeOptions = (columnIndex) => [...new Set(values
    .map((row) => String(row[columnIndex] || "").trim())
    .filter(Boolean))];

  configSancionesArticulosCache = {
    data: {
      leve: normalizeOptions(0),
      media: normalizeOptions(1),
      grave: normalizeOptions(2),
      cachedAt: new Date().toISOString(),
    },
    expiresAt: Date.now() + SHEET_CACHE_MS,
  };

  return configSancionesArticulosCache.data;
};

const getSheetIdByTitle = async (sheetTitle) => {
  const token = await getAccessToken();
  const url = new URL(`https://sheets.googleapis.com/v4/spreadsheets/${SPREADSHEET_ID}`);
  url.searchParams.set("fields", "sheets.properties");

  const response = await fetch(url, {
    headers: { Authorization: `Bearer ${token}` },
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Google Sheets metadata error: ${response.status} ${text}`);
  }

  const data = await response.json();
  const sheet = (data.sheets || []).find((item) => item.properties?.title === sheetTitle);
  if (!sheet) {
    throw new Error(`No se encontro la hoja ${sheetTitle}.`);
  }

  return sheet.properties.sheetId;
};

const insertSancionRow = async (values) => {
  const rowValues = Array.from({ length: 19 }, (_, index) => String(values?.[index] || "").trim());

  if (!rowValues.some(Boolean)) {
    throw new Error("Completa al menos un campo antes de guardar.");
  }

  const token = await getAccessToken();
  const sheetId = await getSheetIdByTitle("SANCIONES_RESUELTA");
  const batchUrl = new URL(`https://sheets.googleapis.com/v4/spreadsheets/${SPREADSHEET_ID}:batchUpdate`);
  const insertResponse = await fetch(batchUrl, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      requests: [{
        insertDimension: {
          range: {
            sheetId,
            dimension: "ROWS",
            startIndex: 1,
            endIndex: 2,
          },
          inheritFromBefore: false,
        },
      }],
    }),
  });

  if (!insertResponse.ok) {
    const text = await insertResponse.text();
    throw new Error(`Google Sheets insert error: ${insertResponse.status} ${text}`);
  }

  const valuesUrl = new URL(`https://sheets.googleapis.com/v4/spreadsheets/${SPREADSHEET_ID}/values/${encodeURIComponent("'SANCIONES_RESUELTA'!A2:S2")}`);
  valuesUrl.searchParams.set("valueInputOption", "USER_ENTERED");

  const updateResponse = await fetch(valuesUrl, {
    method: "PUT",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ values: [rowValues] }),
  });

  if (!updateResponse.ok) {
    const text = await updateResponse.text();
    throw new Error(`Google Sheets update error: ${updateResponse.status} ${text}`);
  }

  sancionesCache = null;
  return getSancionesRows(true);
};

const normalizeSancionValues = (values) => {
  const rowValues = Array.from({ length: 19 }, (_, index) => String(values?.[index] || "").trim());
  if (!rowValues.some(Boolean)) {
    throw new Error("Completa al menos un campo antes de guardar.");
  }
  return rowValues;
};

const updateSancionRow = async (rowNumber, values) => {
  const targetRow = Number(rowNumber);
  if (!Number.isInteger(targetRow) || targetRow < 2) {
    throw new Error("Fila invalida para editar.");
  }

  const rowValues = normalizeSancionValues(values);
  const token = await getAccessToken();
  const valuesUrl = new URL(`https://sheets.googleapis.com/v4/spreadsheets/${SPREADSHEET_ID}/values/${encodeURIComponent(`'SANCIONES_RESUELTA'!A${targetRow}:S${targetRow}`)}`);
  valuesUrl.searchParams.set("valueInputOption", "USER_ENTERED");

  const response = await fetch(valuesUrl, {
    method: "PUT",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ values: [rowValues] }),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Google Sheets update error: ${response.status} ${text}`);
  }

  sancionesCache = null;
  return getSancionesRows(true);
};

const deleteSancionRow = async (rowNumber) => {
  const targetRow = Number(rowNumber);
  if (!Number.isInteger(targetRow) || targetRow < 2) {
    throw new Error("Fila invalida para eliminar.");
  }

  const token = await getAccessToken();
  const sheetId = await getSheetIdByTitle("SANCIONES_RESUELTA");
  const batchUrl = new URL(`https://sheets.googleapis.com/v4/spreadsheets/${SPREADSHEET_ID}:batchUpdate`);
  const response = await fetch(batchUrl, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      requests: [{
        deleteDimension: {
          range: {
            sheetId,
            dimension: "ROWS",
            startIndex: targetRow - 1,
            endIndex: targetRow,
          },
        },
      }],
    }),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Google Sheets delete error: ${response.status} ${text}`);
  }

  sancionesCache = null;
  return getSancionesRows(true);
};

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

const getSancionConfigD3 = async () => {
  const values = await getSheetValues("Configuracion!D3:D3");
  return String(values[0]?.[0] || "").trim();
};

const sanitizeDownloadName = (value) => String(value || "acta-sancion")
  .normalize("NFD")
  .replace(/[\u0300-\u036f]/g, "")
  .replace(/[^a-zA-Z0-9._-]+/g, "-")
  .replace(/^-+|-+$/g, "")
  .slice(0, 120) || "acta-sancion";

const buildSancionActaReplacements = async (values = []) => {
  const row = Array.from({ length: 19 }, (_, index) => String(values[index] || "").trim());
  const now = new Date();
  const day = new Intl.DateTimeFormat("es-AR", { day: "2-digit" }).format(now);
  const month = getSpanishMonthName(now);
  const year = String(now.getFullYear());
  const configD3 = await getSancionConfigD3();

  return {
    "ACTA N°": row[1],
    "año actual": year,
    "mes actual": month,
    "fecha actual en el formato “20 dias del Julio del año 2026”": `${day} dias del ${month} del año ${year}`,
    "fecha actual en el formato “20 días del mes de Julio del año 2026”": `${day} días del mes de ${month} del año ${year}`,
    EXPEDIENTE: row[0],
    INTERNO: row[2],
    LPU: row[3],
    "FECHA DEL HECHO": formatDateForSancionActa(row[4]),
    "DESCRIPCION DEL HECHO": row[5],
    TIPO: row[6],
    ARTICULOS: row[7],
    "ORDEN INTERNA": row[8],
    "FECHA ORDEN INTERNA": formatDateForSancionActa(row[9]) || `${day}/${String(now.getMonth() + 1).padStart(2, "0")}/${year}`,
    SANCION: row[10] || configD3,
    "CONDUCTA INICIO": row[11],
    "CONCEPTO INICIO": row[12],
    "FASE INICIO": row[13],
    "CRITERIO CONDUCTA": row[14],
    "CRITERIO CONCEPTO": row[15],
    "CONDUCTA FINALIZA": row[16],
    "CONCEPTO FINALIZA": row[17],
    "es el valor que existe en el rango D3 de la hoja Configuracion": configD3,
  };
};

const generateSancionActa = async ({ values = [], rowNumber = "" } = {}) => {
  if (!Array.isArray(values) || !values.some((value) => String(value || "").trim() !== "")) {
    throw new Error("No hay datos de sancion para generar el acta.");
  }

  await fs.access(SANCIONES_ACTA_TEMPLATE_PATH);
  await fs.access(SANCIONES_ACTA_SCRIPT_PATH);

  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "acta-sancion-"));
  const payloadPath = path.join(tempDir, "payload.json");
  const outputPath = path.join(tempDir, "acta-sancion.odt");
  const replacements = await buildSancionActaReplacements(values);

  try {
    await fs.writeFile(payloadPath, JSON.stringify({ replacements }), "utf8");
    await execFileAsync("powershell.exe", [
      "-NoProfile",
      "-ExecutionPolicy",
      "Bypass",
      "-File",
      SANCIONES_ACTA_SCRIPT_PATH,
      "-TemplatePath",
      SANCIONES_ACTA_TEMPLATE_PATH,
      "-PayloadPath",
      payloadPath,
      "-OutputPath",
      outputPath,
    ], { windowsHide: true, maxBuffer: 1024 * 1024 });

    const buffer = await fs.readFile(outputPath);
    const filename = `${sanitizeDownloadName(`acta-sancion-${values[2] || values[0] || rowNumber}`)}.odt`;
    return { buffer, filename };
  } finally {
    await fs.rm(tempDir, { recursive: true, force: true });
  }
};

const renderSancionActaHtml = async ({ values = [] } = {}) => {
  if (!Array.isArray(values) || !values.some((value) => String(value || "").trim() !== "")) {
    throw new Error("No hay datos de sancion para renderizar el acta.");
  }

  await fs.access(SANCIONES_ACTA_TEMPLATE_PATH);
  await fs.access(SANCIONES_ACTA_HTML_SCRIPT_PATH);

  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "acta-sancion-html-"));
  const payloadPath = path.join(tempDir, "payload.json");
  const outputPath = path.join(tempDir, "acta.html");
  const replacements = await buildSancionActaReplacements(values);

  try {
    await fs.writeFile(payloadPath, JSON.stringify({ replacements }), "utf8");
    await execFileAsync("powershell.exe", [
      "-NoProfile",
      "-ExecutionPolicy",
      "Bypass",
      "-File",
      SANCIONES_ACTA_HTML_SCRIPT_PATH,
      "-TemplatePath",
      SANCIONES_ACTA_TEMPLATE_PATH,
      "-PayloadPath",
      payloadPath,
      "-OutputPath",
      outputPath,
    ], { windowsHide: true, maxBuffer: 1024 * 1024 });

    return {
      html: await fs.readFile(outputPath, "utf8"),
      title: `ACTA N° ${values[1] || "000"} / ${new Date().getFullYear()} C.C.`,
    };
  } finally {
    await fs.rm(tempDir, { recursive: true, force: true });
  }
};

const ensureSheetExists = async (sheetTitle) => {
  const token = await getAccessToken();
  const batchUrl = new URL(`https://sheets.googleapis.com/v4/spreadsheets/${SPREADSHEET_ID}:batchUpdate`);
  const response = await fetch(batchUrl, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      requests: [{
        addSheet: {
          properties: { title: sheetTitle },
        },
      }],
    }),
  });

  if (!response.ok) {
    const text = await response.text();
    if (!text.toLowerCase().includes("already exists")) {
      throw new Error(`Google Sheets add sheet error: ${response.status} ${text}`);
    }
  }
};
const normalizeKey = (value) => String(value || "")
  .toLowerCase()
  .normalize("NFD")
  .replace(/[\u0300-\u036f]/g, "")
  .replace(/[^a-z0-9]/g, "");

const getSheetValues = async (range) => {
  const token = await getAccessToken();
  const url = new URL(`https://sheets.googleapis.com/v4/spreadsheets/${SPREADSHEET_ID}/values/${encodeURIComponent(range)}`);
  const response = await fetch(url, {
    headers: { Authorization: `Bearer ${token}` },
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Google Sheets error: ${response.status} ${text}`);
  }

  const data = await response.json();
  return data.values || [];
};

const quotedSheetRange = (sheetTitle, columns = "A:Z") => `'${String(sheetTitle).replace(/'/g, "''")}'!${columns}`;

const getArchivedSheetValues = async (sheetTitle, columns = "A:Z") => {
  await ensureSheetExists(sheetTitle);
  return getSheetValues(quotedSheetRange(sheetTitle, columns));
};

const parseSheetTimestamp = (value) => {
  const text = String(value || "").trim();
  if (/^\d{4}-\d{2}-\d{2}(?:[T\s].*)?$/.test(text)) {
    const parsed = Date.parse(text);
    if (Number.isFinite(parsed)) return parsed;
  }

  const match = text.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})(?:\s+(\d{1,2}):(\d{2})(?::(\d{2}))?)?/);
  if (!match) return null;

  const [, day, month, year, hour = "0", minute = "0", second = "0"] = match;
  return new Date(
    Number(year),
    Number(month) - 1,
    Number(day),
    Number(hour),
    Number(minute),
    Number(second)
  ).getTime();
};

const getLatestTimestampRows = (values) => {
  const rows = values
    .map((row) => ({ row, timestampMs: parseSheetTimestamp(row[0]) }))
    .filter(({ timestampMs }) => Number.isFinite(timestampMs));
  if (!rows.length) return { timestamp: null, rows: [] };

  const latest = Math.max(...rows.map(({ timestampMs }) => timestampMs));
  const latestRows = rows.filter(({ timestampMs }) => timestampMs === latest);

  return {
    timestamp: String(latestRows[0]?.row[0] || ""),
    rows: latestRows.map(({ row }) => row),
  };
};

const appendSheetRows = async (sheetTitle, rows, valueInputOption = "USER_ENTERED") => {
  const values = (Array.isArray(rows) ? rows : [])
    .filter((row) => Array.isArray(row) && row.some((cell) => String(cell || "").trim() !== ""));

  if (!values.length) {
    return { ok: true, skipped: true, updatedRange: "" };
  }

  await ensureSheetExists(sheetTitle);

  const token = await getAccessToken();
  const url = new URL(`https://sheets.googleapis.com/v4/spreadsheets/${SPREADSHEET_ID}/values/${encodeURIComponent(sheetTitle)}:append`);
  url.searchParams.set("valueInputOption", valueInputOption);
  url.searchParams.set("insertDataOption", "INSERT_ROWS");

  const response = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ values }),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Google Sheets append error (${sheetTitle}): ${response.status} ${text}`);
  }

  const data = await response.json();
  return { ok: true, skipped: false, updatedRange: data.updates?.updatedRange || "" };
};

const getInternosRows = async (forceRefresh = false) => {
  if (!forceRefresh && internosCache && internosCache.expiresAt > Date.now()) {
    return internosCache.data;
  }

  const values = await getSheetValues(INTERNOS_RANGE);
  const headers = values[0] || [];
  const rowPairs = values.slice(1)
    .map((row, index) => ({ row, rowNumber: index + 2 }))
    .filter(({ row }) => row.some((cell) => String(cell || "").trim() !== ""));
  const rows = rowPairs.map(({ row }) => row);
  const rowNumbers = rowPairs.map(({ rowNumber }) => rowNumber);

  internosCache = {
    data: { headers, rows, rowNumbers, cachedAt: new Date().toISOString() },
    expiresAt: Date.now() + SHEET_CACHE_MS,
  };

  return internosCache.data;
};

const uniqueSortedValues = (values) => [...new Set(values
  .map((value) => String(value || "").trim())
  .filter(Boolean))]
  .sort((a, b) => a.localeCompare(b, "es", { sensitivity: "base" }));

const getPersonalComplejoOptions = async (forceRefresh = false) => {
  if (!forceRefresh && personalComplejoCache && personalComplejoCache.expiresAt > Date.now()) {
    return personalComplejoCache.data;
  }

  const values = await getSheetValues(PERSONAL_COMPLEJO_RANGE);
  const rows = values.filter((row) => row.some((cell) => String(cell || "").trim() !== ""));
  const data = {
    agentes: uniqueSortedValues(rows.map((row) => row[0])),
    funciones: uniqueSortedValues(rows.map((row) => row[1])),
    cachedAt: new Date().toISOString(),
  };

  personalComplejoCache = {
    data,
    expiresAt: Date.now() + SHEET_CACHE_MS,
  };

  return data;
};

const getAlojamientoRows = async (forceRefresh = false) => {
  if (!forceRefresh && alojamientoCache && alojamientoCache.expiresAt > Date.now()) {
    return alojamientoCache.data;
  }

  const values = await getSheetValues(ALOJAMIENTO_RANGE);
  const headers = values[0] || [];
  const rowPairs = values.slice(1)
    .map((row, index) => ({ row, rowNumber: index + 2 }))
    .filter(({ row }) => row.some((cell) => String(cell || "").trim() !== ""));
  const rows = rowPairs.map(({ row }) => row);
  const rowNumbers = rowPairs.map(({ rowNumber }) => rowNumber);

  alojamientoCache = {
    data: { headers, rows, rowNumbers, cachedAt: new Date().toISOString() },
    expiresAt: Date.now() + SHEET_CACHE_MS,
  };

  return alojamientoCache.data;
};

const findHeaderIndex = (headers, candidates) => {
  const keys = candidates.map(normalizeKey);
  return headers.findIndex((header) => keys.includes(normalizeKey(header)));
};

const findInternoByLpu = async (lpu) => {
  const requestedLpu = normalizeKey(lpu);
  if (!requestedLpu) {
    throw new Error("Ingresa un L.P.U. para buscar.");
  }

  const { headers, rows } = await getInternosRows();
  const lpuIndex = findHeaderIndex(headers, ["L.P.U.", "L.P.U", "LPU", "L.P.U. N°", "L.P.U. N"]);
  const nombreIndex = findHeaderIndex(headers, ["APELLIDO Y NOMBRE", "INTERNO"]);
  const alojamientoIndex = findHeaderIndex(headers, ["ALOJAMIENTO", "ALOJADO"]);
  const situacionIndex = findHeaderIndex(headers, ["SITUACION LEGAL", "SITUACION"]);

  if (lpuIndex === -1) {
    throw new Error("No se encontro la columna L.P.U. en la hoja internos.");
  }

  const match = rows.find((row) => normalizeKey(row[lpuIndex]) === requestedLpu);
  if (!match) {
    return { found: false };
  }

  return {
    found: true,
    interno: nombreIndex >= 0 ? match[nombreIndex] || "" : "",
    alojamiento: alojamientoIndex >= 0 ? match[alojamientoIndex] || "" : "",
    situacionLegal: situacionIndex >= 0 ? match[situacionIndex] || "" : "",
  };
};

const getTramites = async (forceRefresh = false) => {
  if (!forceRefresh && tramitesCache && tramitesCache.expiresAt > Date.now()) {
    return tramitesCache.data;
  }

  const token = await getAccessToken();
  const url = new URL(`https://sheets.googleapis.com/v4/spreadsheets/${SPREADSHEET_ID}/values/${encodeURIComponent(CONFIG_TRAMITES_RANGE)}`);
  const response = await fetch(url, {
    headers: { Authorization: `Bearer ${token}` },
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Google Sheets config error: ${response.status} ${text}`);
  }

  const data = await response.json();
  const tramites = (data.values || [])
    .map((row) => String(row[0] || "").trim())
    .filter(Boolean);

  tramitesCache = {
    data: { tramites, cachedAt: new Date().toISOString() },
    expiresAt: Date.now() + SHEET_CACHE_MS,
  };

  return tramitesCache.data;
};

const getConfigConsejoCorreccional = async (forceRefresh = false) => {
  if (!forceRefresh && configConsejoCache && configConsejoCache.expiresAt > Date.now()) {
    return configConsejoCache.data;
  }

  const values = await getSheetValues(CONFIG_CONSEJO_RANGE);
  const rows = Array.from({ length: 10 }, (_, rowIndex) => (
    Array.from({ length: 3 }, (_, columnIndex) => String(values[rowIndex]?.[columnIndex] || ""))
  ));

  configConsejoCache = {
    data: {
      range: CONFIG_CONSEJO_RANGE,
      rows,
      cachedAt: new Date().toISOString(),
    },
    expiresAt: Date.now() + SHEET_CACHE_MS,
  };

  return configConsejoCache.data;
};

const updateConfigConsejoCorreccional = async (rows) => {
  if (!Array.isArray(rows)) {
    throw new Error("Formato invalido para guardar la configuracion.");
  }

  const token = await getAccessToken();
  const values = Array.from({ length: 10 }, (_, rowIndex) => (
    Array.from({ length: 3 }, (_, columnIndex) => String(rows[rowIndex]?.[columnIndex] || ""))
  ));
  const url = new URL(`https://sheets.googleapis.com/v4/spreadsheets/${SPREADSHEET_ID}/values/${encodeURIComponent(CONFIG_CONSEJO_RANGE)}`);
  url.searchParams.set("valueInputOption", "USER_ENTERED");

  const response = await fetch(url, {
    method: "PUT",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ values }),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Google Sheets config update error: ${response.status} ${text}`);
  }

  configConsejoCache = null;
  return getConfigConsejoCorreccional(true);
};

const getConfigCentroEvaluacionProcesados = async (forceRefresh = false) => {
  if (!forceRefresh && configCeipCache && configCeipCache.expiresAt > Date.now()) {
    return configCeipCache.data;
  }

  const values = await getSheetValues(CONFIG_CEIP_RANGE);
  const rows = Array.from({ length: 10 }, (_, rowIndex) => (
    Array.from({ length: 3 }, (_, columnIndex) => String(values[rowIndex]?.[columnIndex] || ""))
  ));

  configCeipCache = {
    data: {
      range: CONFIG_CEIP_RANGE,
      rows,
      cachedAt: new Date().toISOString(),
    },
    expiresAt: Date.now() + SHEET_CACHE_MS,
  };

  return configCeipCache.data;
};

const updateConfigCentroEvaluacionProcesados = async (rows) => {
  if (!Array.isArray(rows)) {
    throw new Error("Formato invalido para guardar la configuracion.");
  }

  const token = await getAccessToken();
  const values = Array.from({ length: 10 }, (_, rowIndex) => (
    Array.from({ length: 3 }, (_, columnIndex) => String(rows[rowIndex]?.[columnIndex] || ""))
  ));
  const url = new URL(`https://sheets.googleapis.com/v4/spreadsheets/${SPREADSHEET_ID}/values/${encodeURIComponent(CONFIG_CEIP_RANGE)}`);
  url.searchParams.set("valueInputOption", "USER_ENTERED");

  const response = await fetch(url, {
    method: "PUT",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ values }),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Google Sheets config update error: ${response.status} ${text}`);
  }

  configCeipCache = null;
  return getConfigCentroEvaluacionProcesados(true);
};

const appendTramite = async (tramite) => {
  const nextTramite = String(tramite || "").trim();
  if (!nextTramite) {
    throw new Error("Escribi un tramite para agregar.");
  }

  const current = await getTramites(true);
  const exists = current.tramites.some((item) => item.toLowerCase() === nextTramite.toLowerCase());
  if (exists) {
    throw new Error("Ese tramite ya existe en la lista.");
  }

  const token = await getAccessToken();
  const url = new URL(`https://sheets.googleapis.com/v4/spreadsheets/${SPREADSHEET_ID}/values/${encodeURIComponent(CONFIG_TRAMITES_RANGE)}:append`);
  url.searchParams.set("valueInputOption", "USER_ENTERED");
  url.searchParams.set("insertDataOption", "INSERT_ROWS");

  const response = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ values: [[nextTramite]] }),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Google Sheets append error: ${response.status} ${text}`);
  }

  tramitesCache = null;
  return getTramites(true);
};

const getArchivoRows = async () => {
  await ensureSheetExists(ARCHIVO_SHEET);
  const values = await getSheetValues(ARCHIVO_RANGE);
  const rows = values
    .map((row, index) => ({
      rowNumber: index + 1,
      savedAt: String(row[0] || ""),
      title: String(row[1] || "Parte Diario"),
      html: String(row[2] || ""),
    }))
    .filter((item) => item.html.trim() !== "")
    .reverse();

  return { rows, cachedAt: new Date().toISOString() };
};
const appendArchivoHtml = async ({ html, title } = {}) => {
  const htmlValue = String(html || "").trim();
  if (!htmlValue) {
    throw new Error("No hay HTML para guardar.");
  }

  await ensureSheetExists(ARCHIVO_SHEET);

  const token = await getAccessToken();
  const url = new URL(`https://sheets.googleapis.com/v4/spreadsheets/${SPREADSHEET_ID}/values/${encodeURIComponent(ARCHIVO_RANGE)}:append`);
  url.searchParams.set("valueInputOption", "RAW");
  url.searchParams.set("insertDataOption", "INSERT_ROWS");

  const savedAt = new Date().toISOString();
  const response = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      values: [[savedAt, String(title || "Parte Diario"), htmlValue]],
    }),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Google Sheets archivo append error: ${response.status} ${text}`);
  }

  const data = await response.json();
  return { ok: true, savedAt, updatedRange: data.updates?.updatedRange || "" };
};

const SECTION_MARKER = "__SECTION__";

const getParteDiarioActual = async (forceRefresh = false) => {
  await ensureSheetExists(PARTE_DIARIO_ACTUAL_RANGE);

  if (!forceRefresh && parteDiarioActualCache && parteDiarioActualCache.expiresAt > Date.now()) {
    return parteDiarioActualCache.data;
  }

  const values = await getSheetValues(PARTE_DIARIO_ACTUAL_RANGE);
  if (!values.length) {
    return { sections: {}, savedAt: null };
  }

  const sections = {};
  let currentSection = null;
  let currentRows = [];

  for (const row of values) {
    if (String(row[0] || "") === SECTION_MARKER) {
      if (currentSection) {
        sections[currentSection] = currentRows;
      }
      currentSection = String(row[1] || "");
      currentRows = [];
    } else if (currentSection) {
      currentRows.push(row.map((cell) => String(cell || "")));
    }
  }

  if (currentSection) {
    sections[currentSection] = currentRows;
  }

  const savedAt = sections._meta?.[0]?.[0] || null;
  delete sections._meta;

  const data = { sections, savedAt };

  parteDiarioActualCache = {
    data,
    expiresAt: Date.now() + SHEET_CACHE_MS,
  };

  return data;
};

const saveParteDiarioActual = async (sections) => {
  await ensureSheetExists(PARTE_DIARIO_ACTUAL_RANGE);

  if (!sections || typeof sections !== "object") {
    throw new Error("Formato invalido para guardar el parte diario.");
  }

  const token = await getAccessToken();
  const savedAt = new Date().toISOString();
  const rows = [];

  rows.push([SECTION_MARKER, "_meta", "1"]);
  rows.push([savedAt]);

  const sectionOrder = ["service", "staffNews", "population", "inmateNews", "housingChanges", "observations"];

  for (const name of sectionOrder) {
    const data = sections[name];
    if (!Array.isArray(data)) continue;
    const colCount = data.length > 0 ? data[0].length : 1;
    rows.push([SECTION_MARKER, name, String(colCount)]);
    for (const dataRow of data) {
      rows.push(dataRow.map((cell) => String(cell || "")));
    }
  }

  const clearUrl = new URL(`https://sheets.googleapis.com/v4/spreadsheets/${SPREADSHEET_ID}/values/${encodeURIComponent(PARTE_DIARIO_ACTUAL_RANGE)}:clear`);
  const clearResponse = await fetch(clearUrl, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({}),
  });

  if (!clearResponse.ok) {
    const text = await clearResponse.text();
    throw new Error(`Google Sheets clear error: ${clearResponse.status} ${text}`);
  }

  if (rows.length > 0) {
    const updateUrl = new URL(`https://sheets.googleapis.com/v4/spreadsheets/${SPREADSHEET_ID}/values/${encodeURIComponent(PARTE_DIARIO_ACTUAL_RANGE)}`);
    updateUrl.searchParams.set("valueInputOption", "RAW");

    const updateResponse = await fetch(updateUrl, {
      method: "PUT",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ values: rows }),
    });

    if (!updateResponse.ok) {
      const text = await updateResponse.text();
      throw new Error(`Google Sheets update error: ${updateResponse.status} ${text}`);
    }
  }

  parteDiarioActualCache = null;
  return { ok: true, savedAt };
};

const isNonEmptyParteRow = (row) => (
  Array.isArray(row) && row.some((cell) => String(cell || "").trim() !== "")
);

const tableToText = (rows) => (Array.isArray(rows) ? rows : [])
  .filter(isNonEmptyParteRow)
  .map((row) => row.map((cell) => String(cell || "").trim()).filter(Boolean).join(": "))
  .filter(Boolean)
  .join("\n");

const appendParteDiarioSheets = async (sections, savedAt) => {
  const timestamp = savedAt || new Date().toISOString();
  const serviceText = tableToText(sections.service);
  const staffNewsRows = (sections.staffNews || []).filter(isNonEmptyParteRow);
  const inmateNewsRows = (sections.inmateNews || []).filter(isNonEmptyParteRow);
  const housingRows = (sections.housingChanges || []).filter(isNonEmptyParteRow);
  const observationsText = String(sections.observations?.[0]?.[0] || sections.observations || "").trim();

  const results = {};

  if (serviceText) {
    results.personalServicio = await appendSheetRows(PARTE_PERSONAL_SERVICIO_SHEET, [[timestamp, serviceText]], "RAW");
  }

  if (staffNewsRows.length) {
    results.personal = await appendSheetRows(
      PARTE_PERSONAL_SHEET,
      staffNewsRows.map((row) => [timestamp, ...row]),
      "RAW"
    );
  }

  if (inmateNewsRows.length) {
    results.novedades = await appendSheetRows(
      PARTE_NOVEDADES_SHEET,
      inmateNewsRows.map((row) => [timestamp, ...row]),
      "RAW"
    );
  }

  if (housingRows.length) {
    results.alojamiento = await appendSheetRows(
      PARTE_ALOJAMIENTO_SHEET,
      housingRows.map((row) => [timestamp, ...row]),
      "RAW"
    );
  }

  if (observationsText && observationsText.toUpperCase() !== "OBSERVACIONES:") {
    results.observaciones = await appendSheetRows(PARTE_OBSERVACIONES_SHEET, [[timestamp, observationsText]], "RAW");
  }

  return results;
};

const saveParteDiario = async (sections) => {
  const current = await saveParteDiarioActual(sections);
  const sheets = await appendParteDiarioSheets(sections, current.savedAt);

  return { ...current, sheets };
};

const parseServiceText = (value) => String(value || "")
  .split(/\r?\n/)
  .map((line) => line.trim())
  .filter(Boolean)
  .map((line) => {
    const separator = line.indexOf(": ");
    if (separator === -1) return [line, ""];
    return [line.slice(0, separator).trim(), line.slice(separator + 2).trim()];
  });

const getParteDiarioArchivado = async () => {
  const current = await getParteDiarioActual();
  const [
    serviceValues,
    staffValues,
    inmateValues,
    housingValues,
    observationValues,
  ] = await Promise.all([
    getArchivedSheetValues(PARTE_PERSONAL_SERVICIO_SHEET, "A:B"),
    getArchivedSheetValues(PARTE_PERSONAL_SHEET, "A:G"),
    getArchivedSheetValues(PARTE_NOVEDADES_SHEET, "A:H"),
    getArchivedSheetValues(PARTE_ALOJAMIENTO_SHEET, "A:G"),
    getArchivedSheetValues(PARTE_OBSERVACIONES_SHEET, "A:B"),
  ]);

  const latestService = getLatestTimestampRows(serviceValues);
  const latestStaff = getLatestTimestampRows(staffValues);
  const latestInmate = getLatestTimestampRows(inmateValues);
  const latestHousing = getLatestTimestampRows(housingValues);
  const latestObservation = getLatestTimestampRows(observationValues);
  const timestamps = [
    latestService.timestamp,
    latestStaff.timestamp,
    latestInmate.timestamp,
    latestHousing.timestamp,
    latestObservation.timestamp,
    current.savedAt,
  ].filter(Boolean).sort();

  return {
    sections: {
      service: latestService.rows[0] ? parseServiceText(latestService.rows[0][1]) : current.sections.service || [],
      staffNews: latestStaff.rows.length ? latestStaff.rows.map((row) => row.slice(1)) : current.sections.staffNews || [],
      population: current.sections.population || [],
      inmateNews: latestInmate.rows.length ? latestInmate.rows.map((row) => row.slice(1)) : current.sections.inmateNews || [],
      housingChanges: latestHousing.rows.length ? latestHousing.rows.map((row) => row.slice(1)) : current.sections.housingChanges || [],
      observations: latestObservation.rows[0] ? [[String(latestObservation.rows[0][1] || "")]] : current.sections.observations || [["OBSERVACIONES:"]],
    },
    savedAt: timestamps.at(-1) || null,
  };
};

const updateTramites = async (tramites) => {
  if (!Array.isArray(tramites)) {
    throw new Error("Formato invalido para guardar tramites.");
  }

  const normalized = tramites
    .map((tramite) => String(tramite || "").trim())
    .filter(Boolean);
  const duplicated = normalized.find((tramite, index) => (
    normalized.findIndex((item) => item.toLowerCase() === tramite.toLowerCase()) !== index
  ));

  if (duplicated) {
    throw new Error(`El tramite "${duplicated}" esta repetido.`);
  }

  const token = await getAccessToken();
  const clearUrl = new URL(`https://sheets.googleapis.com/v4/spreadsheets/${SPREADSHEET_ID}/values/${encodeURIComponent(CONFIG_TRAMITES_RANGE)}:clear`);
  const clearResponse = await fetch(clearUrl, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({}),
  });

  if (!clearResponse.ok) {
    const text = await clearResponse.text();
    throw new Error(`Google Sheets clear error: ${clearResponse.status} ${text}`);
  }

  if (normalized.length) {
    const updateUrl = new URL(`https://sheets.googleapis.com/v4/spreadsheets/${SPREADSHEET_ID}/values/${encodeURIComponent(CONFIG_TRAMITES_RANGE)}`);
    updateUrl.searchParams.set("valueInputOption", "USER_ENTERED");

    const updateResponse = await fetch(updateUrl, {
      method: "PUT",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ values: normalized.map((tramite) => [tramite]) }),
    });

    if (!updateResponse.ok) {
      const text = await updateResponse.text();
      throw new Error(`Google Sheets update error: ${updateResponse.status} ${text}`);
    }
  }

  tramitesCache = null;
  return getTramites(true);
};

const readJsonBody = (req) => new Promise((resolve, reject) => {
  let body = "";

  req.on("data", (chunk) => {
    body += chunk;
    if (body.length > 1024 * 1024) {
      req.destroy();
      reject(new Error("El formulario es demasiado grande."));
    }
  });

  req.on("end", () => {
    try {
      resolve(body ? JSON.parse(body) : {});
    } catch {
      reject(new Error("JSON invalido."));
    }
  });
});


const generarResumenActaConGroq = async ({ datos = [], acta = "" } = {}) => {
  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) {
    throw new Error("Falta configurar GROQ_API_KEY en el servidor.");
  }

  const campos = Array.isArray(datos)
    ? datos
      .map(({ campo, valor }) => {
        const nombre = String(campo || "").trim();
        const contenido = String(valor || "").trim();
        return nombre && contenido ? `${nombre}: ${contenido}` : "";
      })
      .filter(Boolean)
      .join("\n")
    : "";

  const contenido = [campos, String(acta || "").trim()].filter(Boolean).join("\n\nActa actual:\n");
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
      max_tokens: 500,
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

const insertConsejoRow = async (values) => {
  if (!Array.isArray(values) || !values.some((value) => String(value || "").trim() !== "")) {
    throw new Error("Completa al menos un campo antes de guardar.");
  }

  const token = await getAccessToken();
  const currentData = await getConsejoRows(true);
  const columnCount = currentData.headers.length;
  const rowValues = Array.from({ length: columnCount }, (_, index) => String(values[index] || ""));

  const batchUrl = new URL(`https://sheets.googleapis.com/v4/spreadsheets/${SPREADSHEET_ID}:batchUpdate`);
  const insertResponse = await fetch(batchUrl, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      requests: [{
        insertDimension: {
          range: {
            sheetId: SHEET_ID,
            dimension: "ROWS",
            startIndex: 1,
            endIndex: 2,
          },
          inheritFromBefore: false,
        },
      }],
    }),
  });

  if (!insertResponse.ok) {
    const text = await insertResponse.text();
    throw new Error(`Google Sheets insert error: ${insertResponse.status} ${text}`);
  }

  const endColumn = columnName(columnCount);
  const valuesUrl = new URL(`https://sheets.googleapis.com/v4/spreadsheets/${SPREADSHEET_ID}/values/${encodeURIComponent(`${SHEET_RANGE}!A2:${endColumn}2`)}`);
  valuesUrl.searchParams.set("valueInputOption", "USER_ENTERED");

  const updateResponse = await fetch(valuesUrl, {
    method: "PUT",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ values: [rowValues] }),
  });

  if (!updateResponse.ok) {
    const text = await updateResponse.text();
    throw new Error(`Google Sheets update error: ${updateResponse.status} ${text}`);
  }

  sheetCache = null;
  return getConsejoRows(true);
};

const updateConsejoRow = async (rowNumber, values) => {
  const targetRow = Number(rowNumber);
  if (!Number.isInteger(targetRow) || targetRow < 2) {
    throw new Error("Fila invalida para editar.");
  }

  if (!Array.isArray(values) || !values.some((value) => String(value || "").trim() !== "")) {
    throw new Error("Completa al menos un campo antes de guardar.");
  }

  const token = await getAccessToken();
  const currentData = await getConsejoRows(true);
  const columnCount = currentData.headers.length;
  const rowValues = Array.from({ length: columnCount }, (_, index) => String(values[index] || ""));
  const endColumn = columnName(columnCount);
  const valuesUrl = new URL(`https://sheets.googleapis.com/v4/spreadsheets/${SPREADSHEET_ID}/values/${encodeURIComponent(`${SHEET_RANGE}!A${targetRow}:${endColumn}${targetRow}`)}`);
  valuesUrl.searchParams.set("valueInputOption", "USER_ENTERED");

  const updateResponse = await fetch(valuesUrl, {
    method: "PUT",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ values: [rowValues] }),
  });

  if (!updateResponse.ok) {
    const text = await updateResponse.text();
    throw new Error(`Google Sheets update error: ${updateResponse.status} ${text}`);
  }

  sheetCache = null;
  return getConsejoRows(true);
};

const deleteConsejoRow = async (rowNumber) => {
  const targetRow = Number(rowNumber);
  if (!Number.isInteger(targetRow) || targetRow < 2) {
    throw new Error("Fila invalida para eliminar.");
  }

  const token = await getAccessToken();
  const batchUrl = new URL(`https://sheets.googleapis.com/v4/spreadsheets/${SPREADSHEET_ID}:batchUpdate`);
  const response = await fetch(batchUrl, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      requests: [{
        deleteDimension: {
          range: {
            sheetId: SHEET_ID,
            dimension: "ROWS",
            startIndex: targetRow - 1,
            endIndex: targetRow,
          },
        },
      }],
    }),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Google Sheets delete error: ${response.status} ${text}`);
  }

  sheetCache = null;
  return getConsejoRows(true);
};

const columnName = (columnNumber) => {
  let name = "";
  let number = columnNumber;

  while (number > 0) {
    const remainder = (number - 1) % 26;
    name = String.fromCharCode(65 + remainder) + name;
    number = Math.floor((number - 1) / 26);
  }

  return name || "A";
};


const getParteDiarioConfig = async () => {
  const credentials = JSON.parse(await fs.readFile(CREDENTIALS_PATH, "utf8"));
  const googleSheetsUrl = credentials.google_sheets_url
    || credentials.apps_script_url
    || credentials.appsScriptUrl
    || credentials.GOOGLE_SHEETS_URL
    || "";

  return { googleSheetsUrl };
};
const serveStatic = async (req, res) => {
  const url = new URL(req.url, `http://${HOST}:${PORT}`);
  const requestedPath = url.pathname === "/" ? "/consejo_correccional.html" : decodeURIComponent(url.pathname);
  const filePath = path.resolve(ROOT, `.${requestedPath}`);

  if (!filePath.startsWith(ROOT)) {
    res.writeHead(403);
    res.end("Forbidden");
    return;
  }

  try {
    const content = await fs.readFile(filePath);
    const contentType = filePath.endsWith(".html")
      ? "text/html; charset=utf-8"
      : "application/octet-stream";

    res.writeHead(200, { "Content-Type": contentType });
    res.end(content);
  } catch {
    res.writeHead(404);
    res.end("Not found");
  }
};

const server = http.createServer(async (req, res) => {
  if (req.method === "OPTIONS") {
    res.writeHead(204, {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
    });
    res.end();
    return;
  }



  if (req.url.startsWith("/api/groq/resumen-acta") && req.method === "POST") {
    try {
      const body = await readJsonBody(req);
      sendJson(res, 200, await generarResumenActaConGroq(body));
    } catch (error) {
      sendJson(res, 500, { error: error.message });
    }
    return;
  }
  if (req.url.startsWith("/api/parte-diario-config") && req.method === "GET") {
    try {
      sendJson(res, 200, await getParteDiarioConfig());
    } catch (error) {
      sendJson(res, 500, { error: error.message });
    }
    return;
  }
  if (req.url.startsWith("/api/consejo") && req.method === "GET") {
    try {
      sendJson(res, 200, await getConsejoRows());
    } catch (error) {
      sendJson(res, 500, { error: error.message });
    }
    return;
  }

  if (req.url.startsWith("/api/consejo") && req.method === "POST") {
    try {
      const body = await readJsonBody(req);
      sendJson(res, 201, await insertConsejoRow(body.values || []));
    } catch (error) {
      sendJson(res, 500, { error: error.message });
    }
    return;
  }

  if (req.url.startsWith("/api/consejo") && req.method === "PUT") {
    try {
      const body = await readJsonBody(req);
      sendJson(res, 200, await updateConsejoRow(body.rowNumber, body.values || []));
    } catch (error) {
      sendJson(res, 500, { error: error.message });
    }
    return;
  }

  if (req.url.startsWith("/api/consejo") && req.method === "DELETE") {
    try {
      const body = await readJsonBody(req);
      sendJson(res, 200, await deleteConsejoRow(body.rowNumber));
    } catch (error) {
      sendJson(res, 500, { error: error.message });
    }
    return;
  }

  if (req.url.startsWith("/api/sanciones") && req.method === "GET") {
    try {
      sendJson(res, 200, await getSancionesRows());
    } catch (error) {
      sendJson(res, 500, { error: error.message });
    }
    return;
  }

  if ((req.url === "/api/sanciones/acta" || req.url.startsWith("/api/sanciones/acta?")) && req.method === "POST") {
    try {
      const body = await readJsonBody(req);
      const { buffer, filename } = await generateSancionActa({
        values: body.values || [],
        rowNumber: body.rowNumber,
      });

      res.writeHead(200, {
        "Content-Type": "application/vnd.oasis.opendocument.text",
        "Content-Disposition": `attachment; filename="${filename}"`,
        "Content-Length": buffer.length,
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Expose-Headers": "Content-Disposition",
      });
      res.end(buffer);
    } catch (error) {
      sendJson(res, 500, { error: error.message });
    }
    return;
  }

  if (req.url.startsWith("/api/sanciones/acta-html") && req.method === "POST") {
    try {
      const body = await readJsonBody(req);
      sendJson(res, 200, await renderSancionActaHtml({ values: body.values || [] }));
    } catch (error) {
      sendJson(res, 500, { error: error.message });
    }
    return;
  }

  if (req.url.startsWith("/api/sanciones") && req.method === "POST") {
    try {
      const body = await readJsonBody(req);
      sendJson(res, 201, await insertSancionRow(body.values || []));
    } catch (error) {
      sendJson(res, 500, { error: error.message });
    }
    return;
  }

  if (req.url.startsWith("/api/sanciones") && req.method === "PUT") {
    try {
      const body = await readJsonBody(req);
      sendJson(res, 200, await updateSancionRow(body.rowNumber, body.values || []));
    } catch (error) {
      sendJson(res, 500, { error: error.message });
    }
    return;
  }

  if (req.url.startsWith("/api/sanciones") && req.method === "DELETE") {
    try {
      const body = await readJsonBody(req);
      sendJson(res, 200, await deleteSancionRow(body.rowNumber));
    } catch (error) {
      sendJson(res, 500, { error: error.message });
    }
    return;
  }

  if (req.url.startsWith("/api/config/sanciones-articulos") && req.method === "GET") {
    try {
      sendJson(res, 200, await getSancionesArticleOptions());
    } catch (error) {
      sendJson(res, 500, { error: error.message });
    }
    return;
  }

  if (req.url.startsWith("/api/config/sancion-acta") && req.method === "GET") {
    try {
      sendJson(res, 200, { sancion: await getSancionConfigD3() });
    } catch (error) {
      sendJson(res, 500, { error: error.message });
    }
    return;
  }

  if (req.url.startsWith("/api/archivo") && req.method === "GET") {
    try {
      sendJson(res, 200, await getArchivoRows());
    } catch (error) {
      sendJson(res, 500, { error: error.message });
    }
    return;
  }
  if (req.url.startsWith("/api/archivo") && req.method === "POST") {
    try {
      const body = await readJsonBody(req);
      sendJson(res, 201, await appendArchivoHtml({ html: body.html, title: body.title }));
    } catch (error) {
      sendJson(res, 500, { error: error.message });
    }
    return;
  }
  if (req.url.startsWith("/api/parte-diario-actual") && req.method === "GET") {
    try {
      sendJson(res, 200, await getParteDiarioActual());
    } catch (error) {
      sendJson(res, 500, { error: error.message });
    }
    return;
  }
  if (req.url.startsWith("/api/parte-diario-archivado") && req.method === "GET") {
    try {
      sendJson(res, 200, await getParteDiarioArchivado());
    } catch (error) {
      sendJson(res, 500, { error: error.message });
    }
    return;
  }
  if (req.url.startsWith("/api/parte-diario-actual") && req.method === "PUT") {
    try {
      const body = await readJsonBody(req);
      sendJson(res, 200, await saveParteDiarioActual(body.sections || {}));
    } catch (error) {
      sendJson(res, 500, { error: error.message });
    }
    return;
  }
  if (req.url.startsWith("/api/parte-diario") && req.method === "POST") {
    try {
      const body = await readJsonBody(req);
      sendJson(res, 201, await saveParteDiario(body.sections || {}));
    } catch (error) {
      sendJson(res, 500, { error: error.message });
    }
    return;
  }
  if (req.url.startsWith("/api/tramites") && req.method === "GET") {
    try {
      sendJson(res, 200, await getTramites());
    } catch (error) {
      sendJson(res, 500, { error: error.message });
    }
    return;
  }

  if (req.url.startsWith("/api/tramites") && req.method === "POST") {
    try {
      const body = await readJsonBody(req);
      sendJson(res, 201, await appendTramite(body.tramite));
    } catch (error) {
      sendJson(res, 500, { error: error.message });
    }
    return;
  }

  if (req.url.startsWith("/api/tramites") && req.method === "PUT") {
    try {
      const body = await readJsonBody(req);
      sendJson(res, 200, await updateTramites(body.tramites || []));
    } catch (error) {
      sendJson(res, 500, { error: error.message });
    }
    return;
  }

  if (req.url.startsWith("/api/config/consejo-correccional") && req.method === "GET") {
    try {
      sendJson(res, 200, await getConfigConsejoCorreccional());
    } catch (error) {
      sendJson(res, 500, { error: error.message });
    }
    return;
  }

  if (req.url.startsWith("/api/config/consejo-correccional") && req.method === "PUT") {
    try {
      const body = await readJsonBody(req);
      sendJson(res, 200, await updateConfigConsejoCorreccional(body.rows || []));
    } catch (error) {
      sendJson(res, 500, { error: error.message });
    }
    return;
  }

  if (req.url.startsWith("/api/config/centro-evaluacion-procesados") && req.method === "GET") {
    try {
      sendJson(res, 200, await getConfigCentroEvaluacionProcesados());
    } catch (error) {
      sendJson(res, 500, { error: error.message });
    }
    return;
  }

  if (req.url.startsWith("/api/config/centro-evaluacion-procesados") && req.method === "PUT") {
    try {
      const body = await readJsonBody(req);
      sendJson(res, 200, await updateConfigCentroEvaluacionProcesados(body.rows || []));
    } catch (error) {
      sendJson(res, 500, { error: error.message });
    }
    return;
  }

  if (req.url.startsWith("/api/internos") && req.method === "GET") {
    try {
      sendJson(res, 200, await getInternosRows());
    } catch (error) {
      sendJson(res, 500, { error: error.message });
    }
    return;
  }

  if (req.url.startsWith("/api/personal-complejo") && req.method === "GET") {
    try {
      sendJson(res, 200, await getPersonalComplejoOptions());
    } catch (error) {
      sendJson(res, 500, { error: error.message });
    }
    return;
  }

  if (req.url.startsWith("/api/alojamiento") && req.method === "GET") {
    try {
      sendJson(res, 200, await getAlojamientoRows());
    } catch (error) {
      sendJson(res, 500, { error: error.message });
    }
    return;
  }

  if (req.url.startsWith("/api/interno") && req.method === "GET") {
    try {
      const url = new URL(req.url, `http://${HOST}:${PORT}`);
      sendJson(res, 200, await findInternoByLpu(url.searchParams.get("lpu")));
    } catch (error) {
      sendJson(res, 500, { error: error.message });
    }
    return;
  }

  serveStatic(req, res);
});

server.listen(PORT, HOST, () => {
  console.log(`Consejo Correccional disponible en http://${HOST}:${PORT}/consejo_correccional.html`);
});

