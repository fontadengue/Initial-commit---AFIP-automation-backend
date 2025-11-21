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
// MULTER (SUBIDA DE ARCHIVOS)
// ================================
const upload = multer({ dest: "/tmp" });

// ================================
// HEALTH CHECK
// ================================
app.get("/health", (req, res) => {
  res.json({ status: "ok", timestamp: new Date().toISOString() });
});

// ================================
// SSE (EVENT STREAM)
// ================================
function sendSSE(res, data) {
  res.write(`data: ${JSON.stringify(data)}\n\n`);
}

// ================================
// FUNCIÓN HELPER: SLEEP
// ================================
function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// ================================
// FUNCIÓN: PROCESAR UN CLIENTE EN AFIP
// ================================
async function procesarClienteAFIP(page, cuit, clave) {
  try {
    console.log(`  → Navegando a login de AFIP...`);
    
    await page.goto('https://auth.afip.gob.ar/contribuyente_/login.xhtml', {
      waitUntil: 'networkidle2',
      timeout: 30000
    });

    await sleep(1000);

    // 2. Ingresar CUIT
    console.log(`  → Ingresando CUIT: ${cuit}`);
    
    await page.waitForXPath('/html/body/main/div/div/div/div/div/div/form/div[1]/input', { timeout: 10000 });
    const inputCuit = await page.$x('/html/body/main/div/div/div/div/div/div/form/div[1]/input');
    
    if (inputCuit.length === 0) throw new Error('No se encontró el campo de CUIT');
    
    await inputCuit[0].click();
    await sleep(300);
    await inputCuit[0].type(cuit, { delay: 100 });

    // 3. Click en Siguiente
    console.log(`  → Click en Siguiente...`);

    const btnSiguiente = await page.$x('/html/body/main/div/div/div/div/div/div/form/input[2]');
    if (btnSiguiente.length === 0) throw new Error('No se encontró el botón Siguiente');
    
    await sleep(500);
    await btnSiguiente[0].click();

    await page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 30000 });

    // 4. Contraseña
    console.log(`  → Ingresando contraseña...`);
    
    await page.waitForSelector('#F1\\:password', { timeout: 10000 });
    await page.click('#F1\\:password');
    await sleep(300);
    await page.type('#F1\\:password', clave, { delay: 100 });

    // 5. Click en Ingresar
    console.log(`  → Click en Ingresar...`);

    const btnIngresar = await page.$x('/html/body/main/div/div/div/div/div/div/form/div/input[2]');
    if (btnIngresar.length === 0) throw new Error('No se encontró el botón Ingresar');

    await sleep(500);
    await btnIngresar[0].click();

    await page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 30000 });

    await sleep(2000);

    // 7. Extraer nombre
    console.log(`  → Extrayendo nombre del contribuyente...`);
    
    await page.waitForXPath('/html/body/div/div/div[1]/header/nav/div/div[1]/div[2]/div/div[1]/div/strong', { timeout: 10000 });
    const nombreElement = await page.$x('/html/body/div/div/div[1]/header/nav/div/div[1]/div[2]/div/div[1]/div/strong');

    if (nombreElement.length === 0) throw new Error('No se encontró el nombre en el dashboard');

    const nombre = await page.evaluate(el => el.textContent.trim(), nombreElement[0]);
    
    console.log(`  ✓ Nombre extraído: ${nombre}`);

    return { success: true, nombre };

  } catch (error) {
    console.error(`  ✗ Error: ${error.message}`);
    return { success: false, error: error.message };
  }
}

// ================================
// RUTA PRINCIPAL: /api/process
// ================================
app.post("/api/process", upload.single("excel"), async (req, res) => {
  console.log("📥 Archivo recibido.");

  if (!req.file) return res.status(400).json({ error: "No se recibió archivo" });

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

    const dataRows = rows.slice(1).filter(row => row.length >= 3);

    console.log(`📊 ${dataRows.length} clientes encontrados`);

    const total = dataRows.length;
    const resultados = [];

    console.log('🚀 Iniciando navegador...');
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
    await page.setViewport({ width: 1920, height: 1080 });

    for (let i = 0; i < dataRows.length; i++) {
      const [CUITraw, CLAVEraw, NUM_CLIENTEraw] = dataRows[i];

      const CUIT = String(CUITraw || '').replace(/\D/g, '');
      const CLAVE = String(CLAVEraw || '').trim();
      const NUM_CLIENTE = String(NUM_CLIENTEraw || '').trim();

      if (!CUIT || !CLAVE || !NUM_CLIENTE) continue;

      sendSSE(res, {
        type: "progress",
        current: i + 1,
        total,
        cuit: CUIT,
        numCliente: NUM_CLIENTE
      });

      const resultado = await procesarClienteAFIP(page, CUIT, CLAVE);

      resultados.push({
        numCliente: NUM_CLIENTE,
        nombre: resultado.success ? resultado.nombre : `ERROR: ${resultado.error}`
      });

      if (i < dataRows.length - 1) await sleep(2000 + Math.random() * 3000);
    }

    await browser.close();

    const datosExcel = [
      ['Num de Cliente', 'Nombre del Cliente'],
      ...resultados.map(r => [r.numCliente, r.nombre])
    ];

    const nuevoWorkbook = XLSX.utils.book_new();
    const nuevaHoja = XLSX.utils.aoa_to_sheet(datosExcel);
    XLSX.utils.book_append_sheet(nuevoWorkbook, nuevaHoja, 'Resultados');

    excelPath = path.join('/tmp', `resultados_${Date.now()}.xlsx`);
    XLSX.writeFile(nuevoWorkbook, excelPath);

    const excelBase64 = fs.readFileSync(excelPath).toString('base64');

    sendSSE(res, {
      type: "complete",
      results: resultados,
      excel: excelBase64,
      filename: `resultados_afip_${new Date().toISOString().split('T')[0]}.xlsx`
    });

    res.end();

    fs.unlinkSync(req.file.path);
    fs.unlinkSync(excelPath);

  } catch (error) {
    console.error("❌ Error general:", error);

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
