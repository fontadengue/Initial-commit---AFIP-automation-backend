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
app.post("/api/process", upload.single("file"), async (req, res) => {
  console.log("📥 Archivo recibido.");

  if (!req.file) {
    console.log("❌ No se recibió archivo.");
    return res.status(400).json({ error: "No se recibió archivo" });
  }

  // SSE Response
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.flushHeaders();

  try {
    // Leer Excel
    const workbook = XLSX.readFile(req.file.path);
    const sheet = workbook.Sheets[workbook.SheetNames[0]];
    const rows = XLSX.utils.sheet_to_json(sheet); // CUIT y clave

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

    for (let i = 0; i < rows.length; i++) {
      const { CUIT, CLAVE } = rows[i];

      // ENVIAR PROGRESO AL FRONTEND
      res.write(
        `data: ${JSON.stringify({
          type: "progress",
          current: i + 1,
          total,
          cuit: CUIT
        })}\n\n`
      );

      // Aquí va tu lógica de scraping
      // await loginAfip(page, CUIT, CLAVE);
      // const data = await scrapeAfip(page);

      // Por ahora simulo datos
      await new Promise((r) => setTimeout(r, 800));
      results.push({ cuit: CUIT, success: true, data: { ejemplo: true } });
    }

    await browser.close();

    // ENVIAR TERMINADO
    res.write(
      `data: ${JSON.stringify({
        type: "complete",
        results
      })}\n\n`
    );

    res.end();

    fs.unlinkSync(req.file.path);

  } catch (error) {
    console.error("❌ Error:", error);

    res.write(
      `data: ${JSON.stringify({
        type: "error",
        message: error.message
      })}\n\n`
    );

    res.end();
  }
});

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
