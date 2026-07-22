const crypto = require("crypto");

const SPREADSHEET_ID = "1DuK6GHozJGHSUQ7TVDIKODDm5XJnNpq9k9lheHWLvHE";
const SHEET_RANGE = "consejo";
const CONFIG_TRAMITES_RANGE = "Configuracion!A:A";
const CONFIG_CONSEJO_RANGE = "Configuracion!C1:F10";
const CONFIG_CEIP_RANGE = "Configuracion!H1:K10";
const CONFIG_SANCIONES_ARTICULOS_RANGE = "Configuracion!N:P";
const CONFIG_SANCIONES_CALIFICACIONES_RANGE = "Configuracion!S:S";
const INTERNOS_RANGE = "internos";
const PERSONAL_COMPLEJO_RANGE = "PERSONAL_COMPLEJO!D:F";
const SANCIONES_RANGE = "'SANCIONES_RESUELTA'!A:S";
const ALOJAMIENTO_RANGE = "ALOJAMIENTO";
const SHEET_ID = 0;
const ARCHIVO_SHEET = "archivo";
const ARCHIVO_RANGE = "'archivo'!A:C";
const PARTE_DIARIO_ACTUAL_RANGE = "parte_diario_actual";
const PARTE_PERSONAL_SERVICIO_SHEET = "PERSONAL DE SERVICIO";
const PARTE_PERSONAL_SHEET = "PERSONAL";
const PARTE_NOVEDADES_SHEET = "NOVEDADES";
const PARTE_ALOJAMIENTO_SHEET = "ALOJAMIENTO";
const PARTE_OBSERVACIONES_SHEET = "OBSERVACIONES";
const NOVEDADES_RANGE = "'NOVEDADES'!A:H";
const NOVEDADES_HEADERS = [
  "FECHA CARGA",
  "LPU N",
  "APELLIDO Y NOMBRE",
  "NOVEDAD",
  "ALOJAMIENTO",
  "INICIO",
  "FINALIZACION",
  "OBSERVACION",
];
const SANCIONES_HEADERS = [
  "EXPEDIENTE",
  "ACTA N.",
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
const ALOJAMIENTO_OPTIONS = [
  "ANEXO-PA",
  "ANEXO-PB",
  "ANEXO-PC",
  "ANEXO-PD",
  "FUNC. 2 PA",
  "FUNC. 2 PB",
  "FUNC. 3 PA",
  "FUNC. 3 PB",
  "FUNC. 4 PA",
  "FUNC. 4 PB",
  "SECT.POLI.TRAT. PA",
  "SECT.POLI.TRAT. PB",
  "SECT.POLI.TRAT. PC",
  "SECT.POLI.TRAT. PD",
  "SECT.POLI.TRAT. PE",
];

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

const rowsFromSheetValues = (values) => {
  const headers = values[0] || [];
  const rowPairs = values
    .slice(1)
    .map((row, index) => ({ row, rowNumber: index + 2 }))
    .filter(({ row }) => row.some((cell) => String(cell || "").trim() !== ""));

  return {
    headers,
    rows: rowPairs.map(({ row }) => row),
    rowNumbers: rowPairs.map(({ rowNumber }) => rowNumber),
    cachedAt: new Date().toISOString(),
  };
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
  const url = new URL(
    `https://sheets.googleapis.com/v4/spreadsheets/${SPREADSHEET_ID}/values/${encodeURIComponent(
      sheetTitle
    )}:append`
  );
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

const insertSheetRowsAfterHeader = async (sheetTitle, rows, valueInputOption = "USER_ENTERED") => {
  const values = (Array.isArray(rows) ? rows : [])
    .filter((row) => Array.isArray(row) && row.some((cell) => String(cell || "").trim() !== ""));

  if (!values.length) {
    return { ok: true, skipped: true, updatedRange: "" };
  }

  await ensureSheetExists(sheetTitle);

  const token = await getAccessToken();
  const sheetId = await getSheetIdByTitle(sheetTitle);
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
            endIndex: values.length + 1,
          },
          inheritFromBefore: false,
        },
      }],
    }),
  });

  if (!insertResponse.ok) {
    const text = await insertResponse.text();
    throw new Error(`Google Sheets insert error (${sheetTitle}): ${insertResponse.status} ${text}`);
  }

  const endColumn = columnName(Math.max(...values.map((row) => row.length)));
  const valuesUrl = new URL(
    `https://sheets.googleapis.com/v4/spreadsheets/${SPREADSHEET_ID}/values/${encodeURIComponent(
      quotedSheetRange(sheetTitle, `A2:${endColumn}${values.length + 1}`)
    )}`
  );
  valuesUrl.searchParams.set("valueInputOption", valueInputOption);

  const updateResponse = await fetch(valuesUrl, {
    method: "PUT",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ values }),
  });

  if (!updateResponse.ok) {
    const text = await updateResponse.text();
    throw new Error(`Google Sheets update error (${sheetTitle}): ${updateResponse.status} ${text}`);
  }

  const data = await updateResponse.json();
  return { ok: true, skipped: false, updatedRange: data.updatedRange || "" };
};

const normalizeParteArchiveCell = (value) => String(value || "")
  .trim()
  .replace(/\s+/g, " ")
  .toUpperCase();

const parteArchiveKey = (row) => (Array.isArray(row) ? row : [])
  .slice(1)
  .map(normalizeParteArchiveCell)
  .join("\u001f");

const novedadesEventKey = (row) => {
  if (!Array.isArray(row)) return "";
  const parts = [row[1], row[3], row[5]].map(normalizeParteArchiveCell);
  return parts.every(Boolean) ? parts.join("\u001f") : "";
};

const rowCompletenessScore = (row) => (Array.isArray(row) ? row : [])
  .reduce((score, cell) => score + (String(cell || "").trim() ? 1 : 0), 0);

const mergeNovedadRows = (existingRow, incomingRow) => {
  const size = Math.max(existingRow?.length || 0, incomingRow?.length || 0, NOVEDADES_HEADERS.length);
  return Array.from({ length: size }, (_, index) => {
    const incomingValue = incomingRow?.[index];
    const existingValue = existingRow?.[index];
    return String(incomingValue || "").trim() ? incomingValue : existingValue || "";
  });
};

const updateSheetRow = async (sheetTitle, rowNumber, row, valueInputOption = "USER_ENTERED") => {
  const values = Array.isArray(row) ? row : [];
  if (!values.length || !Number.isInteger(rowNumber) || rowNumber < 2) {
    return { ok: true, skipped: true, updatedRange: "" };
  }

  await ensureSheetExists(sheetTitle);

  const token = await getAccessToken();
  const endColumn = columnName(values.length);
  const valuesUrl = new URL(
    `https://sheets.googleapis.com/v4/spreadsheets/${SPREADSHEET_ID}/values/${encodeURIComponent(
      quotedSheetRange(sheetTitle, `A${rowNumber}:${endColumn}${rowNumber}`)
    )}`
  );
  valuesUrl.searchParams.set("valueInputOption", valueInputOption);

  const response = await fetch(valuesUrl, {
    method: "PUT",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ values: [values] }),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Google Sheets update error (${sheetTitle}): ${response.status} ${text}`);
  }

  const data = await response.json();
  return { ok: true, skipped: false, updatedRange: data.updatedRange || "" };
};

const deleteSheetRows = async (sheetTitle, rowNumbers) => {
  const rows = [...new Set((Array.isArray(rowNumbers) ? rowNumbers : [])
    .filter((rowNumber) => Number.isInteger(rowNumber) && rowNumber >= 2))]
    .sort((a, b) => b - a);

  if (!rows.length) {
    return { ok: true, skipped: true, deletedRows: 0 };
  }

  await ensureSheetExists(sheetTitle);

  const token = await getAccessToken();
  const sheetId = await getSheetIdByTitle(sheetTitle);
  const batchUrl = new URL(`https://sheets.googleapis.com/v4/spreadsheets/${SPREADSHEET_ID}:batchUpdate`);
  const response = await fetch(batchUrl, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      requests: rows.map((rowNumber) => ({
        deleteDimension: {
          range: {
            sheetId,
            dimension: "ROWS",
            startIndex: rowNumber - 1,
            endIndex: rowNumber,
          },
        },
      })),
    }),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Google Sheets delete error (${sheetTitle}): ${response.status} ${text}`);
  }

  return { ok: true, skipped: false, deletedRows: rows.length };
};

const cleanupNovedadesSheetDuplicates = async (valueInputOption = "RAW") => {
  await ensureSheetExists(PARTE_NOVEDADES_SHEET);

  const existingValues = await getArchivedSheetValues(PARTE_NOVEDADES_SHEET, "A:H");
  const existingByKey = new Map();
  existingValues.slice(1).forEach((row, index) => {
    const key = novedadesEventKey(row);
    if (!key) return;
    const entry = {
      row,
      rowNumber: index + 2,
      score: rowCompletenessScore(row),
      timestampMs: parseSheetTimestamp(row[0]),
    };
    if (!existingByKey.has(key)) existingByKey.set(key, []);
    existingByKey.get(key).push(entry);
  });

  let updated = 0;
  const duplicateRowNumbers = [];

  for (const entries of existingByKey.values()) {
    if (entries.length < 2) continue;

    const sorted = [...entries].sort((a, b) =>
      b.score - a.score ||
      (Number.isFinite(b.timestampMs) ? b.timestampMs : 0) - (Number.isFinite(a.timestampMs) ? a.timestampMs : 0)
    );
    const target = sorted[0];
    const mergedRow = entries.reduce((current, entry) => mergeNovedadRows(entry.row, current), target.row);
    await updateSheetRow(PARTE_NOVEDADES_SHEET, target.rowNumber, mergedRow, valueInputOption);
    updated += 1;
    duplicateRowNumbers.push(...sorted.slice(1).map((entry) => entry.rowNumber));
  }

  const deleteResult = await deleteSheetRows(PARTE_NOVEDADES_SHEET, duplicateRowNumbers);
  return { updated, deletedDuplicates: deleteResult.deletedRows || 0 };
};

const upsertNovedadesRows = async (rows, valueInputOption = "RAW") => {
  const incomingRows = (Array.isArray(rows) ? rows : [])
    .filter((row) => Array.isArray(row) && row.some((cell) => String(cell || "").trim() !== ""));

  if (!incomingRows.length) {
    return { ok: true, skipped: true, updatedRange: "", inserted: 0, updated: 0, deletedDuplicates: 0 };
  }

  await ensureSheetExists(PARTE_NOVEDADES_SHEET);
  const cleanupResult = await cleanupNovedadesSheetDuplicates(valueInputOption);

  const existingValues = await getArchivedSheetValues(PARTE_NOVEDADES_SHEET, "A:H");
  const existingByKey = new Map();
  existingValues.slice(1).forEach((row, index) => {
    const key = novedadesEventKey(row);
    if (!key) return;
    const entry = {
      row,
      rowNumber: index + 2,
      score: rowCompletenessScore(row),
      timestampMs: parseSheetTimestamp(row[0]),
    };
    if (!existingByKey.has(key)) existingByKey.set(key, []);
    existingByKey.get(key).push(entry);
  });

  const pendingInserts = [];
  let updated = 0;
  let deletedDuplicates = 0;

  for (const incomingRow of incomingRows) {
    const key = novedadesEventKey(incomingRow);
    if (!key) continue;

    const matches = existingByKey.get(key) || [];
    if (!matches.length) {
      pendingInserts.push(incomingRow);
      existingByKey.set(key, [{
        row: incomingRow,
        rowNumber: null,
        pendingIndex: pendingInserts.length - 1,
        score: rowCompletenessScore(incomingRow),
        timestampMs: parseSheetTimestamp(incomingRow[0]),
      }]);
      continue;
    }

    matches.sort((a, b) =>
      b.score - a.score ||
      (Number.isFinite(b.timestampMs) ? b.timestampMs : 0) - (Number.isFinite(a.timestampMs) ? a.timestampMs : 0)
    );
    const target = matches[0];
    const mergedRow = mergeNovedadRows(target.row, incomingRow);
    if (target.rowNumber === null) {
      pendingInserts[target.pendingIndex] = mergedRow;
      existingByKey.set(key, [{
        row: mergedRow,
        rowNumber: null,
        pendingIndex: target.pendingIndex,
        score: rowCompletenessScore(mergedRow),
        timestampMs: parseSheetTimestamp(mergedRow[0]),
      }]);
      continue;
    }

    await updateSheetRow(PARTE_NOVEDADES_SHEET, target.rowNumber, mergedRow, valueInputOption);
    updated += 1;

    const duplicateRowNumbers = matches.slice(1).map((match) => match.rowNumber);
    const deleteResult = await deleteSheetRows(PARTE_NOVEDADES_SHEET, duplicateRowNumbers);
    deletedDuplicates += deleteResult.deletedRows || 0;

    existingByKey.set(key, [{
      row: mergedRow,
      rowNumber: target.rowNumber,
      score: rowCompletenessScore(mergedRow),
      timestampMs: parseSheetTimestamp(mergedRow[0]),
    }]);
  }

  const insertResult = await insertSheetRowsAfterHeader(PARTE_NOVEDADES_SHEET, pendingInserts, valueInputOption);

  return {
    ok: true,
    skipped: false,
    updatedRange: insertResult.updatedRange || "",
    inserted: pendingInserts.length,
    updated: updated + (cleanupResult.updated || 0),
    deletedDuplicates: deletedDuplicates + (cleanupResult.deletedDuplicates || 0),
  };
};

const consolidateNovedadesData = (data) => {
  const groups = new Map();
  const singles = [];

  (data.rows || []).forEach((row, index) => {
    const key = novedadesEventKey(row);
    const entry = {
      row,
      rowNumber: data.rowNumbers?.[index],
      score: rowCompletenessScore(row),
      timestampMs: parseSheetTimestamp(row?.[0]),
      order: index,
    };
    if (!key) {
      singles.push(entry);
      return;
    }
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(entry);
  });

  const consolidated = [
    ...singles,
    ...[...groups.values()].map((entries) => {
      const sorted = [...entries].sort((a, b) =>
        b.score - a.score ||
        (Number.isFinite(b.timestampMs) ? b.timestampMs : 0) - (Number.isFinite(a.timestampMs) ? a.timestampMs : 0)
      );
      const mergedRow = entries.reduce((current, entry) => mergeNovedadRows(entry.row, current), sorted[0].row);
      return { ...sorted[0], row: mergedRow, order: Math.min(...entries.map((entry) => entry.order)) };
    }),
  ].sort((a, b) => a.order - b.order);

  return {
    ...data,
    rows: consolidated.map((entry) => entry.row),
    rowNumbers: consolidated.map((entry) => entry.rowNumber).filter((rowNumber) => rowNumber !== undefined),
  };
};

const removeRowsAlreadyArchived = async (sheetTitle, rows, columns = "A:Z") => {
  const values = await getArchivedSheetValues(sheetTitle, columns);
  const existingKeys = new Set(values
    .filter((row) => Array.isArray(row) && row.length > 1)
    .map(parteArchiveKey)
    .filter(Boolean));
  const seenNewKeys = new Set();

  return rows.filter((row) => {
    const key = parteArchiveKey(row);
    if (!key || existingKeys.has(key) || seenNewKeys.has(key)) return false;
    seenNewKeys.add(key);
    return true;
  });
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

const getInternosRows = async (_forceRefresh = false) => {
  const values = await getSheetValues(INTERNOS_RANGE);
  const headers = values[0] || [];
  const rows = values
    .slice(1)
    .filter((row) => row.some((cell) => String(cell || "").trim() !== ""));

  return { headers, rows, cachedAt: new Date().toISOString() };
};

const appendInterno = async (interno = {}) => {
  const idJudiciales = String(interno.idJudiciales ?? interno.ID_JUDICIALES ?? "").trim();
  const alojamiento = String(interno.alojamiento ?? interno.ALOJAMIENTO ?? "").trim();
  const celda = String(interno.celda ?? interno.CELDA ?? "").trim();
  const apellidoNombre = String(interno.apellidoNombre ?? interno["APELLIDO Y NOMBRE"] ?? "").trim();
  const lpu = String(interno.lpu ?? interno.LPU ?? "").trim();

  if (!/^\d+$/.test(idJudiciales)) {
    throw new Error("ID_JUDICIALES debe ser numerico.");
  }
  if (!ALOJAMIENTO_OPTIONS.includes(alojamiento)) {
    throw new Error("Selecciona un alojamiento valido.");
  }
  if (!/^\d{2}$/.test(celda)) {
    throw new Error("CELDA debe tener dos cifras.");
  }
  if (!/^[A-Za-zÁÉÍÓÚÜÑáéíóúüñ\s.'-]+$/.test(apellidoNombre)) {
    throw new Error("APELLIDO Y NOMBRE debe contener solo texto.");
  }
  if (!/^\d{6}$/.test(lpu)) {
    throw new Error("LPU debe tener seis cifras.");
  }

  const { headers } = await getInternosRows();
  const columnCount = Math.max(headers.length, 5);
  const rowValues = Array.from({ length: columnCount }, () => "");
  const fields = [
    { value: idJudiciales, candidates: ["ID_JUDICIALES", "ID JUDICIALES", "ID JUDICIAL"] },
    { value: alojamiento, candidates: ["ALOJAMIENTO", "ALOJADO"] },
    { value: celda, candidates: ["CELDA"] },
    { value: apellidoNombre.toUpperCase(), candidates: ["APELLIDO Y NOMBRE", "INTERNO", "NOMBRE"] },
    { value: lpu, candidates: ["LPU", "L.P.U.", "L.P.U", "L.P.U. N", "L.P.U. N°"] },
  ];

  fields.forEach(({ value, candidates }, fallbackIndex) => {
    const index = findHeaderIndex(headers, candidates);
    rowValues[index >= 0 ? index : fallbackIndex] = value;
  });

  await appendSheetRows(INTERNOS_RANGE, [rowValues]);
  return getInternosRows();
};

const uniqueSortedValues = (values) => [...new Set(values
  .map((value) => String(value || "").trim())
  .filter(Boolean))]
  .sort((a, b) => a.localeCompare(b, "es", { sensitivity: "base" }));

const getPersonalComplejoOptions = async () => {
  const values = await getSheetValues(PERSONAL_COMPLEJO_RANGE);
  const rows = values.filter((row) => row.some((cell) => String(cell || "").trim() !== ""));
  const personal = rows
    .map((row) => ({
      cred: String(row[0] || "").trim(),
      agente: String(row[1] || "").trim(),
    }))
    .filter((row) => row.cred || row.agente);

  return {
    agentes: uniqueSortedValues(personal.map((row) => row.agente)),
    funciones: uniqueSortedValues(rows.map((row) => row[2])),
    personal,
    cachedAt: new Date().toISOString(),
  };
};

const getAlojamientoRows = async () => {
  const values = await getSheetValues(ALOJAMIENTO_RANGE);
  return rowsFromSheetValues(values);
};

const getNovedadesRows = async () => {
  const values = await getSheetValues(NOVEDADES_RANGE);
  const hasHeader = (values[0] || []).some((cell) => {
    const text = String(cell || "").toLowerCase();
    return text.includes("fecha") || text.includes("lpu") || text.includes("apellido") || text.includes("novedad");
  });

  if (hasHeader) {
    const data = rowsFromSheetValues(values);
    return consolidateNovedadesData({
      ...data,
      headers: NOVEDADES_HEADERS.map((header, index) => data.headers[index] || header),
    });
  }

  const rowPairs = values
    .map((row, index) => ({ row, rowNumber: index + 1 }))
    .filter(({ row }) => row.some((cell) => String(cell || "").trim() !== ""));

  return consolidateNovedadesData({
    headers: NOVEDADES_HEADERS,
    rows: rowPairs.map(({ row }) => row),
    rowNumbers: rowPairs.map(({ rowNumber }) => rowNumber),
    cachedAt: new Date().toISOString(),
  });
};

// Sanciones

const isSancionDateLike = (value) => /^\d{1,2}\/\d{1,2}\/\d{4}$|^\d{4}-\d{2}-\d{2}$/.test(String(value || "").trim());

const isSancionTextLike = (value) => /art[ií]culo\s*19|inc\./i.test(String(value || "").trim());

const normalizeSancionRowShape = (row) => {
  const values = Array.from({ length: Math.max(19, row.length) }, (_, index) => String(row[index] || ""));

  if (!values[9] && !values[10] && isSancionDateLike(values[11]) && isSancionTextLike(values[12])) {
    return [
      ...values.slice(0, 9),
      values[11],
      values[12],
      ...values.slice(13),
    ].slice(0, 19);
  }

  if (row.length <= 17) {
    return [
      ...row.slice(0, 9),
      "",
      "",
      ...row.slice(9),
    ].slice(0, 19);
  }

  return values.slice(0, 19);
};

const getSancionesRows = async () => {
  const values = await getSheetValues(SANCIONES_RANGE);
  const data = rowsFromSheetValues(values);
  const headers = SANCIONES_HEADERS.map((header, index) => data.headers[index] || header);
  const rows = data.rows.map(normalizeSancionRowShape);

  return { ...data, headers, rows };
};

const normalizeSancionValues = (values) => {
  const rowValues = Array.from({ length: 19 }, (_, index) => String(values?.[index] || "").trim());
  if (!rowValues.some(Boolean)) {
    throw new Error("Completa al menos un campo antes de guardar.");
  }
  return rowValues;
};

const insertSancionRow = async (values) => {
  const rowValues = normalizeSancionValues(values);
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

  const valuesUrl = new URL(
    `https://sheets.googleapis.com/v4/spreadsheets/${SPREADSHEET_ID}/values/${encodeURIComponent("'SANCIONES_RESUELTA'!A2:S2")}`
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

  return getSancionesRows();
};

const updateSancionRow = async (rowNumber, values) => {
  const targetRow = Number(rowNumber);
  if (!Number.isInteger(targetRow) || targetRow < 2) {
    throw new Error("Fila invalida para editar.");
  }

  const rowValues = normalizeSancionValues(values);
  const token = await getAccessToken();
  const valuesUrl = new URL(
    `https://sheets.googleapis.com/v4/spreadsheets/${SPREADSHEET_ID}/values/${encodeURIComponent(`'SANCIONES_RESUELTA'!A${targetRow}:S${targetRow}`)}`
  );
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

  return getSancionesRows();
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

  return getSancionesRows();
};

const getSancionesArticleOptions = async () => {
  const values = await getSheetValues(CONFIG_SANCIONES_ARTICULOS_RANGE);
  const normalizeOptions = (columnIndex) => [...new Set(values
    .map((row) => String(row[columnIndex] || "").trim())
    .filter(Boolean))];

  return {
    leve: normalizeOptions(0),
    media: normalizeOptions(1),
    grave: normalizeOptions(2),
    cachedAt: new Date().toISOString(),
  };
};

const getSancionesCalificacionOptions = async () => {
  const values = await getSheetValues(CONFIG_SANCIONES_CALIFICACIONES_RANGE);
  const calificaciones = [...new Set(values
    .map((row) => String(row[0] || "").trim())
    .filter(Boolean))];

  return {
    calificaciones,
    cachedAt: new Date().toISOString(),
  };
};

const getSancionConfigD3 = async () => {
  const values = await getSheetValues("Configuracion!D3:D3");
  return String(values[0]?.[0] || "").trim();
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
  const url = new URL(
    `https://sheets.googleapis.com/v4/spreadsheets/${SPREADSHEET_ID}/values/${encodeURIComponent(
      ARCHIVO_RANGE
    )}:append`
  );
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
// ── Parte Diario Actual ──

const SECTION_MARKER = "__SECTION__";

const getParteDiarioActual = async () => {
  await ensureSheetExists(PARTE_DIARIO_ACTUAL_RANGE);

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

  return { sections, savedAt };
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

  const clearUrl = new URL(
    `https://sheets.googleapis.com/v4/spreadsheets/${SPREADSHEET_ID}/values/${encodeURIComponent(PARTE_DIARIO_ACTUAL_RANGE)}:clear`
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

  if (rows.length > 0) {
    const updateUrl = new URL(
      `https://sheets.googleapis.com/v4/spreadsheets/${SPREADSHEET_ID}/values/${encodeURIComponent(PARTE_DIARIO_ACTUAL_RANGE)}`
    );
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
    const rows = await removeRowsAlreadyArchived(PARTE_PERSONAL_SERVICIO_SHEET, [[timestamp, serviceText]], "A:B");
    results.personalServicio = await insertSheetRowsAfterHeader(PARTE_PERSONAL_SERVICIO_SHEET, rows, "RAW");
  }

  if (staffNewsRows.length) {
    const rows = await removeRowsAlreadyArchived(
      PARTE_PERSONAL_SHEET,
      staffNewsRows.map((row) => [timestamp, ...row]),
      "A:G"
    );
    results.personal = await insertSheetRowsAfterHeader(
      PARTE_PERSONAL_SHEET,
      rows,
      "RAW"
    );
  }

  if (inmateNewsRows.length) {
    results.novedades = await upsertNovedadesRows(
      inmateNewsRows.map((row) => [timestamp, ...row]),
      "RAW"
    );
  }

  if (housingRows.length) {
    const rows = await removeRowsAlreadyArchived(
      PARTE_ALOJAMIENTO_SHEET,
      housingRows.map((row) => [timestamp, ...row]),
      "A:G"
    );
    results.alojamiento = await insertSheetRowsAfterHeader(
      PARTE_ALOJAMIENTO_SHEET,
      rows,
      "RAW"
    );
  }

  if (observationsText && observationsText.toUpperCase() !== "OBSERVACIONES:") {
    const rows = await removeRowsAlreadyArchived(PARTE_OBSERVACIONES_SHEET, [[timestamp, observationsText]], "A:B");
    results.observaciones = await insertSheetRowsAfterHeader(PARTE_OBSERVACIONES_SHEET, rows, "RAW");
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

const getPartePersonalServicioArchivo = async () => {
  const [serviceValues, staffValues] = await Promise.all([
    getArchivedSheetValues(PARTE_PERSONAL_SERVICIO_SHEET, "A:B"),
    getArchivedSheetValues(PARTE_PERSONAL_SHEET, "A:G"),
  ]);

  const staffByTimestamp = new Map();
  for (const row of staffValues) {
    const timestampMs = parseSheetTimestamp(row[0]);
    if (!Number.isFinite(timestampMs)) continue;
    const key = String(timestampMs);
    if (!staffByTimestamp.has(key)) staffByTimestamp.set(key, []);
    staffByTimestamp.get(key).push(row.slice(1));
  }

  const rows = serviceValues
    .map((row) => {
      const savedAt = String(row[0] || "");
      const timestampMs = parseSheetTimestamp(savedAt);
      return {
        savedAt,
        service: parseServiceText(row[1]),
        staffNews: Number.isFinite(timestampMs) ? staffByTimestamp.get(String(timestampMs)) || [] : [],
      };
    })
    .filter((row) => Number.isFinite(parseSheetTimestamp(row.savedAt)) && row.service.length);

  return { rows };
};

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

module.exports = {
  getConsejoRows,
  getInternosRows,
  appendInterno,
  insertConsejoRow,
  updateConsejoRow,
  deleteConsejoRow,
  getPersonalComplejoOptions,
  getAlojamientoRows,
  getNovedadesRows,
  findInternoByLpu,
  getSancionesRows,
  insertSancionRow,
  updateSancionRow,
  deleteSancionRow,
  getSancionesArticleOptions,
  getSancionesCalificacionOptions,
  getSancionConfigD3,
  getTramites,
  appendTramite,
  updateTramites,
  appendArchivoHtml,
  getArchivoRows,
  getConfigConsejoCorreccional,
  updateConfigConsejoCorreccional,
  getConfigCentroEvaluacionProcesados,
  updateConfigCentroEvaluacionProcesados,
  getParteDiarioActual,
  getParteDiarioArchivado,
  getPartePersonalServicioArchivo,
  saveParteDiarioActual,
  saveParteDiario,
};
