const crypto = require("crypto");

const SPREADSHEET_ID = "1DuK6GHozJGHSUQ7TVDIKODDm5XJnNpq9k9lheHWLvHE";
const SHEET_RANGE = "consejo";
const CONFIG_TRAMITES_RANGE = "Configuracion!A:A";
const CONFIG_CONSEJO_RANGE = "Configuracion!C1:F10";
const CONFIG_CEIP_RANGE = "Configuracion!H1:K10";
const INTERNOS_RANGE = "internos";
const SHEET_ID = 0;

const base64Url = (value) =>
  Buffer.from(value)
    .toString("base64")
    .replace(/=/g, "")
    .replace(/\+/g, "-")
    .replace(/\//g, "_");

const getAccessToken = async () => {
  const clientEmail = process.env.GOOGLE_CLIENT_EMAIL;
  const privateKey = (process.env.GOOGLE_PRIVATE_KEY || "").replace(/\\n/g, "\n");
  const tokenUri = process.env.GOOGLE_TOKEN_URI || "https://oauth2.googleapis.com/token";

  if (!clientEmail || !privateKey) {
    throw new Error("Faltan las variables de entorno GOOGLE_CLIENT_EMAIL y/o GOOGLE_PRIVATE_KEY.");
  }

  const now = Math.floor(Date.now() / 1000);
  const header = base64Url(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  const claim = base64Url(
    JSON.stringify({
      iss: clientEmail,
      scope: "https://www.googleapis.com/auth/spreadsheets",
      aud: tokenUri,
      exp: now + 3600,
      iat: now,
    })
  );
  const unsignedJwt = `${header}.${claim}`;
  const signature = crypto
    .createSign("RSA-SHA256")
    .update(unsignedJwt)
    .sign(privateKey, "base64")
    .replace(/=/g, "")
    .replace(/\+/g, "-")
    .replace(/\//g, "_");
  const jwt = `${unsignedJwt}.${signature}`;

  const response = await fetch(tokenUri, {
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
  return data.access_token;
};

const getSheetValues = async (range) => {
  const token = await getAccessToken();
  const url = new URL(
    `https://sheets.googleapis.com/v4/spreadsheets/${SPREADSHEET_ID}/values/${encodeURIComponent(range)}`
  );
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

const normalizeKey = (value) =>
  String(value || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]/g, "");

const findHeaderIndex = (headers, candidates) => {
  const keys = candidates.map(normalizeKey);
  return headers.findIndex((header) => keys.includes(normalizeKey(header)));
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

// ── Consejo ──

const getConsejoRows = async () => {
  const values = await getSheetValues(SHEET_RANGE);
  const headers = values[0] || [];
  const rowPairs = values
    .slice(1)
    .map((row, index) => ({ row, rowNumber: index + 2 }))
    .filter(({ row }) => row.some((cell) => String(cell || "").trim() !== ""));
  const rows = rowPairs.map(({ row }) => row);
  const rowNumbers = rowPairs.map(({ rowNumber }) => rowNumber);

  return { headers, rows, rowNumbers, cachedAt: new Date().toISOString() };
};

const insertConsejoRow = async (values) => {
  if (!Array.isArray(values) || !values.some((value) => String(value || "").trim() !== "")) {
    throw new Error("Completa al menos un campo antes de guardar.");
  }

  const token = await getAccessToken();
  const currentData = await getConsejoRows();
  const columnCount = currentData.headers.length;
  const rowValues = Array.from({ length: columnCount }, (_, index) => String(values[index] || ""));

  const batchUrl = new URL(
    `https://sheets.googleapis.com/v4/spreadsheets/${SPREADSHEET_ID}:batchUpdate`
  );
  const insertResponse = await fetch(batchUrl, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      requests: [
        {
          insertDimension: {
            range: {
              sheetId: SHEET_ID,
              dimension: "ROWS",
              startIndex: 1,
              endIndex: 2,
            },
            inheritFromBefore: false,
          },
        },
      ],
    }),
  });

  if (!insertResponse.ok) {
    const text = await insertResponse.text();
    throw new Error(`Google Sheets insert error: ${insertResponse.status} ${text}`);
  }

  const endColumn = columnName(columnCount);
  const valuesUrl = new URL(
    `https://sheets.googleapis.com/v4/spreadsheets/${SPREADSHEET_ID}/values/${encodeURIComponent(
      `${SHEET_RANGE}!A2:${endColumn}2`
    )}`
  );
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

  return getConsejoRows();
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
  const currentData = await getConsejoRows();
  const columnCount = currentData.headers.length;
  const rowValues = Array.from({ length: columnCount }, (_, index) => String(values[index] || ""));
  const endColumn = columnName(columnCount);
  const valuesUrl = new URL(
    `https://sheets.googleapis.com/v4/spreadsheets/${SPREADSHEET_ID}/values/${encodeURIComponent(
      `${SHEET_RANGE}!A${targetRow}:${endColumn}${targetRow}`
    )}`
  );
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

  return getConsejoRows();
};

const deleteConsejoRow = async (rowNumber) => {
  const targetRow = Number(rowNumber);
  if (!Number.isInteger(targetRow) || targetRow < 2) {
    throw new Error("Fila invalida para eliminar.");
  }

  const token = await getAccessToken();
  const batchUrl = new URL(
    `https://sheets.googleapis.com/v4/spreadsheets/${SPREADSHEET_ID}:batchUpdate`
  );
  const response = await fetch(batchUrl, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      requests: [
        {
          deleteDimension: {
            range: {
              sheetId: SHEET_ID,
              dimension: "ROWS",
              startIndex: targetRow - 1,
              endIndex: targetRow,
            },
          },
        },
      ],
    }),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Google Sheets delete error: ${response.status} ${text}`);
  }

  return getConsejoRows();
};

// ── Internos ──

const getInternosRows = async () => {
  const values = await getSheetValues(INTERNOS_RANGE);
  const headers = values[0] || [];
  const rows = values
    .slice(1)
    .filter((row) => row.some((cell) => String(cell || "").trim() !== ""));

  return { headers, rows, cachedAt: new Date().toISOString() };
};

const findInternoByLpu = async (lpu) => {
  const requestedLpu = normalizeKey(lpu);
  if (!requestedLpu) {
    throw new Error("Ingresa un L.P.U. para buscar.");
  }

  const { headers, rows } = await getInternosRows();
  const lpuIndex = findHeaderIndex(headers, [
    "L.P.U.",
    "L.P.U",
    "LPU",
    "L.P.U. N°",
    "L.P.U. N",
  ]);
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

// ── Tramites ──

const getTramites = async () => {
  const values = await getSheetValues(CONFIG_TRAMITES_RANGE);
  const tramites = values
    .map((row) => String(row[0] || "").trim())
    .filter(Boolean);

  return { tramites, cachedAt: new Date().toISOString() };
};

const appendTramite = async (tramite) => {
  const nextTramite = String(tramite || "").trim();
  if (!nextTramite) {
    throw new Error("Escribi un tramite para agregar.");
  }

  const current = await getTramites();
  const exists = current.tramites.some(
    (item) => item.toLowerCase() === nextTramite.toLowerCase()
  );
  if (exists) {
    throw new Error("Ese tramite ya existe en la lista.");
  }

  const token = await getAccessToken();
  const url = new URL(
    `https://sheets.googleapis.com/v4/spreadsheets/${SPREADSHEET_ID}/values/${encodeURIComponent(
      CONFIG_TRAMITES_RANGE
    )}:append`
  );
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

  return getTramites();
};

const updateTramites = async (tramites) => {
  if (!Array.isArray(tramites)) {
    throw new Error("Formato invalido para guardar tramites.");
  }

  const normalized = tramites
    .map((tramite) => String(tramite || "").trim())
    .filter(Boolean);
  const duplicated = normalized.find(
    (tramite, index) =>
      normalized.findIndex((item) => item.toLowerCase() === tramite.toLowerCase()) !== index
  );

  if (duplicated) {
    throw new Error(`El tramite "${duplicated}" esta repetido.`);
  }

  const token = await getAccessToken();
  const clearUrl = new URL(
    `https://sheets.googleapis.com/v4/spreadsheets/${SPREADSHEET_ID}/values/${encodeURIComponent(
      CONFIG_TRAMITES_RANGE
    )}:clear`
  );
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
    const updateUrl = new URL(
      `https://sheets.googleapis.com/v4/spreadsheets/${SPREADSHEET_ID}/values/${encodeURIComponent(
        CONFIG_TRAMITES_RANGE
      )}`
    );
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

  return getTramites();
};

// ── Config Consejo Correccional ──

const getConfigConsejoCorreccional = async () => {
  const values = await getSheetValues(CONFIG_CONSEJO_RANGE);
  const rows = Array.from({ length: 10 }, (_, rowIndex) =>
    Array.from({ length: 4 }, (_, columnIndex) => String(values[rowIndex]?.[columnIndex] || ""))
  );

  return { range: CONFIG_CONSEJO_RANGE, rows, cachedAt: new Date().toISOString() };
};

const updateConfigConsejoCorreccional = async (rows) => {
  if (!Array.isArray(rows)) {
    throw new Error("Formato invalido para guardar la configuracion.");
  }

  const token = await getAccessToken();
  const values = Array.from({ length: 10 }, (_, rowIndex) =>
    Array.from({ length: 4 }, (_, columnIndex) => String(rows[rowIndex]?.[columnIndex] || ""))
  );
  const url = new URL(
    `https://sheets.googleapis.com/v4/spreadsheets/${SPREADSHEET_ID}/values/${encodeURIComponent(
      CONFIG_CONSEJO_RANGE
    )}`
  );
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

  return getConfigConsejoCorreccional();
};

// ── Config Centro Evaluacion Procesados ──

const getConfigCentroEvaluacionProcesados = async () => {
  const values = await getSheetValues(CONFIG_CEIP_RANGE);
  const rows = Array.from({ length: 10 }, (_, rowIndex) =>
    Array.from({ length: 4 }, (_, columnIndex) => String(values[rowIndex]?.[columnIndex] || ""))
  );

  return { range: CONFIG_CEIP_RANGE, rows, cachedAt: new Date().toISOString() };
};

const updateConfigCentroEvaluacionProcesados = async (rows) => {
  if (!Array.isArray(rows)) {
    throw new Error("Formato invalido para guardar la configuracion.");
  }

  const token = await getAccessToken();
  const values = Array.from({ length: 10 }, (_, rowIndex) =>
    Array.from({ length: 4 }, (_, columnIndex) => String(rows[rowIndex]?.[columnIndex] || ""))
  );
  const url = new URL(
    `https://sheets.googleapis.com/v4/spreadsheets/${SPREADSHEET_ID}/values/${encodeURIComponent(
      CONFIG_CEIP_RANGE
    )}`
  );
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

  return getConfigCentroEvaluacionProcesados();
};

module.exports = {
  getConsejoRows,
  insertConsejoRow,
  updateConsejoRow,
  deleteConsejoRow,
  findInternoByLpu,
  getTramites,
  appendTramite,
  updateTramites,
  getConfigConsejoCorreccional,
  updateConfigConsejoCorreccional,
  getConfigCentroEvaluacionProcesados,
  updateConfigCentroEvaluacionProcesados,
};
