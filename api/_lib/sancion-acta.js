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

const getCurrentLongDate = () => {
  const now = new Date();
  const day = new Intl.DateTimeFormat("es-AR", { day: "2-digit" }).format(now);
  const month = getSpanishMonthName(now);
  const year = String(now.getFullYear());
  return `${day} dias del mes de ${month} del ano ${year}`;
};

const paragraph = (content, className = "") => `<p${className ? ` class="${className}"` : ""}>${content}</p>`;

const buildSancionActaHtml = ({ values = [], configSancion = "" } = {}) => {
  const row = Array.from({ length: 19 }, (_, index) => String(values[index] || "").trim());
  const [
    expediente,
    acta,
    interno,
    lpu,
    fechaHecho,
    descripcion,
    tipo,
    articulos,
    ordenInterna,
    fechaOrdenInterna,
    sancion,
    conductaInicio,
    conceptoInicio,
    faseInicio,
    criterioConducta,
    criterioConcepto,
    conductaFinaliza,
    conceptoFinaliza,
    faseFinaliza,
  ] = row.map(escapeHtml);
  const currentYear = String(new Date().getFullYear());
  const actaNumber = acta || "000";
  const title = `ACTA N ${actaNumber} / ${currentYear} C.C.`;
  const sanctionText = sancion || escapeHtml(configSancion);

  const html = `
    ${paragraph(`<strong>ACTA N ${actaNumber} / ${currentYear} C.C. - Sancion Disciplinaria / Interno ${interno} (L.P.U. ${lpu})</strong>`, "center")}
    ${paragraph(`<strong><u>/ ${currentYear} C.C.</u></strong>`, "center")}
    ${paragraph(`<strong class="red">CONSEJO CORRECCIONAL / CENTRO DE EVALUACION DE INTERNOS PROCESADOS</strong><br><strong>DEL INSTITUTO FEDERAL DE VARONES - C.P.F. III - NOA</strong>`, "center")}
    ${paragraph(`En el Instituto Federal de Varones del Complejo Penitenciario Federal III "Centro Federal Noroeste Argentino" dependiente del Servicio Penitenciario Federal a los ${escapeHtml(getCurrentLongDate())}, se procede a labrar la presente al solo efecto de dejar constancia de la reunion efectuada por el <span class="red">Consejo Correccional</span>, a fin de tratar la <strong>SANCION DISCIPLINARIA</strong> tramita por expediente ${expediente}, impuesta al interno <strong>${interno} (L.P.U. ${lpu})</strong> a raiz de los hechos ocurridos el ${formatDateForSancionActa(fechaHecho)}: <strong>"${descripcion}"</strong>; transgrediendo de esta forma ${articulos}.`)}
    ${paragraph(`Infraccion disciplinaria de caracter <strong>${tipo}</strong>, mediante Orden Interna <strong>${ordenInterna}</strong> de fecha <strong>${formatDateForSancionActa(fechaOrdenInterna)}</strong>, con el correctivo disciplinario correspondiente: <strong>${sanctionText}</strong>.`)}
    ${paragraph(`Segun lo informado y previo analisis de las actuaciones, el interno registra actualmente Conducta <strong>${conductaInicio}</strong>, Concepto <strong>${conceptoInicio}</strong> y Fase <strong>${faseInicio}</strong>.`)}
    ${paragraph(`Previo a ponderar los criterios de calificacion previstos, los integrantes del <span class="red">Consejo Correccional</span> arriban a la CONCLUSION, por consenso de criterios, de DISMINUIR <strong>${criterioConducta}</strong> PUNTOS en el guarismo de CONDUCTA y <strong>${criterioConcepto}</strong> PUNTOS en el guarismo de CONCEPTO del interno <strong>${interno} (L.P.U. ${lpu})</strong>, quedando calificado con Conducta <strong>${conductaFinaliza}</strong>, Concepto <strong>${conceptoFinaliza}</strong> y Fase <strong>${faseFinaliza}</strong>.`)}
    ${paragraph(`<strong>No siendo para mas, se da por finalizada la presente firmando al pie los actuantes.</strong>`)}
  `;

  return { html, title };
};

module.exports = {
  buildSancionActaHtml,
};
