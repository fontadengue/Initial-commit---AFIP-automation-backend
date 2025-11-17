const puppeteer = require('puppeteer');

/**
 * Función principal para procesar un cliente en AFIP/ARCA
 * @param {string} cuit - CUIT del cliente
 * @param {string} clave - Clave de acceso
 * @returns {Object} - Datos extraídos
 */
async function procesarClienteAFIP(cuit, clave) {
  let browser = null;
  
  try {
    // Configuración del navegador
    browser = await puppeteer.launch({
      headless: process.env.PUPPETEER_HEADLESS !== 'false', // Cambiar a false para debugging
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-accelerated-2d-canvas',
        '--disable-gpu',
        '--window-size=1920,1080',
        '--disable-blink-features=AutomationControlled'
      ]
    });

    const page = await browser.newPage();
    
    // Configurar viewport y user agent
    await page.setViewport({ width: 1920, height: 1080 });
    await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');
    
    // Ocultar que es un bot
    await page.evaluateOnNewDocument(() => {
      Object.defineProperty(navigator, 'webdriver', {
        get: () => undefined
      });
      Object.defineProperty(navigator, 'plugins', {
        get: () => [1, 2, 3, 4, 5]
      });
      Object.defineProperty(navigator, 'languages', {
        get: () => ['es-AR', 'es', 'en']
      });
    });

    console.log(`[${cuit}] Navegando a AFIP...`);

    // ============================================
    // PASO 1: NAVEGAR A LA PÁGINA DE LOGIN
    // ============================================
    await page.goto('https://auth.afip.gob.ar/contribuyente_/login.xhtml', {
      waitUntil: 'networkidle2',
      timeout: 30000
    });

    console.log(`[${cuit}] Página de login cargada`);

    // Esperar un momento para simular comportamiento humano
    await sleep(1000 + Math.random() * 1000);

    // ============================================
    // PASO 2: INGRESAR CUIT
    // ============================================
    console.log(`[${cuit}] Ingresando CUIT...`);
    
    await page.waitForSelector('#F1\\:username', { timeout: 10000 });
    
    // Tipear con delay aleatorio para simular humano
    await page.click('#F1\\:username');
    await sleep(300);
    await page.type('#F1\\:username', cuit, { delay: 50 + Math.random() * 50 });

    await sleep(500 + Math.random() * 500);

    // Click en "Siguiente"
    await page.click('#F1\\:btnSiguiente');
    
    console.log(`[${cuit}] CUIT ingresado, esperando página de contraseña...`);
    
    // Esperar a que cargue la página de contraseña
    await page.waitForNavigation({ 
      waitUntil: 'networkidle2',
      timeout: 30000
    });

    // ============================================
    // PASO 3: INGRESAR CONTRASEÑA
    // ============================================
    console.log(`[${cuit}] Ingresando contraseña...`);
    
    await page.waitForSelector('#F1\\:password', { timeout: 10000 });
    await page.click('#F1\\:password');
    await sleep(300);
    await page.type('#F1\\:password', clave, { delay: 50 + Math.random() * 50 });

    await sleep(500 + Math.random() * 500);

    // Click en "Ingresar"
    await page.click('#F1\\:btnIngresar');
    
    console.log(`[${cuit}] Contraseña ingresada, esperando dashboard...`);
    
    // Esperar a que cargue el dashboard
    await page.waitForNavigation({ 
      waitUntil: 'networkidle2', 
      timeout: 30000 
    });

    // Esperar un poco más para asegurar que todo cargó
    await sleep(2000);

    // ============================================
    // PASO 4: VERIFICAR LOGIN EXITOSO
    // ============================================
    const loginExitoso = await verificarLoginExitoso(page);
    
    if (!loginExitoso) {
      // Tomar screenshot para debugging
      try {
        await page.screenshot({ 
          path: `error_login_${cuit}_${Date.now()}.png`,
          fullPage: true 
        });
      } catch (e) {
        console.error(`[${cuit}] No se pudo tomar screenshot:`, e.message);
      }
      
      throw new Error('Login fallido - Verificar credenciales');
    }

    console.log(`[${cuit}] ✓ Login exitoso`);

    // ============================================
    // PASO 5: NAVEGAR A LA SECCIÓN ESPECÍFICA
    // ============================================
    // AQUÍ ES DONDE VAS A INDICARME QUÉ HACER
    // Por ahora dejo placeholders comentados con ejemplos
    
    console.log(`[${cuit}] Navegando a sección objetivo...`);
    
    // Ejemplo 1: Si necesitas ir a una URL específica
    // await page.goto('https://auth.afip.gob.ar/contribuyente/admin/administrar.xhtml', {
    //   waitUntil: 'networkidle2'
    // });
    
    // Ejemplo 2: Si necesitas hacer click en un menú
    // await page.click('a[href*="padron"]');
    // await page.waitForSelector('.datos-contribuyente');
    
    // Ejemplo 3: Si necesitas esperar que cargue algo específico
    // await page.waitForSelector('#datosGenerales', { timeout: 10000 });

    await sleep(2000); // Espera de seguridad

    // ============================================
    // PASO 6: EXTRAER DATOS
    // ============================================
    // AQUÍ EXTRAEREMOS LOS DATOS QUE ME INDIQUES
    
    console.log(`[${cuit}] Extrayendo datos...`);
    
    const datosExtraidos = await extraerDatos(page, cuit);

    console.log(`[${cuit}] ✓ Datos extraídos exitosamente`);

    return datosExtraidos;

  } catch (error) {
    console.error(`[${cuit}] ✗ Error:`, error.message);
    
    // Intentar tomar screenshot del error si el browser sigue vivo
    try {
      if (browser) {
        const pages = await browser.pages();
        if (pages.length > 0) {
          await pages[0].screenshot({ 
            path: `error_${cuit}_${Date.now()}.png`,
            fullPage: true 
          });
        }
      }
    } catch (e) {
      // Ignorar errores al tomar screenshot
    }
    
    throw error;
    
  } finally {
    if (browser) {
      await browser.close();
      console.log(`[${cuit}] Navegador cerrado`);
    }
  }
}

/**
 * Verifica si el login fue exitoso
 */
async function verificarLoginExitoso(page) {
  try {
    const urlActual = page.url();
    console.log(`URL después del login: ${urlActual}`);
    
    // Verificación 1: La URL no debe contener "login" o "error"
    if (urlActual.includes('login') || urlActual.includes('error')) {
      return false;
    }
    
    // Verificación 2: Buscar elementos que indican login exitoso
    // Ajusta estos selectores según la página real de AFIP
    const elementosExitosos = [
      'a[href*="logout"]',
      '.usuario-logueado',
      '#menu-principal',
      'a[title*="Salir"]',
      '.navbar-user'
    ];
    
    for (const selector of elementosExitosos) {
      const elemento = await page.$(selector);
      if (elemento) {
        console.log(`Login verificado con selector: ${selector}`);
        return true;
      }
    }
    
    // Verificación 3: Buscar mensajes de error
    const mensajesError = await page.evaluate(() => {
      const errores = [];
      const posiblesErrores = [
        '.error-message',
        '.alert-danger',
        '.mensaje-error',
        '[class*="error"]'
      ];
      
      posiblesErrores.forEach(selector => {
        const elementos = document.querySelectorAll(selector);
        elementos.forEach(el => {
          if (el.textContent.trim().length > 0) {
            errores.push(el.textContent.trim());
          }
        });
      });
      
      return errores;
    });
    
    if (mensajesError.length > 0) {
      console.log(`Mensajes de error encontrados: ${mensajesError.join(', ')}`);
      return false;
    }
    
    // Si llegamos aquí y la URL cambió, asumimos que el login fue exitoso
    return !urlActual.includes('login');
    
  } catch (error) {
    console.error('Error verificando login:', error.message);
    return false;
  }
}

/**
 * Función para extraer datos de la página
 * ESTA FUNCIÓN LA COMPLETAREMOS CUANDO ME DIGAS QUÉ EXTRAER
 */
async function extraerDatos(page, cuit) {
  try {
    // ============================================
    // AQUÍ IRÁN LAS INSTRUCCIONES DE EXTRACCIÓN
    // ============================================
    
    // Esperar a que la página esté completamente cargada
    await page.waitForTimeout(1000);
    
    // EJEMPLOS COMENTADOS - Descomenta y adapta según necesites:
    
    // Ejemplo 1: Extraer datos generales de contribuyente
    // const datosGenerales = await page.evaluate(() => {
    //   return {
    //     razonSocial: document.querySelector('#razonSocial')?.textContent.trim(),
    //     estado: document.querySelector('#estado')?.textContent.trim(),
    //     categoria: document.querySelector('#categoria')?.textContent.trim()
    //   };
    // });
    
    // Ejemplo 2: Extraer una tabla
    // const tabla = await page.$$eval('table.datos tr', rows => {
    //   return rows.map(row => {
    //     const cells = row.querySelectorAll('td');
    //     return {
    //       campo1: cells[0]?.textContent.trim(),
    //       campo2: cells[1]?.textContent.trim(),
    //       campo3: cells[2]?.textContent.trim()
    //     };
    //   });
    // });
    
    // Ejemplo 3: Extraer lista de elementos
    // const lista = await page.$$eval('.item', items => {
    //   return items.map(item => item.textContent.trim());
    // });
    
    // Ejemplo 4: Hacer click y extraer de modal/popup
    // await page.click('button.ver-detalle');
    // await page.waitForSelector('.modal-detalle');
    // const detalle = await page.$eval('.modal-detalle', el => el.textContent);
    
    // Por ahora retorno un objeto de ejemplo con timestamp
    const datosExtraidos = {
      cuit: cuit,
      timestamp: new Date().toISOString(),
      url_actual: page.url(),
      mensaje: 'Estructura lista - Esperando instrucciones de extracción',
      
      // AQUÍ AGREGAREMOS LOS DATOS REALES:
      // ejemplo_dato1: null,
      // ejemplo_dato2: null,
      // ejemplo_tabla: [],
      // ejemplo_lista: []
    };
    
    // También podemos extraer el HTML completo para análisis
    // (útil para debugging y ver qué hay disponible)
    // const htmlCompleto = await page.content();
    // console.log('HTML disponible:', htmlCompleto.substring(0, 500));
    
    return datosExtraidos;

  } catch (error) {
    console.error(`[${cuit}] Error extrayendo datos:`, error.message);
    throw new Error(`Error en extracción de datos: ${error.message}`);
  }
}

/**
 * Utilidad para esperar un tiempo (simular comportamiento humano)
 * @param {number} ms - Milisegundos a esperar
 */
function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Función auxiliar para hacer scroll en la página
 */
async function scrollPage(page) {
  await page.evaluate(() => {
    window.scrollBy(0, window.innerHeight);
  });
  await sleep(500);
}

/**
 * Función auxiliar para esperar y hacer click en un elemento
 */
async function clickElementSafe(page, selector, timeout = 5000) {
  try {
    await page.waitForSelector(selector, { timeout });
    await page.click(selector);
    return true;
  } catch (error) {
    console.error(`No se pudo hacer click en ${selector}:`, error.message);
    return false;
  }
}

/**
 * Función auxiliar para extraer texto de forma segura
 */
async function getTextSafe(page, selector) {
  try {
    return await page.$eval(selector, el => el.textContent.trim());
  } catch (error) {
    return null;
  }
}

module.exports = {
  procesarClienteAFIP,
  sleep,
  scrollPage,
  clickElementSafe,
  getTextSafe
};