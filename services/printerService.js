import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import { formatearMoneda } from './ventasService';
import { obtenerConfiguracionImpresion } from './rutasApiService';

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

  // Valores por defecto si no hay configuración
  const nombreNegocio = config?.nombre_negocio || 'AREPAS EL GUERRERO';
  const nitNegocio = config?.nit_negocio || 'Nit: 123456789-0';
  const direccionNegocio = config?.direccion_negocio || '';
  const telefonoNegocio = config?.telefono_negocio || 'Tel: 300 123 4567';
  const encabezado = config?.encabezado_ticket || '';
  const piePagina = config?.pie_pagina_ticket || 'Software: App Guerrero';
  const mensajeGracias = config?.mensaje_agradecimiento || '¡Gracias por su compra!';
  const mostrarLogo = config?.mostrar_logo !== false;
  // 🆕 Usar logo base64 si está disponible
  const logoSrc = logoBase64 || (config?.logo ? `${SERVER_URL}${config.logo}` : null);

  const fechaFormateada = new Date(fecha).toLocaleString('es-CO');

  let productosHTML = productos.map(p => `
    <tr>
      <td style="font-size: 12px;">${p.nombre}</td>
      <td style="text-align: center; font-size: 12px;">${p.cantidad}</td>
      <td style="text-align: right; font-size: 12px;">${formatearMoneda(p.subtotal)}</td>
    </tr>
  `).join('');

  let vencidasHTML = '';
  if (vencidas && vencidas.length > 0) {
    vencidasHTML = `
      <div style="margin-top: 10px; border-top: 1px dashed black; padding-top: 5px;">
        <div style="font-weight: bold; font-size: 12px;">CAMBIOS REALIZADOS</div>
        <table style="width: 100%;">
          ${vencidas.map(v => `
            <tr>
              <td style="font-size: 11px;">${v.nombre}</td>
              <td style="text-align: center; font-size: 11px;">${v.cantidad}</td>
              <td style="text-align: right; font-size: 11px; font-style: italic;">(Cambio)</td>
            </tr>
          `).join('')}
        </table>
      </div>
    `;
  }

  return `
    <html>
      <head>
        <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, minimum-scale=1.0, user-scalable=no" />
      </head>
      <body style="font-family: monospace; padding: 20px; width: 300px; margin: 0 auto;">
        <div style="text-align: center; margin-bottom: 10px;">
          ${mostrarLogo && logoSrc ? `<img src="${logoSrc}" style="max-width: 100px; max-height: 80px; margin-bottom: 5px;" />` : ''}
          <div style="font-weight: bold; font-size: 16px; margin-bottom: 5px;">
            ${nombreNegocio}
          </div>
          <div style="font-size: 12px;">
            ${nitNegocio ? `Nit: ${nitNegocio}<br>` : ''}
            ${direccionNegocio ? `${direccionNegocio}<br>` : ''}
            ${telefonoNegocio ? `Tel: ${telefonoNegocio}` : ''}
          </div>
          ${encabezado ? `<div style="font-size: 11px; margin-top: 5px; font-style: italic;">${encabezado}</div>` : ''}
        </div>
        
        <div style="border-bottom: 1px dashed black; margin-bottom: 10px;"></div>
        
        <div style="font-size: 12px; margin-bottom: 5px;">
          <b>Ticket:</b> #${id}<br>
          <b>Fecha:</b> ${fechaFormateada}<br>
          <b>Cliente:</b> ${cliente_nombre}<br>
          <b>Negocio:</b> ${cliente_negocio || 'N/A'}<br>
          <b>Vendedor:</b> ${vendedor}
        </div>

        <div style="border-bottom: 1px dashed black; margin-bottom: 10px;"></div>

        <table style="width: 100%; margin-bottom: 10px;">
          <thead>
            <tr>
              <th style="text-align: left; font-size: 12px;">Prod</th>
              <th style="text-align: center; font-size: 12px;">Cant</th>
              <th style="text-align: right; font-size: 12px;">Total</th>
            </tr>
          </thead>
          <tbody>
            ${productosHTML}
          </tbody>
        </table>

        <div style="border-top: 1px dashed black; margin-top: 5px; padding-top: 5px;">
          <div style="display: flex; justify-content: space-between; font-size: 12px;">
            <span>Subtotal:</span>
            <span>${formatearMoneda(subtotal)}</span>
          </div>
          <div style="display: flex; justify-content: space-between; font-size: 12px;">
            <span>Descuento:</span>
            <span>${formatearMoneda(descuento)}</span>
          </div>
          <div style="display: flex; justify-content: space-between; font-weight: bold; font-size: 14px; margin-top: 5px;">
            <span>TOTAL:</span>
            <span>${formatearMoneda(total)}</span>
          </div>
        </div>


        ${vencidasHTML}

        <div style="margin-top: 20px; text-align: center; font-size: 11px;">
          ${mensajeGracias}<br>
          ${piePagina}
        </div>
      </body>
    </html>
  `;
};

export const imprimirTicket = async (venta) => {
  try {
    // Intentar obtener configuración del servidor, usar null si falla (offline)
    let config = null;
    let logoBase64 = null;

    try {
      config = await obtenerConfiguracionImpresion();

      // 🆕 Usar logo_base64 directamente del backend (ya viene en base64)
      if (config?.logo_base64 && config?.mostrar_logo !== false) {
        logoBase64 = config.logo_base64;
        console.log('✅ Logo cargado desde backend (base64)');
      }
    } catch (configError) {
      console.log('⚠️ Error obteniendo configuración, usando valores por defecto');
      // Continúa con config = null, usará valores por defecto
    }

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
    // Intentar obtener configuración del servidor
    let config = null;
    let logoBase64 = null;

    try {
      config = await obtenerConfiguracionImpresion();

      // 🆕 Usar logo_base64 directamente del backend
      if (config?.logo_base64 && config?.mostrar_logo !== false) {
        logoBase64 = config.logo_base64;
      }
    } catch (configError) {
      // Continúa con valores por defecto
    }

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
