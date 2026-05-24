const crypto = require("crypto");
const fs = require("fs/promises");
const http = require("http");
const path = require("path");

const PORT = Number(process.env.PORT || 8780);
const HOST = "127.0.0.1";
const ROOT = __dirname;
const SPREADSHEET_ID = "1DuK6GHozJGHSUQ7TVDIKODDm5XJnNpq9k9lheHWLvHE";
const SHEET_RANGE = "consejo";
const CONFIG_TRAMITES_RANGE = "Configuracion!A:A";
const CONFIG_CONSEJO_RANGE = "Configuracion!C1:E10";
const CONFIG_CEIP_RANGE = "Configuracion!H1:K10";
const INTERNOS_RANGE = "internos";
const SHEET_ID = 0;
const CREDENTIALS_PATH = path.join(ROOT, "credenciales.json");
const SHEET_CACHE_MS = 60000;

let tokenCache = null;
let sheetCache = null;
let tramitesCache = null;
let configConsejoCache = null;
let configCeipCache = null;
let internosCache = null;

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

const getInternosRows = async (forceRefresh = false) => {
  if (!forceRefresh && internosCache && internosCache.expiresAt > Date.now()) {
    return internosCache.data;
  }

  const values = await getSheetValues(INTERNOS_RANGE);
  const headers = values[0] || [];
  const rows = values.slice(1).filter((row) => row.some((cell) => String(cell || "").trim() !== ""));

  internosCache = {
    data: { headers, rows, cachedAt: new Date().toISOString() },
    expiresAt: Date.now() + SHEET_CACHE_MS,
  };

  return internosCache.data;
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
    Array.from({ length: 4 }, (_, columnIndex) => String(values[rowIndex]?.[columnIndex] || ""))
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
    Array.from({ length: 4 }, (_, columnIndex) => String(rows[rowIndex]?.[columnIndex] || ""))
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
