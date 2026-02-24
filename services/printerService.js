import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { formatearMoneda } from './ventasService';
import { obtenerConfiguracionImpresion } from './rutasApiService';
import { API_URL } from '../config';

const IMPRESION_CONFIG_CACHE_KEY = 'impresion_config_cache_v1';

const obtenerConfigImpresionConCache = async () => {
  let config = null;

  // 1. Intentar cargar desde caché local PRIMERO (muy rápido)
  try {
    const cacheRaw = await AsyncStorage.getItem(IMPRESION_CONFIG_CACHE_KEY);
    if (cacheRaw) {
      const cache = JSON.parse(cacheRaw);
      if (cache?.config) {
        config = cache.config;
      }
    }
  } catch (cacheError) {
    // Silencioso
  }

  // 2. Si no hay cache disponible, o bajamos del backend Bloqueando (1ra vez)
  if (!config) {
    try {
      config = await obtenerConfiguracionImpresion();
      if (config) {
        await AsyncStorage.setItem(
          IMPRESION_CONFIG_CACHE_KEY,
          JSON.stringify({ config, timestamp: Date.now() })
        );
      }
    } catch (error) {
      console.log('Error cargando config de impresión inicial:', error);
    }
  } else {
    // 3. Si YA tenemos cache, disparamos una petición al servidor SIN BLOQUEAR la impresión
    // para que la próxima vez tenga los datos más frescos (Fire-and-forget)
    obtenerConfiguracionImpresion().then(async (nuevaConfig) => {
      if (nuevaConfig) {
        await AsyncStorage.setItem(
          IMPRESION_CONFIG_CACHE_KEY,
          JSON.stringify({ config: nuevaConfig, timestamp: Date.now() })
        );
      }
    }).catch(() => { });
  }

  let logoBase64 = null;
  if (config?.logo_base64 && config?.mostrar_logo !== false) {
    logoBase64 = config.logo_base64;
  }

  return { config, logoBase64 };
};

export const generarTicketHTML = (venta, config = null, logoBase64 = null) => {
  const {
    id,
    fecha,
    cliente_nombre,
    cliente_negocio,
    vendedor,
    productos,
    subtotal,
    descuento,
    total,
    devoluciones,
    vencidas
  } = venta;

  // Compatibilidad: algunas ventas guardan items como "productos" y otras como "detalles"
  const rawItems = Array.isArray(productos) && productos.length > 0
    ? productos
    : (Array.isArray(venta?.detalles) ? venta.detalles : []);

  const esNumeroValido = (valor) => Number.isFinite(parseFloat(valor));

  const lineItems = rawItems.map((item) => {
    const cantidad = parseInt(item?.cantidad || 0, 10) || 0;
    const precioUnitarioRaw = parseFloat(item?.precio_unitario ?? item?.precio ?? 0) || 0;
    const subtotalItemRaw = parseFloat(item?.subtotal ?? (cantidad * precioUnitarioRaw)) || 0;

    // Ticket comercial sin decimales (mismo comportamiento esperado de venta normal)
    const precioUnitario = Math.round(precioUnitarioRaw);
    const subtotalItem = Math.round(subtotalItemRaw);

    return {
      nombre: item?.nombre || item?.producto_nombre || item?.producto || 'PRODUCTO',
      cantidad,
      precio_unitario: precioUnitario,
      subtotal: subtotalItem
    };
  });

  // Fallbacks para reimpresión: backend puede no enviar subtotal/descuento explícitos
  const subtotalCalculado = lineItems.reduce((sum, item) => sum + (item.subtotal || 0), 0);
  const subtotalBase = esNumeroValido(subtotal) ? parseFloat(subtotal) : subtotalCalculado;
  const totalBase = esNumeroValido(total) ? parseFloat(total) : subtotalBase;
  const descuentoBase = esNumeroValido(descuento)
    ? parseFloat(descuento)
    : Math.max(0, subtotalBase - totalBase);

  const subtotalFinal = Math.round(subtotalBase || 0);
  const descuentoFinal = Math.round(descuentoBase || 0);
  const totalFinal = Math.round((esNumeroValido(total) ? parseFloat(total) : (subtotalFinal - descuentoFinal)) || 0);

  // 🆕 Configuración completa con estilos visuales
  const nombreNegocio = config?.nombre_negocio || 'AREPAS EL GUERRERO';
  const nitNegocio = config?.nit_negocio || '';
  const direccionNegocio = config?.direccion_negocio || '';
  const ciudadNegocio = config?.ciudad_negocio || '';
  const paisNegocio = config?.pais_negocio || '';
  const telefonoNegocio = config?.telefono_negocio || '';
  const encabezado = config?.encabezado_ticket || '';
  const piePagina = config?.pie_pagina_ticket || 'Software: App Guerrero';
  const mensajeGracias = config?.mensaje_agradecimiento || '¡Gracias por su compra!';
  const mostrarLogo = config?.mostrar_logo !== false;
  const logoSrc = logoBase64 || (config?.logo ? `${API_URL}${config.logo}` : null);

  // 🆕 Estilos visuales configurables
  const fuenteTicket = config?.fuente_ticket || 'Lucida Console, Monaco, Consolas';
  const tamanioGeneral = config?.tamanio_fuente_general || 9;
  const tamanioNombreNegocio = config?.tamanio_fuente_nombre_negocio || 11;
  const tamanioInfo = config?.tamanio_fuente_info || 8;
  const tamanioTabla = config?.tamanio_fuente_tabla || 8;
  const tamanioTotales = config?.tamanio_fuente_totales || 9;
  const letraSpaciado = config?.letter_spacing || -0.2;
  const letraSpaciadoDivider = config?.letter_spacing_divider || -0.8;

  const fechaFormateada = new Date(fecha).toLocaleString('es-CO');
  const idSeguro = (typeof id === 'string' || typeof id === 'number') ? String(id) : '';
  const consecutivoFallback = idSeguro.includes('-') ? idSeguro.split('-').pop() : idSeguro;

  let productosHTML = lineItems.map(p => {
    // Calcular unitario si no existe y evitar división por cero
    const unitario = p.precio_unitario || (p.cantidad > 0 ? p.subtotal / p.cantidad : 0);
    return `
    <tr>
      <td style="text-align: center;">${p.cantidad}</td>
      <td>${p.nombre}</td>
      <td style="text-align: right;">${formatearMoneda(unitario)}</td>
      <td style="text-align: right;">${formatearMoneda(p.subtotal)}</td>
    </tr>
  `}).join('');

  let vencidasHTML = '';
  if (vencidas && vencidas.length > 0) {
    vencidasHTML = `
      <div style="margin: 5px 0;">
        <div style="font-weight: bold; font-size: ${tamanioInfo}px; margin-bottom: 5px;">Cambios Realizados</div>
        <table style="width: 100%; font-size: ${tamanioTabla - 1}px;">
          ${vencidas.map(v => `
            <tr>
              <td>${v.cantidad}</td>
              <td>${v.nombre}</td>
              <td style="text-align: right;">$ 0</td>
            </tr>
          `).join('')}
        </table>
      </div>
      <div class="ticket-divider">................................................</div>
    `;
  }

  return `
    <html>
      <head>
        <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, minimum-scale=1.0, user-scalable=no" />
        <style>
          * {
            margin: 0;
            padding: 0;
            box-sizing: border-box;
          }
          
          body {
            margin: 0;
            padding: 15px;
            font-family: ${fuenteTicket}, monospace;
            font-size: ${tamanioGeneral}px;
            font-weight: bold;
            background: white;
            color: #000;
            letter-spacing: ${letraSpaciado}px;
            width: 300px;
            margin: 0 auto;
          }
          
          .ticket-header {
            text-align: center;
            margin-bottom: 15px;
          }
          
          .ticket-logo {
            max-width: 135px;
            max-height: 115px;
            margin-bottom: 8px;
            filter: grayscale(100%);
            -webkit-filter: grayscale(100%);
          }

          .ticket-business-name {
            font-size: ${tamanioNombreNegocio}px;
            font-weight: bold;
            margin: 8px 0;
            text-transform: uppercase;
          }
          
          .ticket-business-info {
            font-size: 12px;
            margin-bottom: 5px;
            font-weight: 900;
            color: #000;
          }

          .ticket-divider {
            text-align: center;
            margin: 8px 0;
            font-size: 10px;
            font-weight: normal;
            letter-spacing: ${letraSpaciadoDivider}px;
            line-height: 1;
          }
          
          .ticket-info {
            font-size: ${tamanioInfo}px;
            margin: 4px 0;
            line-height: 1.5;
            font-weight: bold;
          }
          
          .ticket-table {
            width: 100%;
            border-collapse: collapse;
            font-size: ${tamanioTabla}px;
            margin: 12px 0;
          }
          
          .ticket-table th {
            text-align: left;
            border-bottom: 1px dotted #000;
            padding: 3px 1px;
            font-weight: 900;
            font-size: ${tamanioTabla}px;
            color: #000;
          }
          
          .ticket-table td {
            padding: 3px 1px;
            vertical-align: top;
            font-weight: normal;
            font-size: ${tamanioTabla - 1}px;
          }
          
          .ticket-table th:first-child,
          .ticket-table td:first-child {
            width: 30px;
            text-align: center;
          }
          
          .ticket-table th:last-child,
          .ticket-table td:last-child {
            width: 60px;
            text-align: right;
          }
          
          .ticket-totals {
            margin: 12px 0;
            font-size: ${tamanioTotales}px;
            font-weight: bold;
          }
          
          .total-row {
            display: flex;
            justify-content: space-between;
            margin: 5px 0;
          }
          
          .total-final {
            font-size: ${tamanioTotales + 1}px;
            margin-top: 5px;
            padding-top: 5px;
            border-top: 1px dashed #000;
            font-weight: bold;
          }
          
          .ticket-footer {
            text-align: center;
            margin-top: 12px;
            font-size: ${tamanioTotales}px;
            font-weight: bold;
          }
        </style>
      </head>
      <body>
        <div class="ticket-header">
          ${mostrarLogo && logoSrc ? `<img src="${logoSrc}" class="ticket-logo" />` : ''}
          <div class="ticket-business-name">${nombreNegocio}</div>
          ${nitNegocio ? `<div class="ticket-business-info">NIT: ${nitNegocio}</div>` : ''}
          ${telefonoNegocio ? `<div class="ticket-business-info">Tel: ${telefonoNegocio}</div>` : ''}
          ${paisNegocio || ciudadNegocio ? `<div class="ticket-business-info">${paisNegocio}${paisNegocio && ciudadNegocio ? '- ' : ''}${ciudadNegocio}</div>` : ''}
          ${direccionNegocio ? `<div class="ticket-business-info">${direccionNegocio}</div>` : ''}
          ${encabezado ? `<div class="ticket-business-info" style="margin-top:5px; font-style:italic;">${encabezado}</div>` : ''}
        </div>
        
        <div class="ticket-divider">................................................</div>
        
        <div class="ticket-info">
          <b>Factura:</b> #${venta.consecutivo ? venta.consecutivo.toString().padStart(4, '0') : consecutivoFallback}<br>
          <b>Fecha:</b> ${fechaFormateada}<br>
          <b>Cliente:</b> ${cliente_negocio || cliente_nombre}<br>
          <b>Vendedor:</b> ${vendedor}
        </div>

        <div class="ticket-divider">................................................</div>

        <table class="ticket-table">
          <thead>
            <tr>
              <th style="width: 25px; text-align: center;">Cant</th>
              <th>Producto</th>
              <th style="width: 55px; text-align: right;">P.Unit</th>
              <th style="width: 55px; text-align: right;">Total</th>
            </tr>
          </thead>
          <tbody>
            ${productosHTML}
          </tbody>
        </table>

        <div class="ticket-divider">................................................</div>

        ${vencidasHTML}

        <div class="ticket-totals">
          <div class="total-row">
            <span>Art</span>
            <span>${lineItems.length}</span>
          </div>
          <div class="total-row">
            <span>Cant.Art</span>
            <span>${lineItems.reduce((sum, p) => sum + p.cantidad, 0)}</span>
          </div>
          <div class="total-row">
            <span>Subtotal:</span>
            <span>${formatearMoneda(subtotalFinal)}</span>
          </div>
          <div class="total-row">
            <span>Descuento:</span>
            <span>${formatearMoneda(descuentoFinal)}</span>
          </div>
          <div class="total-row total-final">
            <span>TOTAL:</span>
            <span>${formatearMoneda(totalFinal)}</span>
          </div>
        </div>



        <div class="ticket-footer">
          ${mensajeGracias}<br>
          ${piePagina}
        </div>
      </body>
    </html>
  `;
};

export const imprimirTicket = async (venta) => {
  try {
    const { config, logoBase64 } = await obtenerConfigImpresionConCache();

    const html = generarTicketHTML(venta, config, logoBase64);

    const { uri } = await Print.printToFileAsync({ html });

    await Sharing.shareAsync(uri, { UTI: '.pdf', mimeType: 'application/pdf' });
  } catch (error) {
    console.error('Error al imprimir ticket:', error);
    throw error;
  }
};

// Generar solo el PDF del ticket (para compartir por WhatsApp)
export const generarTicketPDF = async (venta) => {
  try {
    const { config, logoBase64 } = await obtenerConfigImpresionConCache();

    const html = generarTicketHTML(venta, config, logoBase64);
    const { uri } = await Print.printToFileAsync({ html });

    return uri;
  } catch (error) {
    console.error('Error al generar PDF:', error);
    throw error;
  }
};

// Compartir ticket por WhatsApp (genera PDF y abre selector de compartir)
export const compartirTicketWhatsApp = async (venta) => {
  try {
    // Generar el PDF
    const pdfUri = await generarTicketPDF(venta);

    // Verificar si se puede compartir
    const isAvailable = await Sharing.isAvailableAsync();

    if (isAvailable) {
      await Sharing.shareAsync(pdfUri, {
        mimeType: 'application/pdf',
        dialogTitle: 'Enviar ticket',
        UTI: 'com.adobe.pdf'
      });
    } else {
      throw new Error('Compartir no disponible en este dispositivo');
    }
  } catch (error) {
    console.error('Error al compartir ticket:', error);
    throw error;
  }
};
