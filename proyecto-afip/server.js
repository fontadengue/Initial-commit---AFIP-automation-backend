const express = require("express");
const cors = require("cors");
const multer = require("multer");
const XLSX = require("xlsx");
const fs = require("fs");
const puppeteer = require("puppeteer");

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
// RUTA PRINCIPAL: /api/process
// ================================
app.post("/api/process", upload.single("excel"), async (req, res) => {
  // ☝️ CAMBIADO DE "file" A "excel"
  
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

  try {
    // Leer Excel
    const workbook = XLSX.readFile(req.file.path);
    const sheet = workbook.Sheets[workbook.SheetNames[0]];
    const rows = XLSX.utils.sheet_to_json(sheet, { range: 1 }); // Saltar primera fila

    console.log(`📊 ${rows.length} filas encontradas`);

    const total = rows.length;
    const results = [];

    // Lanzar Puppeteer
    const browser = await puppeteer.launch({
      headless: true,
      args: [
        "--no-sandbox",
        "--disable-setuid-sandbox",
        "--disable-gpu",
        "--no-zygote",
        "--single-process"
      ],
      executablePath: "/usr/bin/chromium"
    });

    const page = await browser.newPage();

    // Procesar fila por fila
    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];

      // Buscar CUIT y CLAVE en diferentes formatos posibles
      const CUIT = row.CUIT || row.cuit || row["CUIT"] || row["cuit"] || Object.values(row)[0];
      const CLAVE = row.CLAVE || row.clave || row["CLAVE"] || row["clave"] || Object.values(row)[1];

      console.log(`🔎 [${i + 1}/${total}] Procesando CUIT ${CUIT}`);

      // Enviar progreso
      sendSSE(res, {
        type: "progress",
        current: i + 1,
        total,
        cuit: CUIT
      });

      try {
        // ================================
        // AQUÍ VA TU LÓGICA DE SCRAPING REAL
        // ================================
        
        // Por ahora simulación
        await new Promise((r) => setTimeout(r, 800));

        results.push({
          cuit: CUIT,
          success: true,
          data: {
            timestamp: new Date().toISOString(),
            mensaje: "Datos extraídos correctamente (simulación)"
          },
        });

      } catch (error) {
        console.error(`❌ Error procesando ${CUIT}:`, error.message);
        results.push({
          cuit: CUIT,
          success: false,
          error: error.message
        });
      }
    }

    await browser.close();

    // Enviar resultados finales
    console.log(`✅ Proceso completado: ${results.filter(r => r.success).length}/${total} exitosos`);
    
    sendSSE(res, {
      type: "complete",
      results,
    });

    res.end();

    // Borrar archivo subido
    fs.unlinkSync(req.file.path);

  } catch (error) {
    console.error("❌ Error general:", error);

    sendSSE(res, {
      type: "error",
      message: error.message,
    });

    res.end();
    
    // Borrar archivo si existe
    if (req.file && fs.existsSync(req.file.path)) {
      fs.unlinkSync(req.file.path);
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
  console.log(`🔧 Ambiente: production (Render)`);
  console.log(`✅ Listo para recibir requests`);
});
