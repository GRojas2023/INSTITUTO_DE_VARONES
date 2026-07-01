function doPost(e) {
  if (!e || !e.postData || !e.postData.contents) {
    return ContentService.createTextOutput(JSON.stringify({
      status: "ERROR",
      message: "doPost debe ejecutarse desde una solicitud POST web. Para probar desde Apps Script usa probarDoPost()."
    })).setMimeType(ContentService.MimeType.JSON);
  }

  var p = JSON.parse(e.postData.contents);
  var sheet = SpreadsheetApp.getActiveSpreadsheet().getActiveSheet();
  var data = sheet.getDataRange().getValues();

  var filaDestino = -1;
  for (var i = 1; i < data.length; i++) {
    if (data[i][1] === p.fecha) {
      filaDestino = i + 1;
      break;
    }
  }

  var timestamp = new Date();
  if (filaDestino === -1) {
    sheet.appendRow([data.length, p.fecha, p.turno, p.responsable, JSON.stringify(p.sections), timestamp]);
  } else {
    sheet.getCell(filaDestino, 3).setValue(p.turno);
    sheet.getCell(filaDestino, 4).setValue(p.responsable);
    sheet.getCell(filaDestino, 5).setValue(JSON.stringify(p.sections));
    sheet.getCell(filaDestino, 6).setValue(timestamp);
  }

  return ContentService.createTextOutput(JSON.stringify({ status: "SUCCESS" }))
    .setMimeType(ContentService.MimeType.JSON);
}

function doGet(e) {
  var sheet = SpreadsheetApp.getActiveSpreadsheet().getActiveSheet();
  var data = sheet.getDataRange().getValues();
  var res = [];

  for (var i = 1; i < data.length; i++) {
    if (!data[i][4]) continue;
    res.push({
      id: data[i][0],
      fecha: data[i][1],
      turno: data[i][2],
      responsable: data[i][3],
      sections: JSON.parse(data[i][4])
    });
  }

  return ContentService.createTextOutput(JSON.stringify(res))
    .setMimeType(ContentService.MimeType.JSON);
}

function probarDoPost() {
  var eventoSimulado = {
    postData: {
      contents: JSON.stringify({
        fecha: "02/06/2026",
        turno: "A",
        responsable: "Subalcaide Diego LUERE",
        sections: {
          cabecera: {
            fecha: "02/06/2026",
            hora: "07:00HS",
            turno: "A",
            efectivo: "19",
            presentes: "18",
            ausentes: "1"
          },
          personal: {},
          poblacion: {},
          novedades: {},
          firmas: {
            firma_1: "Subalcaide Diego LUERE"
          }
        }
      })
    }
  };

  var respuesta = doPost(eventoSimulado);
  Logger.log(respuesta.getContent());
}