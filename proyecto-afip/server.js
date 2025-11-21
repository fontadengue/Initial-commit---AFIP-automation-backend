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
// FUNCIÓN PRINCIPAL: LOGIN + NOMBRE
// ================================
async function procesarClienteAFIP(page, cuit, clave) {
  try {
    console.log("→ Cargando login AFIP...");

    await page.goto("https://auth.afip.gob.ar/contribuyente_/login.xhtml", {
      waitUntil: "networkidle2",
      timeout: 30000
    });

    await sleep(1000);

    //
    // 1) CUIT
    //
    console.log("→ Ingresando CUIT...", cuit);

    await page.waitForSelector("#F1\\:username", { timeout: 15000 });
    await page.click("#F1\\:username");
    await sleep(200);
    await page.type("#F1\\:username", cuit, { delay: 80 });

    //
    // 2) CLIC EN SIGUIENTE
    //
    console.log("→ Click en Siguiente");

    await page.waitForSelector("#F1\\:btnSiguiente", { timeout: 15000 });
    await sleep(200);
    await page.click("#F1\\:btnSiguiente");

    await page.waitForNavigation({ waitUntil: "networkidle2", timeout: 30000 });

    //
    // 3) CLAVE
    //
    console.log("→ Ingresando contraseña");

    await page.waitForSelector("#F1\\:password", { timeout: 15000 });
    await page.click("#F1\\:password");
    await sleep(200);
    await page.type("#F1\\:password", clave, { delay: 90 });

    //
    // 4) CLIC EN INGRESAR
    //
    console.log("→ Click en Ingresar");

    await page.waitForSelector("#F1\\:btnIngresar", { timeout: 15000 });
    await sleep(200);
    await page.click("#F1\\:btnIngresar");

    await page.waitForNavigation({ waitUntil: "networkidle2", timeout: 30000 });

    await sleep(1500);

    //
    // 5) EXTRAER NOMBRE
    //
    console.log("→ Extrayendo nombre del contribuyente...");

    await page.waitForSelector(".text-primary", { timeout: 15000 });

    const nombre = await page.$eval(".text-primary", el => el.textContent.trim());

    console.log("✓ Nombre encontrado:", nombre);

    return { success: true, nombre };

  } catch (error) {
    console.error("✗ Error procesando AFIP:", error.message);

    return {
      success: false,
      error: error.message
    };
  }
}

// ================================
// /api/process
// ================================
app.post("/api/process", upload.single("excel"), async (req, res) => {
  console.log("📥 Excel recibido:", req.file.originalname);

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

    console.log(`📊 Clientes detectados: ${total}`);

    const resultados = [];

    //
    // LANZAR CHROMIUM
    //
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

    //
    // PROCESAR CADA CLIENTE
    //
    for (let i = 0; i < total; i++) {
      const [CUITraw, CLAVEraw, CLIENTEraw] = dataRows[i];

      const CUIT = String(CUITraw || "").replace(/\D/g, "");
      const CLAVE = String(CLAVEraw || "").trim();
      const NUM_CLIENTE = String(CLIENTEraw || "").trim();

      sendSSE(res, {
        type: "progress",
        current: i + 1,
        total,
        cuit: CUIT,
        cliente: NUM_CLIENTE
      });

      const r = await procesarClienteAFIP(page, CUIT, CLAVE);

      resultados.push({
        numCliente: NUM_CLIENTE,
        nombre: r.success ? r.nombre : `ERROR: ${r.error}`
      });

      if (i < total - 1) await sleep(1500 + Math.random() * 2500);
    }

    //
    // CREAR EXCEL DE RESULTADOS
    //
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

    sendSSE(res, { type: "error", message: error.message });
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
