const express = require("express");
const cors = require("cors");
const multer = require("multer");
const XLSX = require("xlsx");
const fs = require("fs");
const path = require("path");
const { v4: uuidv4 } = require("uuid");
const puppeteer = require("puppeteer");

const app = express();

// ================================
// CORS
// ================================
app.use(cors());
app.use(express.json());

// ================================
// MULTER (SUBIDA DE EXCEL)
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
function sendSSE(res, event, data) {
  res.write(`event: ${event}\n`);
  res.write(`data: ${JSON.stringify(data)}\n\n`);
}

// ================================
// PROCESAR EXCEL
// ================================
app.post("/api/process", upload.single("excel"), async (req, res) => {
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
    sendSSE(res, "status", { message: "Leyendo archivo Excel..." });

    const workbook = XLSX.readFile(req.file.path);
    const sheet = workbook.Sheets[workbook.SheetNames[0]];
    const rows = XLSX.utils.sheet_to_json(sheet);

    sendSSE(res, "status", { message: "Lanzando navegador..." });

    // ================================
    // CONFIGURACIÓN DE PUPPETEER PARA RENDER
    // ================================
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

    // Procesar filas una por una
    for (let i = 0; i < rows.length; i++) {
      sendSSE(res, "status", { message: `Procesando fila ${i + 1}...` });

      // Tu lógica de scraping acá:
      // await page.goto("https://...");

      await new Promise(r => setTimeout(r, 500)); // Simulación
    }

    sendSSE(res, "done", { message: "Procesamiento finalizado." });

    await browser.close();

    // Fin del stream
    res.end();

    // Borrar archivo temporal
    fs.unlinkSync(req.file.path);

  } catch (error) {
    console.error("❌ Error procesando:", error);

    try {
      sendSSE(res, "error", { message: error.message });
    } catch (_) {}

    res.end();
  }
});

// ================================
// SERVIDOR — FIX PARA RENDER (PORT DINÁMICO)
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
