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
// FUNCIÓN: PROCESAR UN CLIENTE EN AFIP
// ================================
async function procesarClienteAFIP(page, cuit, clave) {
  try {
    console.log(`  → Navegando a login de AFIP...`);
    
    // 1. IR A LA PÁGINA DE LOGIN
    await page.goto('https://auth.afip.gob.ar/contribuyente_/login.xhtml', {
      waitUntil: 'networkidle2',
      timeout: 30000
    });

    await page.waitForTimeout(1000);

    // 2. INGRESAR CUIT
    console.log(`  → Ingresando CUIT: ${cuit}`);
    
    await page.waitForXPath('/html/body/main/div/div/div/div/div/div/form/div[1]/input', { timeout: 10000 });
    const inputCuit = await page.$x('/html/body/main/div/div/div/div/div/div/form/div[1]/input');
    
    if (inputCuit.length === 0) {
      throw new Error('No se encontró el campo de CUIT');
    }
    
    await inputCuit[0].click();
    await page.waitForTimeout(300);
    await inputCuit[0].type(cuit, { delay: 100 });

    // 3. CLICK EN SIGUIENTE
    console.log(`  → Click en Siguiente...`);
    
    await page.waitForTimeout(500);
    const btnSiguiente = await page.$x('/html/body/main/div/div/div/div/div/div/form/input[2]');
    
    if (btnSiguiente.length === 0) {
      throw new Error('No se encontró el botón Siguiente');
    }
    
    await btnSiguiente[0].click();
    await page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 30000 });

    // 4. INGRESAR CONTRASEÑA
    console.log(`  → Ingresando contraseña...`);
    
    await page.waitForSelector('#F1\\:password', { timeout: 10000 });
    await page.click('#F1\\:password');
    await page.waitForTimeout(300);
    await page.type('#F1\\:password', clave, { delay: 100 });

    // 5. CLICK EN INGRESAR
    console.log(`  → Click en Ingresar...`);
    
    await page.waitForTimeout(500);
    const btnIngresar = await page.$x('/html/body/main/div/div/div/div/div/div/form/div/input[2]');
    
    if (btnIngresar.length === 0) {
      throw new Error('No se encontró el botón Ingresar');
    }
    
    await btnIngresar[0].click();
    await page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 30000 });

    // 6. ESPERAR A QUE CARGUE EL DASHBOARD
    await page.waitForTimeout(2000);

    // 7. EXTRAER EL NOMBRE DEL CONTRIBUYENTE
    console.log(`  → Extrayendo nombre del contribuyente...`);
    
    await page.waitForXPath('/html/body/div/div/div[1]/header/nav/div/div[1]/div[2]/div/div[1]/div/strong', { timeout: 10000 });
    const nombreElement = await page.$x('/html/body/div/div/div[1]/header/nav/div/div[1]/div[2]/div/div[1]/div/strong');
    
    if (nombreElement.length === 0) {
      throw new Error('No se encontró el nombre del contribuyente en el dashboard');
    }
    
    const nombre = await page.evaluate(el => el.textContent.trim(), nombreElement[0]);
    
    console.log(`  ✓ Nombre extraído: ${nombre}`);

    return {
      success: true,
      nombre: nombre
    };

  } catch (error) {
    console.error(`  ✗ Error: ${error.message}`);
    return {
      success: false,
      error: error.message
    };
  }
}

// ================================
// RUTA PRINCIPAL: /api/process
// ================================
app.post("/api/process", upload.single("excel"), async (req, res) => {
  console.log("📥 Archivo recibido.");

  if (!req.file) {
    console.log("❌ No se recibió archivo.");
    return res.status(400).json({ error: "No se recibió archivo" });
  }

  console.log(`📁 Archivo: ${req.file.originalname} (${req.file.size} bytes)`);

  // Configurar SSE
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.flushHeaders();

  let browser = null;
  let excelPath = null;

  try {
    // Leer Excel de entrada
    const workbook = XLSX.readFile(req.file.path);
    const sheet = workbook.Sheets[workbook.SheetNames[0]];
    const rows = XLSX.utils.sheet_to_json(sheet, { header: 1 }); // Leer como array de arrays

    // Saltar primera fila si son headers
    const dataRows = rows.slice(1).filter(row => row.length >= 3);

    console.log(`📊 ${dataRows.length} clientes encontrados`);

    if (dataRows.length === 0) {
      throw new Error('No se encontraron datos válidos en el Excel');
    }

    const total = dataRows.length;
    const resultados = [];

    // Lanzar Puppeteer UNA SOLA VEZ
    console.log('🚀 Iniciando navegador...');
    browser = await puppeteer.launch({
      headless: true,
      args: [
        "--no-sandbox",
        "--disable-setuid-sandbox",
        "--disable-gpu",
        "--disable-dev-shm-usage",
        "--no-zygote",
        "--single-process"
      ],
      executablePath: "/usr/bin/chromium"
    });

    const page = await browser.newPage();
    await page.setViewport({ width: 1920, height: 1080 });
    await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');

    // Procesar cada cliente
    for (let i = 0; i < dataRows.length; i++) {
      const row = dataRows[i];
      
      const CUIT = String(row[0] || '').trim().replace(/\D/g, ''); // Columna A
      const CLAVE = String(row[1] || '').trim(); // Columna B
      const NUM_CLIENTE = String(row[2] || '').trim(); // Columna C

      if (!CUIT || !CLAVE || !NUM_CLIENTE) {
        console.log(`⚠️  [${i + 1}/${total}] Fila incompleta, saltando...`);
        continue;
      }

      console.log(`\n${'='.repeat(60)}`);
      console.log(`🔎 [${i + 1}/${total}] Cliente: ${NUM_CLIENTE} - CUIT: ${CUIT}`);
      console.log(`${'='.repeat(60)}`);

      // Enviar progreso al frontend
      sendSSE(res, {
        type: "progress",
        current: i + 1,
        total,
        cuit: CUIT,
        numCliente: NUM_CLIENTE
      });

      // Procesar cliente en AFIP
      const resultado = await procesarClienteAFIP(page, CUIT, CLAVE);

      if (resultado.success) {
        resultados.push({
          numCliente: NUM_CLIENTE,
          nombre: resultado.nombre
        });
        console.log(`✅ [${i + 1}/${total}] Procesado exitosamente`);
      } else {
        resultados.push({
          numCliente: NUM_CLIENTE,
          nombre: `ERROR: ${resultado.error}`
        });
        console.log(`❌ [${i + 1}/${total}] Error al procesar`);
      }

      // Espera entre clientes para simular comportamiento humano
      if (i < dataRows.length - 1) {
        const espera = 2000 + Math.random() * 3000;
        console.log(`⏳ Esperando ${(espera / 1000).toFixed(1)}s...`);
        await page.waitForTimeout(espera);
      }
    }

    await browser.close();
    browser = null;

    console.log(`\n✨ Proceso completado. Generando Excel...`);

    // ================================
    // CREAR EXCEL DE SALIDA
    // ================================
    const datosExcel = [
      ['Num de Cliente', 'Nombre del Cliente'], // Headers
      ...resultados.map(r => [r.numCliente, r.nombre])
    ];

    const nuevoWorkbook = XLSX.utils.book_new();
    const nuevaHoja = XLSX.utils.aoa_to_sheet(datosExcel);
    XLSX.utils.book_append_sheet(nuevoWorkbook, nuevaHoja, 'Resultados');

    // Guardar Excel en /tmp
    excelPath = path.join('/tmp', `resultados_${Date.now()}.xlsx`);
    XLSX.writeFile(nuevoWorkbook, excelPath);

    console.log(`📊 Excel generado: ${excelPath}`);

    // Leer archivo como base64
    const excelBuffer = fs.readFileSync(excelPath);
    const excelBase64 = excelBuffer.toString('base64');

    // Enviar resultado final con el Excel
    sendSSE(res, {
      type: "complete",
      results: resultados,
      excel: excelBase64,
      filename: `resultados_afip_${new Date().toISOString().split('T')[0]}.xlsx`
    });

    res.end();

    // Limpiar archivos
    fs.unlinkSync(req.file.path);
    fs.unlinkSync(excelPath);

    console.log(`✅ Archivos temporales eliminados`);

  } catch (error) {
    console.error("❌ Error general:", error);

    sendSSE(res, {
      type: "error",
      message: error.message,
    });

    res.end();
    
    // Limpiar recursos
    if (browser) {
      await browser.close();
    }
    if (req.file && fs.existsSync(req.file.path)) {
      fs.unlinkSync(req.file.path);
    }
    if (excelPath && fs.existsSync(excelPath)) {
      fs.unlinkSync(excelPath);
    }
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
  console.log(`✅ Listo para recibir requests`);
});
