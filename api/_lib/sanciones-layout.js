const SANCIONES_SHEET_TITLE = "SANCIONES_RESUELTA";
const SANCIONES_RANGE = `'${SANCIONES_SHEET_TITLE}'!A:ZZ`;
const SANCIONES_HEADER_RANGE = `'${SANCIONES_SHEET_TITLE}'!1:1`;

const SANCIONES_HEADERS = [
  "EXPEDIENTE",
  "ACTA N°",
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

const normalizeHeaderKey = (value) =>
  String(value || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]/g, "");

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

const getSancionLayout = (sheetHeaders) => {
  const headers = Array.isArray(sheetHeaders) ? sheetHeaders : [];
  const indexesByKey = new Map();

  headers.forEach((header, index) => {
    const key = normalizeHeaderKey(header);
    if (key && !indexesByKey.has(key)) {
      indexesByKey.set(key, index);
    }
  });

  const columnIndexes = SANCIONES_HEADERS.map((header) => (
    indexesByKey.get(normalizeHeaderKey(header)) ?? -1
  ));
  const missingHeaders = SANCIONES_HEADERS.filter((_, index) => columnIndexes[index] < 0);

  if (missingHeaders.length) {
    throw new Error(
      `Faltan columnas requeridas en ${SANCIONES_SHEET_TITLE}: ${missingHeaders.join(", ")}. `
      + "Revisa los encabezados de la fila 1."
    );
  }

  return { columnIndexes, sheetHeaders: headers };
};

const isSancionDateLike = (value) =>
  /^\d{1,2}\/\d{1,2}\/\d{4}$|^\d{4}-\d{2}-\d{2}$/.test(String(value || "").trim());

const isSancionTextLike = (value) =>
  /art[ií]culo\s*19|inc\./i.test(String(value || "").trim());

const padSancionRow = (row) =>
  Array.from({ length: SANCIONES_HEADERS.length }, (_, index) => String(row?.[index] || ""));

const normalizeSancionRowShape = (row) => {
  const values = padSancionRow(row);

  if (!values[9] && !values[10] && isSancionDateLike(values[11]) && isSancionTextLike(values[12])) {
    return padSancionRow([
      ...values.slice(0, 9),
      values[11],
      values[12],
      ...values.slice(13),
    ]);
  }

  return values;
};

const mapSancionRowByLayout = (row, layout) => {
  const source = Array.isArray(row) ? row : [];
  const mapped = layout.columnIndexes.map((columnIndex) => (
    columnIndex >= 0 ? source[columnIndex] : ""
  ));

  return normalizeSancionRowShape(mapped);
};

const buildSancionValueRanges = (rowNumber, values, layout) => {
  const targetRow = Number(rowNumber);
  if (!Number.isInteger(targetRow) || targetRow < 2) {
    throw new Error("Fila invalida para editar.");
  }

  const rowValues = padSancionRow(values);
  const cells = layout.columnIndexes
    .map((columnIndex, valueIndex) => ({ columnIndex, value: rowValues[valueIndex] }))
    .sort((left, right) => left.columnIndex - right.columnIndex);
  const groups = [];

  cells.forEach((cell) => {
    const current = groups.at(-1);
    if (current && cell.columnIndex === current.endColumnIndex + 1) {
      current.endColumnIndex = cell.columnIndex;
      current.values.push(cell.value);
      return;
    }

    groups.push({
      startColumnIndex: cell.columnIndex,
      endColumnIndex: cell.columnIndex,
      values: [cell.value],
    });
  });

  return groups.map((group) => ({
    range: `'${SANCIONES_SHEET_TITLE}'!${columnName(group.startColumnIndex + 1)}${targetRow}:`
      + `${columnName(group.endColumnIndex + 1)}${targetRow}`,
    values: [group.values],
  }));
};

module.exports = {
  SANCIONES_HEADER_RANGE,
  SANCIONES_HEADERS,
  SANCIONES_RANGE,
  SANCIONES_SHEET_TITLE,
  buildSancionValueRanges,
  getSancionLayout,
  mapSancionRowByLayout,
  normalizeHeaderKey,
  normalizeSancionRowShape,
};
