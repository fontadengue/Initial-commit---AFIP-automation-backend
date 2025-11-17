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
app.post("/api/process", upload.single("file"), async (req, res) => {
  console.log("📥 Archivo recibido.");

  if (!req.file) {
    console.log("❌ No se recibió archivo.");
    return res.status(400).json({ error: "No se recibió archivo" });
  }

  // Configurar SSE
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.flushHeaders();

  try {
    // Leer Excel
    const workbook = XLSX.readFile(req.file.path);
    const sheet = workbook.Sheets[workbook.SheetNames[0]];
    const rows = XLSX.utils.sheet_to_json(sheet);

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

      const CUIT = row.CUIT || row.cuit || row["cuit"];
      const CLAVE = row.CLAVE || row.clave || row["clave"];

      console.log(`🔎 Procesando CUIT ${CUIT}`);

      // Enviar progreso
      sendSSE(res, {
        type: "progress",
        current: i + 1,
        total,
        cuit: CUIT
      });

      // ================================
      // SIMULACIÓN (remplazá con tu scraping real)
      // ================================
      await new Promise((r) => setTimeout(r, 800));

      results.push({
        cuit: CUIT,
        success: true,
        data: {
          ejemplo: "OK",
        },
      });
    }

    await browser.close();

    // Enviar resultados finales
    sendSSE(res, {
      type: "complete",
      results,
    });

    res.end();

    // Borrar archivo subido
    fs.unlinkSync(req.file.path);

  } catch (error) {
    console.error("❌ Error:", error);

    sendSSE(res, {
      type: "error",
      message: error.message,
    });

    res.end();
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
