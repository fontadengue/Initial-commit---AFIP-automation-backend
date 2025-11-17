const express = require('express');
const multer = require('multer');
const xlsx = require('xlsx');
const cors = require('cors');
const { procesarClienteAFIP } = require('./scraper');

const app = express();

// Configuración de multer para manejar archivos en memoria
const upload = multer({ 
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 5 * 1024 * 1024 // Límite de 5MB
  }
});

// Configuración de CORS
const corsOptions = {
  origin: process.env.FRONTEND_URL || '*',
  methods: ['GET', 'POST'],
  credentials: true
};

app.use(cors(corsOptions));
app.use(express.json());

// Middleware para logging
app.use((req, res, next) => {
  console.log(`[${new Date().toISOString()}] ${req.method} ${req.path}`);
  next();
});

// ============================================
// ENDPOINT PRINCIPAL: Procesar Excel
// ============================================
app.post('/api/process', upload.single('excel'), async (req, res) => {
  const startTime = Date.now();
  
  try {
    // Validar que se recibió un archivo
    if (!req.file) {
      console.error('❌ No se recibió archivo');
      return res.status(400).json({ 
        error: 'No se recibió archivo Excel' 
      });
    }

    console.log(`📁 Archivo recibido: ${req.file.originalname} (${req.file.size} bytes)`);

    // Validar extensión
    const filename = req.file.originalname.toLowerCase();
    if (!filename.endsWith('.xlsx') && !filename.endsWith('.xls')) {
      console.error('❌ Formato de archivo inválido');
      return res.status(400).json({ 
        error: 'El archivo debe ser .xlsx o .xls' 
      });
    }

    // Leer archivo Excel
    let workbook;
    try {
      workbook = xlsx.read(req.file.buffer, { type: 'buffer' });
    } catch (error) {
      console.error('❌ Error leyendo Excel:', error.message);
      return res.status(400).json({ 
        error: 'No se pudo leer el archivo Excel. Verifica que no esté corrupto.' 
      });
    }

    // Obtener primera hoja
    const sheetName = workbook.SheetNames[0];
    const worksheet = workbook.Sheets[sheetName];
    
    // Convertir a JSON (ignorando primera fila como headers)
    const data = xlsx.utils.sheet_to_json(worksheet, { 
      header: ['cuit', 'clave'],
      range: 1, // Salta la primera fila
      raw: false // Convierte todo a string
    });

    console.log(`📊 Datos leídos del Excel: ${data.length} filas`);

    // Validar y limpiar datos
    const clientes = data
      .filter(row => row.cuit && row.clave) // Solo filas con ambos datos
      .map(row => ({
        cuit: String(row.cuit).trim().replace(/\D/g, ''), // Solo números
        clave: String(row.clave).trim()
      }))
      .filter(row => row.cuit.length >= 11); // CUIT válido

    if (clientes.length === 0) {
      console.error('❌ No se encontraron datos válidos');
      return res.status(400).json({ 
        error: 'No se encontraron datos válidos en el Excel. Verifica el formato: Columna A = CUIT, Columna B = Clave' 
      });
    }

    console.log(`✅ ${clientes.length} clientes válidos para procesar`);
    console.log(`🚀 Iniciando procesamiento...`);

    // Configurar respuesta como Server-Sent Events (SSE)
    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
      'X-Accel-Buffering': 'no' // Desactivar buffering en nginx
    });

    // Enviar un comentario inicial para mantener la conexión
    res.write(': Conexión establecida\n\n');

    const resultados = [];
    let clienteActual = 0;
    let exitosos = 0;
    let fallidos = 0;

    // Procesar cada cliente secuencialmente
    for (const cliente of clientes) {
      clienteActual++;
      
      console.log(`\n${'='.repeat(60)}`);
      console.log(`📋 [${clienteActual}/${clientes.length}] Procesando CUIT: ${cliente.cuit}`);
      console.log(`${'='.repeat(60)}`);

      // Enviar progreso al frontend
      res.write(`data: ${JSON.stringify({
        type: 'progress',
        current: clienteActual,
        total: clientes.length,
        cuit: cliente.cuit,
        exitosos,
        fallidos
      })}\n\n`);

      try {
        // Llamar al scraper de Puppeteer
        const resultado = await procesarClienteAFIP(cliente.cuit, cliente.clave);
        
        resultados.push({
          cuit: cliente.cuit,
          success: true,
          data: resultado,
          timestamp: new Date().toISOString()
        });

        exitosos++;
        console.log(`✅ [${clienteActual}/${clientes.length}] Completado exitosamente`);

      } catch (error) {
        console.error(`❌ [${clienteActual}/${clientes.length}] Error:`, error.message);
        
        resultados.push({
          cuit: cliente.cuit,
          success: false,
          error: error.message,
          timestamp: new Date().toISOString()
        });

        fallidos++;
      }

      // Espera aleatoria entre clientes (2-5 segundos) 
      // para simular comportamiento humano y evitar rate limiting
      if (clienteActual < clientes.length) {
        const minDelay = parseInt(process.env.MIN_DELAY_BETWEEN_CLIENTS) || 2000;
        const maxDelay = parseInt(process.env.MAX_DELAY_BETWEEN_CLIENTS) || 5000;
        const espera = Math.floor(Math.random() * (maxDelay - minDelay)) + minDelay;
        
        console.log(`⏳ Esperando ${(espera/1000).toFixed(1)}s antes del siguiente cliente...`);
        await new Promise(resolve => setTimeout(resolve, espera));
      }
    }

    // Calcular estadísticas finales
    const endTime = Date.now();
    const totalTime = ((endTime - startTime) / 1000).toFixed(2);
    const avgTime = (totalTime / clientes.length).toFixed(2);

    console.log(`\n${'='.repeat(60)}`);
    console.log(`✨ PROCESO COMPLETADO`);
    console.log(`${'='.repeat(60)}`);
    console.log(`📊 Estadísticas:`);
    console.log(`   Total clientes: ${clientes.length}`);
    console.log(`   ✅ Exitosos: ${exitosos}`);
    console.log(`   ❌ Fallidos: ${fallidos}`);
    console.log(`   ⏱️  Tiempo total: ${totalTime}s`);
    console.log(`   ⚡ Tiempo promedio: ${avgTime}s por cliente`);
    console.log(`${'='.repeat(60)}\n`);

    // Enviar resultados finales
    res.write(`data: ${JSON.stringify({
      type: 'complete',
      results: resultados,
      stats: {
        total: clientes.length,
        exitosos,
        fallidos,
        tiempoTotal: totalTime,
        tiempoPromedio: avgTime
      }
    })}\n\n`);

    // Finalizar conexión SSE
    res.end();

  } catch (error) {
    console.error('💥 Error general en el servidor:', error);
    
    // Si ya empezamos a enviar SSE, enviar error por ese canal
    if (res.headersSent) {
      res.write(`data: ${JSON.stringify({
        type: 'error',
        error: error.message
      })}\n\n`);
      res.end();
    } else {
      // Si no, enviar error JSON normal
      res.status(500).json({ 
        error: error.message,
        stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
      });
    }
  }
});

// ============================================
// ENDPOINT: Health Check
// ============================================
app.get('/health', (req, res) => {
  res.json({ 
    status: 'ok',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    memory: process.memoryUsage(),
    environment: process.env.NODE_ENV || 'development'
  });
});

// ============================================
// ENDPOINT: Información del sistema
// ============================================
app.get('/', (req, res) => {
  res.json({
    name: 'AFIP Automation Backend',
    version: '1.0.0',
    endpoints: {
      health: 'GET /health',
      process: 'POST /api/process'
    },
    status: 'running'
  });
});

// ============================================
// Manejo de errores 404
// ============================================
app.use((req, res) => {
  res.status(404).json({ 
    error: 'Endpoint no encontrado',
    path: req.path 
  });
});

// ============================================
// Manejo de errores generales
// ============================================
app.use((error, req, res, next) => {
  console.error('Error no manejado:', error);
  res.status(500).json({ 
    error: 'Error interno del servidor',
    message: error.message,
    stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
  });
});

// ============================================
// Iniciar servidor
// ============================================
const PORT = process.env.PORT || 3000;
const server = app.listen(PORT, () => {
  console.log(`
╔════════════════════════════════════════════╗
║   🚀 SERVIDOR INICIADO                    ║
╚════════════════════════════════════════════╝

📍 Puerto: ${PORT}
🌍 URL: http://localhost:${PORT}
🏥 Health: http://localhost:${PORT}/health
📊 API: http://localhost:${PORT}/api/process
🔧 Ambiente: ${process.env.NODE_ENV || 'development'}

✅ Listo para recibir requests
  `);
});

// Manejo de cierre graceful
process.on('SIGTERM', () => {
  console.log('⚠️  SIGTERM recibido. Cerrando servidor...');
  server.close(() => {
    console.log('✓ Servidor cerrado correctamente');
    process.exit(0);
  });
});

process.on('SIGINT', () => {
  console.log('\n⚠️  SIGINT recibido. Cerrando servidor...');
  server.close(() => {
    console.log('✓ Servidor cerrado correctamente');
    process.exit(0);
  });
});

module.exports = app;