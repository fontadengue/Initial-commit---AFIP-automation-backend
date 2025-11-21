const express = require("express");
const cors = require("cors");
const multer = require("multer");
const XLSX = require("xlsx");
const fs = require("fs");
const puppeteer = require("puppeteer");
const path = require("path");

const app = express();

// ================================
// CORS
// ================================
app.use(cors());
app.use(express.json());

// ================================
// MULTER
// ================================
const upload = multer({ dest: "/tmp" });

// ================================
// HEALTH CHECK
// ================================
app.get("/health", (req, res) => {
  res.json({ status: "ok", timestamp: new Date().toISOString() });
});

// ================================
// SSE
// ================================
function sendSSE(res, data) {
  res.write(`data: ${JSON.stringify(data)}\n\n`);
}

// ================================
// SLEEP
// ================================
function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// ================================
// FUNCIÓN PRINCIPAL AFIP (CSS ONLY)
// ================================
async function procesarClienteAFIP(page, cuit, clave) {
  try {
    console.log("→ Entrando al login...");

    await page.goto("https://auth.afip.gob.ar/contribuyente_/login.xhtml", {
      waitUntil: "networkidle2",
      timeout: 30000
    });

    await sleep(1000);

    // CUIT
    await page.waitForSelector('form input[type="text"]', { timeout: 10000 });
    const inputCuit = await page.$('form input[type="text"]');

    if (!inputCuit) throw new Error("No se encontró input de CUIT");

    await inputCuit.click();
    await sleep(200);
    await inputCuit.type(cuit, { delay: 90 });

    // BOTÓN SIGUIENTE
    await page.waitForSelector('form input[type="submit"]', { timeout: 10000 });
    const btnSiguiente = await page.$('form input[type="submit"]');

    if (!btnSiguiente) throw new Error("No se encontró botón Siguiente");

    await sleep(400);
    await btnSiguiente.click();

    await page.waitForNavigation({ waitUntil: "networkidle2", timeout: 30000 });

    // CONTRASEÑA
    await page.waitForSelector('#F1\\:password', { timeout: 10000 });
    await page.click('#F1\\:password');
    await sleep(200);
    await page.type('#F1\\:password', clave, { delay: 90 });

    // BOTÓN INGRESAR
    await page.waitForSelector('form div input[type="submit"]', { timeout: 10000 });
    const btnIngresar = await page.$('form div input[type="submit"]');

    if (!btnIngresar) throw new Error("No se encontró botón Ingresar");

    await sleep(400);
    await btnIngresar.click();

    await page.waitForNavigation({ waitUntil: "networkidle2", timeout: 30000 });

    await sleep(2000);

    // NOMBRE CONTRIBUYENTE
    await page.waitForSelector("header nav strong", { timeout: 10000 });
    const nombreElem = await page.$("header nav strong");

    if (!nombreElem) throw new Error("No se encontró el nombre del contribuyente");

    const nombre = await page.evaluate(el => el.textContent.trim(), nombreElem);

    console.log("✓ Nombre extraído:", nombre);

    return { success: true, nombre };

  } catch (error) {
    console.error("✗ Error en cliente:", error.message);
    return { success: false, error: error.message };
  }
}

// ================================
// /api/process
// ================================
app.post("/api/process", upload.single("excel"), async (req, res) => {
  console.log("📥 Excel recibido.");

  if (!req.file) {
    return res.status(400).json({ error: "No se recibió archivo" });
  }

  // SSE
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.flushHeaders();

  let browser = null;
  let excelPath = null;

  try {
    const workbook = XLSX.readFile(req.file.path);
    const sheet = workbook.Sheets[workbook.SheetNames[0]];
    const rows = XLSX.utils.sheet_to_json(sheet, { header: 1 });

    const dataRows = rows.slice(1).filter(r => r.length >= 3);
    const total = dataRows.length;

    console.log(`📊 Filas encontradas: ${total}`);

    const resultados = [];

    // Navegador
    browser = await puppeteer.launch({
      headless: true,
      args: [
        "--no-sandbox",
        "--disable-setuid-sandbox",
        "--disable-dev-shm-usage",
        "--disable-gpu",
        "--single-process"
      ],
      executablePath: "/usr/bin/chromium"
    });

    const page = await browser.newPage();
    await page.setViewport({ width: 1600, height: 900 });

    // LOOP CLIENTES
    for (let i = 0; i < total; i++) {
      const row = dataRows[i];

      const CUIT = String(row[0] || "").replace(/\D/g, "");
      const CLAVE = String(row[1] || "");
      const NUM_CLIENTE = String(row[2] || "");

      sendSSE(res, {
        type: "progress",
        current: i + 1,
        total,
        cuit: CUIT,
        numCliente: NUM_CLIENTE
      });

      const r = await procesarClienteAFIP(page, CUIT, CLAVE);

      resultados.push({
        numCliente: NUM_CLIENTE,
        nombre: r.success ? r.nombre : `ERROR: ${r.error}`
      });

      if (i < total - 1) {
        await sleep(1500 + Math.random() * 2000);
      }
    }

    // Crear Excel
    const datosExcel = [
      ["NumCliente", "Nombre"],
      ...resultados.map(r => [r.numCliente, r.nombre])
    ];

    const newBook = XLSX.utils.book_new();
    const newSheet = XLSX.utils.aoa_to_sheet(datosExcel);
    XLSX.utils.book_append_sheet(newBook, newSheet, "Resultados");

    excelPath = `/tmp/resultados_${Date.now()}.xlsx`;
    XLSX.writeFile(newBook, excelPath);

    const excelBase64 = fs.readFileSync(excelPath).toString("base64");

    sendSSE(res, {
      type: "complete",
      results: resultados,
      excel: excelBase64,
      filename: `resultados_${new Date().toISOString().split("T")[0]}.xlsx`
    });

    res.end();

    fs.unlinkSync(req.file.path);
    fs.unlinkSync(excelPath);

  } catch (error) {
    console.error("❌ ERROR GENERAL:", error);

    sendSSE(res, {
      type: "error",
      message: error.message
    });

    res.end();

    if (browser) await browser.close();
    if (req.file && fs.existsSync(req.file.path)) fs.unlinkSync(req.file.path);
    if (excelPath && fs.existsSync(excelPath)) fs.unlinkSync(excelPath);
  }
});

// ================================
// INICIO DEL SERVIDOR
// ================================
const PORT = process.env.PORT || 10000;

app.listen(PORT, "0.0.0.0", () => {
  console.log("╔════════════════════════════════════════════╗");
  console.log("║   🚀 SERVIDOR INICIADO                    ║");
  console.log("╚════════════════════════════════════════════╝");
  console.log(`📍 Puerto: ${PORT}`);
  console.log(`🌍 URL: http://localhost:${PORT}`);
  console.log(`🏥 Health: http://localhost:${PORT}/health`);
  console.log(`📊 API: http://localhost:${PORT}/api/process`);
});
