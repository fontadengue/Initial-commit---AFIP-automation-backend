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
 */
async function extraerDatos(page, cuit) {
  try {
    console.log(`[${cuit}] Extrayendo nombre del usuario...`);

    // Esperar a que la página esté completamente cargada
    await sleep(2000);

    // Extraer el nombre del usuario desde el elemento <strong class="text-primary">
    const nombreUsuario = await page.evaluate(() => {
      const elemento = document.querySelector('strong.text-primary');
      return elemento ? elemento.textContent.trim() : null;
    });

    if (!nombreUsuario) {
      console.warn(`[${cuit}] No se pudo encontrar el nombre del usuario`);
    } else {
      console.log(`[${cuit}] Nombre extraído: ${nombreUsuario}`);
    }

    // ============================================
    // PASO: BUSCAR Y ACCEDER A MONOTRIBUTO
    // ============================================
    console.log(`[${cuit}] Buscando sección de Monotributo...`);

    let montoFacturas = null;

    try {
      // Esperar y hacer click en el buscador
      await page.waitForSelector('#buscadorInput', { timeout: 10000 });
      await sleep(500);
      
      console.log(`[${cuit}] Haciendo click en el buscador...`);
      await page.click('#buscadorInput');
      await sleep(500);

      // Tipear "Monotributo" en el buscador
      console.log(`[${cuit}] Escribiendo "Monotributo" en el buscador...`);
      await page.type('#buscadorInput', 'Monotributo', { delay: 100 });
      await sleep(1000);

      // Esperar a que aparezca la opción de Monotributo
      console.log(`[${cuit}] Esperando resultados de búsqueda...`);
      await page.waitForFunction(
        () => {
          const elementos = Array.from(document.querySelectorAll('p.small.text-muted'));
          return elementos.some(el => el.textContent.trim() === 'Monotributo');
        },
        { timeout: 10000 }
      );

      await sleep(500);

      // Hacer click en la opción "Monotributo" y esperar navegación
      console.log(`[${cuit}] Haciendo click en opción Monotributo...`);
      
      // Configurar listener para nueva página/popup si se abre
      const newPagePromise = new Promise(resolve => {
        browser.once('targetcreated', async target => {
          const newPage = await target.page();
          if (newPage) resolve(newPage);
        });
        // Timeout de 3 segundos si no se abre nueva página
        setTimeout(() => resolve(null), 3000);
      });

      await page.evaluate(() => {
        const elementos = Array.from(document.querySelectorAll('p.small.text-muted'));
        const monotributo = elementos.find(el => el.textContent.trim() === 'Monotributo');
        if (monotributo) {
          monotributo.click();
        }
      });

      // Verificar si se abrió una nueva página/pestaña
      const newPage = await newPagePromise;
      let targetPage = page;

      if (newPage) {
        console.log(`[${cuit}] Se abrió nueva ventana/pestaña para Monotributo`);
        targetPage = newPage;
        await targetPage.waitForNavigation({ waitUntil: 'networkidle2', timeout: 15000 }).catch(() => {});
      } else {
        // Si no se abrió nueva página, esperar navegación en la página actual
        console.log(`[${cuit}] Esperando navegación en la página actual...`);
        await page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 15000 }).catch(() => {});
      }

      // Esperar a que se cargue completamente
      await sleep(3000);

      console.log(`[${cuit}] URL actual: ${targetPage.url()}`);

      // Intentar múltiples estrategias para encontrar el monto
      console.log(`[${cuit}] Buscando elemento con el monto de facturas...`);

      // Estrategia 1: Buscar por ID directo
      montoFacturas = await targetPage.evaluate(() => {
        const elemento = document.querySelector('#spanFacturometroMontoMobile');
        return elemento ? elemento.textContent.trim() : null;
      });

      // Estrategia 2: Si no se encontró, buscar por el div padre y luego el span
      if (!montoFacturas) {
        console.log(`[${cuit}] Intentando estrategia alternativa...`);
        montoFacturas = await targetPage.evaluate(() => {
          const divMonto = document.querySelector('#divMontoFacturadoTextoMobile');
          if (divMonto) {
            // Buscar el siguiente elemento que contenga el monto
            let nextElement = divMonto.nextElementSibling;
            while (nextElement) {
              const span = nextElement.querySelector('span[id*="Facturometro"]') || 
                          nextElement.querySelector('span[id*="Monto"]');
              if (span) {
                return span.textContent.trim();
              }
              nextElement = nextElement.nextElementSibling;
            }
          }
          return null;
        });
      }

      // Estrategia 3: Buscar cualquier span que contenga "Facturometro" en su ID
      if (!montoFacturas) {
        console.log(`[${cuit}] Intentando búsqueda por patrón de ID...`);
        montoFacturas = await targetPage.evaluate(() => {
          const spans = document.querySelectorAll('span[id*="Facturometro"], span[id*="facturometro"]');
          for (const span of spans) {
            const texto = span.textContent.trim();
            // Verificar que parezca un monto (contiene números y comas/puntos)
            if (texto && /[\d.,]+/.test(texto)) {
              return texto;
            }
          }
          return null;
        });
      }

      // Estrategia 4: Buscar por texto visible que contenga "Monto facturado"
      if (!montoFacturas) {
        console.log(`[${cuit}] Intentando búsqueda por texto visible...`);
        montoFacturas = await targetPage.evaluate(() => {
          const elementos = Array.from(document.querySelectorAll('*'));
          for (const el of elementos) {
            if (el.textContent.includes('Monto facturado')) {
              // Buscar el siguiente elemento con números
              let next = el.nextElementSibling;
              while (next) {
                const texto = next.textContent.trim();
                if (/^\$?\s*[\d.,]+$/.test(texto)) {
                  return texto;
                }
                // También buscar dentro del elemento
                const spanConMonto = next.querySelector('span');
                if (spanConMonto) {
                  const textoSpan = spanConMonto.textContent.trim();
                  if (/[\d.,]+/.test(textoSpan)) {
                    return textoSpan;
                  }
                }
                next = next.nextElementSibling;
              }
            }
          }
          return null;
        });
      }

      if (montoFacturas) {
        console.log(`[${cuit}] ✓ Facturas Emitidas extraídas: ${montoFacturas}`);
      } else {
        console.warn(`[${cuit}] ⚠ No se pudo encontrar el monto de facturas`);
        
        // Tomar screenshot para debugging
        try {
          await targetPage.screenshot({
            path: `monotributo_${cuit}_${Date.now()}.png`,
            fullPage: true
          });
          console.log(`[${cuit}] Screenshot guardado para debugging`);
        } catch (e) {
          console.error(`[${cuit}] No se pudo tomar screenshot:`, e.message);
        }

        // Guardar HTML para análisis
        try {
          const html = await targetPage.content();
          const fs = require('fs');
          fs.writeFileSync(`monotributo_${cuit}_${Date.now()}.html`, html);
          console.log(`[${cuit}] HTML guardado para debugging`);
        } catch (e) {
          console.error(`[${cuit}] No se pudo guardar HTML:`, e.message);
        }
      }

      // Cerrar la nueva página si se abrió
      if (newPage && newPage !== page) {
        await newPage.close();
      }

    } catch (error) {
      console.error(`[${cuit}] ⚠ Error extrayendo datos de Monotributo:`, error.message);
      
      // Tomar screenshot del error
      try {
        await page.screenshot({
          path: `error_monotributo_${cuit}_${Date.now()}.png`,
          fullPage: true
        });
      } catch (e) {
        // Ignorar errores al tomar screenshot
      }
      
      // No lanzamos el error, solo registramos y continuamos
      montoFacturas = 'Error al extraer';
    }

    const datosExtraidos = {
      cuit: cuit,
      nombre: nombreUsuario,
      facturasEmitidas: montoFacturas,
      timestamp: new Date().toISOString(),
      url_actual: page.url(),
      loginExitoso: true
    };

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
