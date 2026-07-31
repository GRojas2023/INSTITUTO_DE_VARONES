const test = require("node:test");
const assert = require("node:assert/strict");
const {
  SANCIONES_HEADERS,
  buildSancionValueRanges,
  getSancionLayout,
  mapSancionRowByLayout,
} = require("../api/_lib/sanciones-layout");

const columnNumber = (name) => [...name].reduce(
  (number, letter) => (number * 26) + letter.charCodeAt(0) - 64,
  0
);

test("lee las sanciones por encabezado e ignora columnas auxiliares intercaladas", () => {
  const sheetHeaders = [...SANCIONES_HEADERS];
  sheetHeaders[1] = "ACTA N°";
  sheetHeaders.splice(2, 0, "AUXILIAR CALCULO 1");
  sheetHeaders.splice(12, 0, "AUXILIAR CALCULO 2");

  const layout = getSancionLayout(sheetHeaders);
  const expected = SANCIONES_HEADERS.map((_, index) => `valor-${index}`);
  expected[9] = "13/7/2026";
  expected[10] = "Artículo 19 Inc. b)";

  const sourceRow = Array.from({ length: sheetHeaders.length }, () => "");
  layout.columnIndexes.forEach((sheetIndex, valueIndex) => {
    sourceRow[sheetIndex] = expected[valueIndex];
  });
  sourceRow[sheetHeaders.indexOf("AUXILIAR CALCULO 1")] = "=1+1";
  sourceRow[sheetHeaders.indexOf("AUXILIAR CALCULO 2")] = "=2+2";

  assert.deepEqual(mapSancionRowByLayout(sourceRow, layout), expected);
});

test("escribe alrededor de columnas auxiliares sin incluirlas en los rangos", () => {
  const sheetHeaders = [...SANCIONES_HEADERS];
  sheetHeaders.splice(2, 0, "AUXILIAR CALCULO 1");
  sheetHeaders.splice(12, 0, "AUXILIAR CALCULO 2");

  const layout = getSancionLayout(sheetHeaders);
  const values = SANCIONES_HEADERS.map((_, index) => `valor-${index}`);
  const ranges = buildSancionValueRanges(42, values, layout);
  const writtenCells = new Map();

  ranges.forEach((entry) => {
    const match = entry.range.match(/!([A-Z]+)42:([A-Z]+)42$/);
    assert.ok(match, `Rango inesperado: ${entry.range}`);
    const startIndex = columnNumber(match[1]) - 1;
    const endIndex = columnNumber(match[2]) - 1;
    assert.equal(entry.values[0].length, endIndex - startIndex + 1);
    entry.values[0].forEach((value, offset) => {
      writtenCells.set(startIndex + offset, value);
    });
  });

  layout.columnIndexes.forEach((sheetIndex, valueIndex) => {
    assert.equal(writtenCells.get(sheetIndex), values[valueIndex]);
  });
  assert.equal(writtenCells.has(sheetHeaders.indexOf("AUXILIAR CALCULO 1")), false);
  assert.equal(writtenCells.has(sheetHeaders.indexOf("AUXILIAR CALCULO 2")), false);
});

test("no desplaza fecha y sancion cuando la fila termina en esas columnas", () => {
  const layout = getSancionLayout(SANCIONES_HEADERS);
  const shortRow = [
    "expediente",
    "acta",
    "interno",
    "lpu",
    "fecha hecho",
    "descripcion",
    "tipo",
    "articulos",
    "orden",
    "13/7/2026",
    "Artículo 19 Inc. b)",
  ];

  const mapped = mapSancionRowByLayout(shortRow, layout);

  assert.equal(mapped.length, SANCIONES_HEADERS.length);
  assert.equal(mapped[9], "13/7/2026");
  assert.equal(mapped[10], "Artículo 19 Inc. b)");
  assert.equal(mapped[11], "");
  assert.equal(mapped[12], "");
});

test("repara filas antiguas con fecha y sancion desplazadas dos columnas", () => {
  const layout = getSancionLayout(SANCIONES_HEADERS);
  const shiftedRow = Array.from({ length: SANCIONES_HEADERS.length }, () => "");
  shiftedRow[8] = "903/2026";
  shiftedRow[11] = "6/7/2026";
  shiftedRow[12] = "Artículo 19 Inc. e)";
  shiftedRow[13] = "Muy Bueno OCHO (08)";

  const mapped = mapSancionRowByLayout(shiftedRow, layout);

  assert.equal(mapped.length, SANCIONES_HEADERS.length);
  assert.equal(mapped[9], "6/7/2026");
  assert.equal(mapped[10], "Artículo 19 Inc. e)");
  assert.equal(mapped[11], "Muy Bueno OCHO (08)");
});

test("detiene la escritura si falta un encabezado requerido", () => {
  const headersWithoutSancion = SANCIONES_HEADERS.filter((header) => header !== "SANCION");

  assert.throws(
    () => getSancionLayout(headersWithoutSancion),
    /Faltan columnas requeridas.*SANCION/
  );
});
