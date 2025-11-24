import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import { formatearMoneda } from './ventasService';

export const generarTicketHTML = (venta) => {
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
        <div style="font-weight: bold; font-size: 12px;">PRODUCTOS VENCIDOS</div>
        <table style="width: 100%;">
          ${vencidas.map(v => `
            <tr>
              <td style="font-size: 11px;">${v.nombre}</td>
              <td style="text-align: right; font-size: 11px;">${v.cantidad}</td>
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
        <div style="text-align: center; font-weight: bold; font-size: 16px; margin-bottom: 5px;">
          AREPAS EL GUERRERO
        </div>
        <div style="text-align: center; font-size: 12px; margin-bottom: 10px;">
          Nit: 123456789-0<br>
          Tel: 300 123 4567
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
          ¡Gracias por su compra!<br>
          Software: App Guerrero
        </div>
      </body>
    </html>
  `;
};

export const imprimirTicket = async (venta) => {
  try {
    const html = generarTicketHTML(venta);

    const { uri } = await Print.printToFileAsync({ html });
    console.log('Ticket generado en:', uri);

    await Sharing.shareAsync(uri, { UTI: '.pdf', mimeType: 'application/pdf' });
  } catch (error) {
    console.error('Error al imprimir ticket:', error);
    throw error;
  }
};
