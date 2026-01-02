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
    // PASO: SETEAR CONTRIBUYENTE Y NAVEGAR A COMPROBANTES EMITIDOS
    // ============================================
    console.log(`[${cuit}] Navegando a Setear Contribuyente...`);

    let montoFacturas = null;
    let comprobantesPage = null;

    try {
      // Usar la página principal (page) para navegar dentro del mismo contexto de sesión
      // Primero setear contribuyente
      /* 
         El usuario indicó: https://fes.afip.gob.ar/mcmp/jsp/setearContribuyente.do?idContribuyente=0
         Nota: A veces estas URLs abren nuevas pestañas dependiendo de cómo esté configurado el sitio, 
         pero el usuario indicó "luego dirigirse a este link". 
         Si el usuario dice "luego dirigirse", asumimos navegación en la misma página o una nueva si el sitio lo fuerza.
         Vamos a intentar navegar en la página actual ('page') primero, ya que la sesión está ahí.
      */
      
      console.log(`[${cuit}] Navegando a setearContribuyente.do...`);
      await page.goto('https://fes.afip.gob.ar/mcmp/jsp/setearContribuyente.do?idContribuyente=0', {
        waitUntil: 'networkidle2',
        timeout: 45000
      });
      await sleep(2000);

      console.log(`[${cuit}] Navegando a comprobantesEmitidos.do...`);
      await page.goto('https://fes.afip.gob.ar/mcmp/jsp/comprobantesEmitidos.do', {
        waitUntil: 'networkidle2',
        timeout: 45000
      });
      await sleep(3000);

      // ============================================
      // FILTRAR POR "AÑO PASADO"
      // ============================================
      console.log(`[${cuit}] Filtrando por 'Año Pasado'...`);
      
      // Click en el input de fecha (fechaEmision)
      await page.waitForSelector('#fechaEmision', { timeout: 15000 });
      await page.click('#fechaEmision');
      await sleep(1000);

      // Click en "Año Pasado"
      // El selector proporcionado es <li data-range-key="Año Pasado">Año Pasado</li>
      const selectorAnoPasado = 'li[data-range-key="Año Pasado"]';
      await page.waitForSelector(selectorAnoPasado, { timeout: 5000 });
      await page.click(selectorAnoPasado);
      await sleep(1000);

      // Click en "Buscar": <button type="submit" class="btn btn-primary col-xs-12" id="buscarComprobantes">Buscar</button>
      console.log(`[${cuit}] Click en Buscar...`);
      await page.click('#buscarComprobantes');
      
      // Esperar a que se actualice la tabla. Puede tardar.
      await sleep(3000);
      // Esperar que desaparezca algún loading o aparezca la tabla. 
      // Asumiremos un sleep generoso y/o esperar selectores de tabla.
      await page.waitForSelector('#tablaDataTables', { timeout: 30000 });

      // ============================================
      // CONFIGURAR VISTA DE 50 REGISTROS
      // ============================================
      // Click en <i class="fa fa-lg fa-bars"></i> (menú de cantidad de registros?)
      // El usuario dijo "luego hacer click aqui <i class="fa fa-lg fa-bars"></i>"
      console.log(`[${cuit}] Configurando vista de 50 registros...`);
      
      // A veces este ícono está dentro de un botón. Buscaremos el elemento i con esas clases.
      await page.click('.fa.fa-lg.fa-bars'); 
      await sleep(1000);

      // Click en <a href="#">50</a>
      // Buscamos un enlace que contenga el texto "50"
      await page.evaluate(() => {
        const links = Array.from(document.querySelectorAll('a'));
        const link50 = links.find(a => a.textContent.trim() === '50');
        if (link50) link50.click();
      });
      await sleep(3000); // Esperar que la tabla se redibuje

      // ============================================
      // ITERAR Y SUMAR
      // ============================================
      console.log(`[${cuit}] Comenzando suma de comprobantes...`);
      
      let totalFacturacion = 0.0;
      let hayPaginaSiguiente = true;
      let paginaActual = 1;

      while (hayPaginaSiguiente) {
        console.log(`[${cuit}] Procesando página ${paginaActual}...`);

        // Extraer datos de la página actual
        const { sumaPagina, filasProcesadas } = await page.evaluate(() => {
          let suma = 0.0;
          let procesadas = 0;
          
          // Seleccionar filas de la tabla (tbody tr)
          // Asumimos que la tabla tiene id 'tablaDataTables' basado en el botón de paginación mencionado por el usuario
          // Si no, buscamos la tabla principal.
          const filas = document.querySelectorAll('#tablaDataTables tbody tr');

          filas.forEach(fila => {
            // Obtener columnas
            const cols = fila.querySelectorAll('td');
            if (cols.length < 2) return; // Fila vacía o header incorrecto

            // Columna Tipo de Comprobante (indices pueden variar, buscamos texto)
            // El usuario dice: <td>11 - Factura C</td>
            // Columna Importe: <td class="alignRight"><span class="moneda">$</span>&nbsp;&nbsp;656.212,59</td>
            
            const textoFila = fila.innerText;
            const htmlFila = fila.innerHTML;
            
            // Buscar celda de tipo
            let tipoComprobante = "";
            let importeTexto = "";
            
            // Iteramos celdas para encontrar las que coinciden con los patrones
            cols.forEach(td => {
              const texto = td.textContent.trim();
              if (texto.includes('Factura') || texto.includes('Nota de Crédito') || texto.includes('Recibo')) {
                tipoComprobante = texto;
              }
              // Para el importe, buscamos la clase alignRight y que tenga simbolo moneda o formato numérico
              if (td.classList.contains('alignRight') && (texto.includes('$') || /[\d.,]+/.test(texto))) {
                importeTexto = texto;
              }
            });

            if (tipoComprobante && importeTexto) {
              // Limpiar importe: sacar $ y espacios, reemplazar puntos por nada y coma por punto (formato español)
              // 656.212,59 -> 656212.59
              const importeLimpio = importeTexto
                .replace('$', '')
                .replace(/\./g, '') // Quitar puntos de miles
                .replace(',', '.')  // Cambiar coma decimal por punto
                .trim();
              
              const importe = parseFloat(importeLimpio);

              if (!isNaN(importe)) {
                if (tipoComprobante.includes('Factura') || tipoComprobante.includes('Recibo')) {
                  suma += importe;
                } else if (tipoComprobante.includes('Nota de Crédito')) {
                  suma -= importe;
                }
                procesadas++;
              }
            }
          });

          return { sumaPagina: suma, filasProcesadas: procesadas };
        });

        totalFacturacion += sumaPagina;
        console.log(`[${cuit}] Página ${paginaActual}: procesadas ${filasProcesadas} filas. Subtotal acumulado: ${totalFacturacion.toLocaleString('es-AR')}`);

        // Verificar botón siguiente
        // <a href="#" aria-controls="tablaDataTables" data-dt-idx="5" tabindex="0">»</a>
        // El usuario dice: "cuando termine de sumar en la ultima pagina y el boton de pagina siguiente no deje hacer click"
        // Normalmente DataTables añade clase "disabled" al li padre del link, o al link mismo.
        
        const existeSiguiente = await page.evaluate(() => {
          // Buscar todos los botones de paginación y encontrar el que tiene "»"
          const botones = Array.from(document.querySelectorAll('.paginate_button, .pagination a, li a'));
          const btnSiguiente = botones.find(b => b.textContent.trim() === '»');
          
          if (!btnSiguiente) return false;
          
          // Verificar si está habilitado
          // DataTables suele poner clase disabled en el <li> padre o en el <a>
          const parentLi = btnSiguiente.closest('li');
          if (parentLi && parentLi.classList.contains('disabled')) return false;
          if (btnSiguiente.classList.contains('disabled')) return false;
          
          // Si no está disabled, hacer click y devolver true
          btnSiguiente.click();
          return true;
        });

        if (existeSiguiente) {
          paginaActual++;
          await sleep(2000); // Esperar carga de siguiente página
        } else {
          hayPaginaSiguiente = false;
        }
      }

      // Formatear total final
      montoFacturas = totalFacturacion.toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
      console.log(`[${cuit}] ✓ Cálculo finalizado. Total Facturación: ${montoFacturas}`);

    } catch (error) {
      console.error(`[${cuit}] ⚠ Error calculando facturación:`, error.message);
      
      // Tomar screenshot del error
      try {
        await page.screenshot({
          path: `error_calculo_${cuit}_${Date.now()}.png`,
          fullPage: true
        });
      } catch (e) {
        // Ignorar errores al tomar screenshot
      }
      
      // No lanzamos el error, solo registramos y continuamos
      montoFacturas = 'Error al calcular';
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
