/**
 * Script de prueba para testing local del scraper
 * 
 * USO:
 * node test.js TU_CUIT TU_CLAVE
 * 
 * Ejemplo:
 * node test.js 20345678901 MiClave123
 */

const { procesarClienteAFIP } = require('./scraper');

// Colores para consola
const colors = {
  reset: '\x1b[0m',
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m'
};

async function test() {
  console.log(`${colors.cyan}
╔════════════════════════════════════════════╗
║   TEST DE AUTOMATIZACIÓN AFIP/ARCA        ║
╚════════════════════════════════════════════╝
${colors.reset}`);

  // Obtener credenciales de argumentos o variables de entorno
  const cuit = process.argv[2] || process.env.TEST_CUIT;
  const clave = process.argv[3] || process.env.TEST_CLAVE;

  if (!cuit || !clave) {
    console.error(`${colors.red}
❌ ERROR: Debes proporcionar CUIT y clave

USO:
  node test.js CUIT CLAVE

EJEMPLO:
  node test.js 20345678901 MiClave123

O configurar variables de entorno:
  export TEST_CUIT=20345678901
  export TEST_CLAVE=MiClave123
  node test.js
${colors.reset}`);
    process.exit(1);
  }

  console.log(`${colors.blue}📊 Datos de prueba:${colors.reset}`);
  console.log(`   CUIT: ${cuit}`);
  console.log(`   Clave: ${'*'.repeat(clave.length)}`);
  console.log('');

  const startTime = Date.now();

  try {
    console.log(`${colors.yellow}🚀 Iniciando procesamiento...${colors.reset}\n`);
    
    const resultado = await procesarClienteAFIP(cuit, clave);
    
    const endTime = Date.now();
    const duration = ((endTime - startTime) / 1000).toFixed(2);

    console.log(`\n${colors.green}
╔════════════════════════════════════════════╗
║   ✓ PRUEBA EXITOSA                        ║
╚════════════════════════════════════════════╝
${colors.reset}`);

    console.log(`${colors.cyan}📋 Resultado:${colors.reset}`);
    console.log(JSON.stringify(resultado, null, 2));
    
    console.log(`\n${colors.blue}⏱️  Tiempo total: ${duration}s${colors.reset}`);
    
    console.log(`\n${colors.green}✓ Test completado exitosamente${colors.reset}\n`);
    
    process.exit(0);

  } catch (error) {
    const endTime = Date.now();
    const duration = ((endTime - startTime) / 1000).toFixed(2);

    console.error(`\n${colors.red}
╔════════════════════════════════════════════╗
║   ✗ PRUEBA FALLIDA                        ║
╚════════════════════════════════════════════╝
${colors.reset}`);

    console.error(`${colors.red}❌ Error: ${error.message}${colors.reset}`);
    
    if (error.stack) {
      console.error(`\n${colors.yellow}Stack trace:${colors.reset}`);
      console.error(error.stack);
    }
    
    console.log(`\n${colors.blue}⏱️  Tiempo hasta el error: ${duration}s${colors.reset}`);
    
    console.log(`\n${colors.yellow}
💡 Posibles causas:
   1. Credenciales incorrectas
   2. AFIP cambió su estructura
   3. Problema de conexión
   4. Timeout (intenta aumentar PUPPETEER_TIMEOUT)
   
🔍 Revisa:
   - El archivo error_${cuit}_*.png (si se generó)
   - Los logs arriba para más detalles
${colors.reset}\n`);
    
    process.exit(1);
  }
}

// Manejar Ctrl+C
process.on('SIGINT', () => {
  console.log(`\n${colors.yellow}⚠️  Proceso interrumpido por el usuario${colors.reset}\n`);
  process.exit(0);
});

// Manejar errores no capturados
process.on('unhandledRejection', (error) => {
  console.error(`${colors.red}❌ Error no manejado:${colors.reset}`, error);
  process.exit(1);
});

// Ejecutar test
test();