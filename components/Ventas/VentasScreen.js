import React, { useState, useEffect } from 'react';
import { View, Text, TextInput, TouchableOpacity, FlatList, StyleSheet, Alert, SafeAreaView, StatusBar, Platform, RefreshControl, Modal, Linking } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import DateTimePicker from '@react-native-community/datetimepicker'; // 🆕 Import DatePicker
import ClienteSelector from './ClienteSelector';
import ClienteModal from './ClienteModal';
import DevolucionesVencidas from './DevolucionesVencidas';
import ResumenVentaModal from './ResumenVentaModal';
import {
    obtenerProductos,
    buscarProductos,
    obtenerClientes,
    calcularSubtotal,
    guardarVenta,
    formatearMoneda,
    sincronizarProductos,
    sincronizarVentasPendientes,
    obtenerVentasPendientes
} from '../../services/ventasService';
import { imprimirTicket } from '../../services/printerService';
import { ENDPOINTS } from '../../config'; // 🆕 Importar config centralizado

// Días de la semana
const DIAS_SEMANA = ['LUNES', 'MARTES', 'MIERCOLES', 'JUEVES', 'VIERNES', 'SABADO', 'DOMINGO'];
const DIAS_MAP = {
    0: 'DOMINGO',
    1: 'LUNES',
    2: 'MARTES',
    3: 'MIERCOLES',
    4: 'JUEVES',
    5: 'VIERNES',
    6: 'SABADO'
};

const VentasScreen = ({ route, userId: userIdProp, vendedorNombre }) => {
    // userId puede venir de route.params o como prop directa
    const userId = route?.params?.userId || userIdProp;

    // Estado para selección de día
    const [mostrarSelectorDia, setMostrarSelectorDia] = useState(false); // 🆕 Inicia en FALSE para verificar turno primero
    const [diaSeleccionado, setDiaSeleccionado] = useState(null);
    const [fechaSeleccionada, setFechaSeleccionada] = useState(new Date());
    const [mostrarDatePicker, setMostrarDatePicker] = useState(false);
    const [verificandoTurno, setVerificandoTurno] = useState(true); // 🆕 Estado de carga inicial

    // Estados
    const [clienteSeleccionado, setClienteSeleccionado] = useState(null);
    const [busquedaProducto, setBusquedaProducto] = useState('');
    const [productos, setProductos] = useState([]);
    const [carrito, setCarrito] = useState({});
    const [descuento, setDescuento] = useState(0);
    const [nota, setNota] = useState('');
    const [clientes, setClientes] = useState([]);

    // Estados para modales
    const [mostrarSelectorCliente, setMostrarSelectorCliente] = useState(false);
    const [mostrarModalCliente, setMostrarModalCliente] = useState(false);
    const [mostrarVencidas, setMostrarVencidas] = useState(false);
    const [mostrarResumen, setMostrarResumen] = useState(false);
    const [ventaTemporal, setVentaTemporal] = useState(null);

    // Estados para vencidas
    const [vencidas, setVencidas] = useState([]);
    const [fotoVencidas, setFotoVencidas] = useState(null);

    // Estado para pull to refresh
    const [refreshing, setRefreshing] = useState(false);
    const [ventasPendientes, setVentasPendientes] = useState(0);

    // 🆕 Estado para cerrar turno
    const [mostrarModalCerrarTurno, setMostrarModalCerrarTurno] = useState(false);
    const [totalVentasHoy, setTotalVentasHoy] = useState(0);
    const [totalDineroHoy, setTotalDineroHoy] = useState(0);

    // 🆕 Estado para turno abierto (indicador visual)
    const [turnoAbierto, setTurnoAbierto] = useState(false);
    const [horaTurno, setHoraTurno] = useState(null);

    // 🆕 Estado para stock del cargue
    const [stockCargue, setStockCargue] = useState({});

    // Obtener día actual
    const getDiaActual = () => {
        return DIAS_MAP[new Date().getDay()];
    };

    // Seleccionar día - 🆕 Ahora abre el DatePicker
    const handleSeleccionarDia = (dia) => {
        setDiaSeleccionado(dia);
        setMostrarSelectorDia(false);
        setMostrarDatePicker(true); // 🆕 Abrir calendario
    };

    // 🆕 Confirmar fecha seleccionada
    const handleConfirmarFecha = async (event, date) => {
        setMostrarDatePicker(Platform.OS === 'ios'); // En iOS mantener visible

        if (date) {
            setFechaSeleccionada(date);

            // Cargar inventario del cargue con la fecha seleccionada
            cargarStockCargue(diaSeleccionado, date);

            // 🆕 Llamar al backend para abrir turno (persistir estado)
            try {
                const fechaFormatted = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;

                const response = await fetch(ENDPOINTS.TURNO_ABRIR, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        vendedor_id: userId,
                        vendedor_nombre: vendedorNombre || `Vendedor ${userId}`,
                        dia: diaSeleccionado,
                        fecha: fechaFormatted,
                        dispositivo: Platform.OS
                    })
                });

                const data = await response.json();

                if (data.error === 'TURNO_YA_CERRADO') {
                    Alert.alert(
                        '⚠️ Turno Ya Cerrado',
                        'El turno para este día ya fue cerrado.\n\nNo puedes abrir un nuevo turno para esta fecha.',
                        [{ text: 'OK' }]
                    );
                    setMostrarSelectorDia(true); // Volver a mostrar selector
                    return;
                }

                console.log('✅ Turno abierto en backend:', data);
            } catch (error) {
                console.log('⚠️ Error abriendo turno en backend:', error);
                // Continuar aunque falle (offline mode)
            }

            // Marcar turno como abierto localmente
            setTurnoAbierto(true);
            setHoraTurno(new Date());

            // Mensaje de "ABRIR TURNO"
            const fechaFormateada = date.toLocaleDateString('es-ES', {
                year: 'numeric',
                month: 'long',
                day: 'numeric'
            });

            const horaActual = new Date().toLocaleTimeString('es-ES', {
                hour: '2-digit',
                minute: '2-digit'
            });

            Alert.alert(
                '✅ Turno Abierto',
                `Día: ${diaSeleccionado}\nFecha: ${fechaFormateada}\nHora: ${horaActual}\n\nTurno iniciado correctamente.\nPuedes comenzar a vender.`,
                [{ text: 'OK' }]
            );

            // Si hay cliente preseleccionado desde rutas, usarlo
            if (clientePreseleccionado) {
                cargarDatosConClientePreseleccionado(clientePreseleccionado);
            } else {
                cargarDatos();
            }
            verificarPendientes();
        }
    };

    // Estado para cliente preseleccionado desde rutas
    const [clientePreseleccionado, setClientePreseleccionado] = useState(null);

    // 🆕 Verificar turno activo al iniciar la app
    const verificarTurnoActivo = async () => {
        try {
            const response = await fetch(`${ENDPOINTS.TURNO_VERIFICAR}?vendedor_id=${userId}`);
            const data = await response.json();

            if (data.turno_activo) {
                console.log('✅ Turno activo encontrado:', data);
                // Hay turno abierto - saltar modal de selección
                setDiaSeleccionado(data.dia);

                // Parsear fecha del turno
                const fechaTurno = new Date(data.fecha + 'T12:00:00');
                setFechaSeleccionada(fechaTurno);

                // Parsear hora de apertura
                if (data.hora_apertura) {
                    setHoraTurno(new Date(data.hora_apertura));
                }

                // Marcar turno como abierto
                setTurnoAbierto(true);
                setMostrarSelectorDia(false);

                // Cargar datos
                await cargarStockCargue(data.dia, fechaTurno);
                cargarDatos();
                verificarPendientes();

                return true;
            }
            return false;
        } catch (error) {
            console.log('⚠️ Error verificando turno:', error);
            return false;
        }
    };

    // Cargar datos iniciales solo cuando se selecciona un día
    useEffect(() => {
        // 🆕 Verificar primero si hay turno activo
        const inicializar = async () => {
            // Si viene de rutas con cliente preseleccionado
            if (route?.params?.fromRuta && route?.params?.clientePreseleccionado) {
                setClientePreseleccionado(route.params.clientePreseleccionado);
            }

            // Verificar turno activo
            setVerificandoTurno(true);
            const hayTurno = await verificarTurnoActivo();
            setVerificandoTurno(false);

            if (!hayTurno) {
                // No hay turno, mostrar selector de día
                setMostrarSelectorDia(true);
            }
        };

        inicializar();
    }, []);

    const cargarDatosConClientePreseleccionado = async (clientePre) => {
        // Cargar productos filtrados por disponible_app_ventas
        const productosData = obtenerProductos();
        const productosFiltrados = productosData.filter(p => p.disponible_app_ventas !== false);
        setProductos(productosFiltrados);

        // Cargar clientes
        const clientesData = await obtenerClientes();
        setClientes(clientesData);

        // Buscar si el cliente existe en la lista o crear uno temporal
        const clienteExistente = clientesData.find(c =>
            c.nombre_negocio === clientePre.nombre_negocio ||
            c.id === clientePre.id
        );

        if (clienteExistente) {
            setClienteSeleccionado(clienteExistente);
        } else {
            // Usar el cliente de la ruta directamente
            setClienteSeleccionado({
                id: clientePre.id,
                nombre: clientePre.nombre_contacto || clientePre.nombre_negocio,
                nombre_negocio: clientePre.nombre_negocio,
                direccion: clientePre.direccion,
                telefono: clientePre.telefono
            });
        }

        verificarPendientes();
    };

    const cargarDatos = async () => {
        // Cargar productos filtrados por disponible_app_ventas
        const productosData = obtenerProductos();
        const productosFiltrados = productosData.filter(p => p.disponible_app_ventas !== false);
        setProductos(productosFiltrados);

        // Cargar clientes
        const clientesData = await obtenerClientes();
        setClientes(clientesData);

        // Seleccionar cliente general por defecto
        setClienteSeleccionado(clientesData[0]);
    };

    // 🆕 Cargar stock del cargue según el día y fecha
    const cargarStockCargue = async (dia, fecha) => {
        try {
            // Formatear fecha a YYYY-MM-DD
            let fechaFormateada;
            if (fecha instanceof Date) {
                const year = fecha.getFullYear();
                const month = String(fecha.getMonth() + 1).padStart(2, '0');
                const day = String(fecha.getDate()).padStart(2, '0');
                fechaFormateada = `${year}-${month}-${day}`;
            } else {
                fechaFormateada = fecha;
            }

            // Llamar al endpoint de obtener cargue
            const response = await fetch(`${ENDPOINTS.OBTENER_CARGUE}?vendedor_id=${userId}&dia=${dia}&fecha=${fechaFormateada}`);
            const data = await response.json();

            if (data && Object.keys(data).length > 0) {
                // Crear objeto con stock por producto
                const stockPorProducto = {};

                Object.keys(data).forEach(nombreProducto => {
                    const item = data[nombreProducto];
                    // Calcular stock disponible (total ya viene calculado desde backend)
                    const stockDisponible = parseInt(item.quantity) || 0;
                    stockPorProducto[nombreProducto.toUpperCase()] = stockDisponible;
                });

                setStockCargue(stockPorProducto);
                console.log('📦 Stock cargado:', stockPorProducto);
            } else {
                console.log('⚠️ No hay cargue para esta fecha');
                setStockCargue({});
            }
        } catch (error) {
            console.error('Error cargando stock:', error);
            setStockCargue({});
        }
    };

    // Verificar ventas pendientes de sincronizar
    const verificarPendientes = async () => {
        const pendientes = await obtenerVentasPendientes();
        setVentasPendientes(pendientes.length);
    };

    // Función para sincronizar al arrastrar hacia abajo
    const onRefresh = async () => {
        setRefreshing(true);
        try {


            // 1. Sincronizar ventas pendientes
            const resultadoVentas = await sincronizarVentasPendientes();

            // 2. Sincronizar productos
            await sincronizarProductos();

            // 3. Recargar productos actualizados filtrados por disponible_app_ventas
            const productosData = obtenerProductos();
            const productosFiltrados = productosData.filter(p => p.disponible_app_ventas !== false);
            setProductos(productosFiltrados);

            // 4. 🆕 Recargar stock del cargue
            await cargarStockCargue(diaSeleccionado, fechaSeleccionada);

            // 5. Actualizar contador de pendientes
            await verificarPendientes();

            // Mostrar resultado
            let mensaje = 'Productos, precios y stock actualizados';
            if (resultadoVentas.sincronizadas > 0) {
                mensaje += `\n✅ ${resultadoVentas.sincronizadas} ventas sincronizadas`;
            }
            if (resultadoVentas.pendientes > 0) {
                mensaje += `\n⏳ ${resultadoVentas.pendientes} ventas pendientes`;
            }

            Alert.alert('Sincronización', mensaje);
        } catch (error) {
            console.error('Error sincronizando:', error);
            Alert.alert('Error', 'No se pudo sincronizar');
        } finally {
            setRefreshing(false);
        }
    };

    // Filtrar productos según búsqueda
    const productosFiltrados = busquedaProducto.trim() === ''
        ? productos
        : buscarProductos(busquedaProducto);

    // Obtener cantidad de un producto en el carrito
    const getCantidad = (productoId) => {
        return carrito[productoId] || 0;
    };

    // Actualizar cantidad de un producto
    const actualizarCantidad = (productoId, nuevaCantidad) => {
        if (nuevaCantidad < 0) return;

        // 🆕 Validación de Stock
        const producto = productos.find(p => p.id === productoId);
        if (producto) {
            // Obtener stock disponible (usar nombre exacto del producto)
            const nombreNormalizado = producto.nombre.trim().toUpperCase();
            const stockDisponible = stockCargue[nombreNormalizado] !== undefined ? stockCargue[nombreNormalizado] : 0;

            // Si intenta aumentar y supera el stock
            if (nuevaCantidad > (carrito[productoId] || 0) && nuevaCantidad > stockDisponible) {
                Alert.alert(
                    'Stock Insuficiente',
                    `Solo tienes ${stockDisponible} unidades de ${producto.nombre} disponibles en tu cargue.`
                );
                return; // ⛔ Evitar actualización
            }
        }

        const nuevoCarrito = { ...carrito };
        if (nuevaCantidad === 0) {
            delete nuevoCarrito[productoId];
        } else {
            nuevoCarrito[productoId] = nuevaCantidad;
        }
        setCarrito(nuevoCarrito);
    };

    // Calcular totales
    const calcularTotales = () => {
        let subtotal = 0;

        productos.forEach(producto => {
            const cantidad = getCantidad(producto.id);
            if (cantidad > 0) {
                subtotal += producto.precio * cantidad;
            }
        });

        const total = subtotal - descuento;

        return { subtotal, total };
    };

    const { subtotal, total } = calcularTotales();

    // Completar venta
    const completarVenta = async () => {
        // Validar que haya productos en el carrito O vencidas
        const productosEnCarrito = Object.keys(carrito).filter(id => carrito[id] > 0);

        if (productosEnCarrito.length === 0 && vencidas.length === 0) {
            Alert.alert('Error', 'Debe agregar al menos un producto o reportar vencidas');
            return;
        }

        // Validar cliente
        if (!clienteSeleccionado) {
            Alert.alert('Error', 'Debe seleccionar un cliente');
            return;
        }

        // Preparar datos de la venta
        const productosVenta = productosEnCarrito.map(idStr => {
            const id = parseInt(idStr);
            const producto = productos.find(p => p.id === id);
            const cantidad = carrito[id];

            return {
                id: producto.id,
                nombre: producto.nombre,
                precio: producto.precio,
                cantidad: cantidad,
                subtotal: producto.precio * cantidad
            };
        });

        const venta = {
            cliente_id: clienteSeleccionado.id,
            cliente_nombre: clienteSeleccionado.nombre,
            cliente_negocio: clienteSeleccionado.negocio, // Asegurar que se pase el negocio
            cliente_celular: clienteSeleccionado.celular || '',
            vendedor: vendedorNombre || userId, // Usar nombre del vendedor para el ticket
            vendedor_id: userId, // ID para el backend
            productos: productosVenta,
            subtotal: subtotal,
            descuento: descuento,
            total: total,
            nota: nota,
            vencidas: vencidas,
            fotoVencidas: fotoVencidas
        };

        setVentaTemporal(venta);
        setMostrarResumen(true);
    };

    // Confirmar y guardar venta
    const confirmarVenta = async (fechaSeleccionada, metodoPago, opcionesEnvio) => {

        if (!ventaTemporal) {
            console.log('❌ No hay ventaTemporal');
            return;
        }

        // 🆕 Evitar duplicación - Si ya está guardando, salir
        if (window.__guardandoVenta) {
            console.log('⚠️ Ya se está guardando una venta, ignorando...');
            return;
        }

        // Agregar la fecha y método de pago a la venta
        // 🔧 Formatear fecha en zona horaria local para evitar cambios de día
        let fechaFormateada;
        if (fechaSeleccionada) {
            const year = fechaSeleccionada.getFullYear();
            const month = String(fechaSeleccionada.getMonth() + 1).padStart(2, '0');
            const day = String(fechaSeleccionada.getDate()).padStart(2, '0');
            const hours = String(fechaSeleccionada.getHours()).padStart(2, '0');
            const minutes = String(fechaSeleccionada.getMinutes()).padStart(2, '0');
            const seconds = String(fechaSeleccionada.getSeconds()).padStart(2, '0');
            fechaFormateada = `${year}-${month}-${day}T${hours}:${minutes}:${seconds}`;
        } else {
            fechaFormateada = new Date().toISOString();
        }

        const ventaConDatos = {
            ...ventaTemporal,
            fecha: fechaFormateada,
            metodo_pago: metodoPago || 'EFECTIVO'
        };



        try {
            // 🆕 Marcar que está guardando
            window.__guardandoVenta = true;
            console.log('💾 Guardando venta...');

            const ventaGuardada = await guardarVenta(ventaConDatos);

            console.log('✅ Venta guardada:', ventaGuardada.id);

            // 🆕 ACTUALIZAR STOCK EN TIEMPO REAL
            // Restar las cantidades vendidas del stock local
            const nuevoStock = { ...stockCargue };
            Object.keys(carrito).forEach(productoId => {
                const producto = productos.find(p => p.id === parseInt(productoId));
                if (producto) {
                    const nombreProducto = producto.nombre.toUpperCase();
                    const cantidadVendida = carrito[productoId];
                    const stockActual = nuevoStock[nombreProducto] || 0;
                    nuevoStock[nombreProducto] = Math.max(0, stockActual - cantidadVendida);
                    console.log(`📉 Stock actualizado: ${nombreProducto}: ${stockActual} -> ${nuevoStock[nombreProducto]}`);
                }
            });
            setStockCargue(nuevoStock);

            // Cerrar modal inmediatamente
            setMostrarResumen(false);

            // Actualizar contador de pendientes en segundo plano (no bloquea)
            verificarPendientes();

            // Preparar opciones del alert
            const alertOptions = [
                {
                    text: 'Cerrar',
                    onPress: () => limpiarVenta(),
                    style: 'cancel'
                }
            ];

            // Agregar opción de imprimir
            alertOptions.unshift({
                text: 'Imprimir',
                onPress: async () => {
                    await imprimirTicket(ventaGuardada);
                    limpiarVenta();
                }
            });

            // Agregar opción de WhatsApp si se proporcionó número
            if (opcionesEnvio?.whatsapp) {
                alertOptions.push({
                    text: 'WhatsApp',
                    onPress: () => {
                        enviarFacturaWhatsApp(ventaGuardada, opcionesEnvio.whatsapp);
                    }
                });
            }

            // Agregar opción de Correo si se proporcionó
            if (opcionesEnvio?.correo) {
                alertOptions.push({
                    text: 'Correo',
                    onPress: () => {
                        enviarFacturaCorreo(ventaGuardada, opcionesEnvio.correo);
                    }
                });
            }

            // 🆕 Usar setTimeout para asegurar que el modal se cierre antes de lanzar el Alert
            setTimeout(() => {
                Alert.alert(
                    'Venta Completada',
                    `Venta ${ventaGuardada.id} guardada exitosamente\nTotal: ${formatearMoneda(ventaConDatos.total)}\nMétodo: ${metodoPago}`,
                    alertOptions
                );
            }, 500);

            // 🆕 Actualizar contador de ventas del día
            setTotalVentasHoy(prev => prev + 1);
            setTotalDineroHoy(prev => prev + ventaConDatos.total);
        } catch (error) {
            console.error('❌ Error en confirmarVenta:', error);
            Alert.alert('Error', 'No se pudo guardar la venta');
        } finally {
            // 🆕 Liberar el flag cuando termine (éxito o error)
            window.__guardandoVenta = false;
            console.log('🔓 Venta procesada, flag liberado');
        }
    };

    // Enviar ticket PDF por WhatsApp (abre directamente al número)
    const enviarFacturaWhatsApp = async (venta, numero) => {
        try {
            // Generar el PDF del ticket
            const { generarTicketPDF } = require('../../services/printerService');
            const pdfUri = await generarTicketPDF(venta);

            // Formatear número (agregar código de país si no lo tiene)
            let numeroFormateado = numero.replace(/\D/g, '');
            if (!numeroFormateado.startsWith('57')) {
                numeroFormateado = '57' + numeroFormateado;
            }

            // Abrir WhatsApp con el número específico
            const whatsappUrl = `whatsapp://send?phone=${numeroFormateado}`;

            // Primero compartir el PDF
            const Sharing = require('expo-sharing');
            if (await Sharing.isAvailableAsync()) {
                await Sharing.shareAsync(pdfUri, {
                    mimeType: 'application/pdf',
                    dialogTitle: 'Enviar ticket'
                });
            }

            limpiarVenta();
        } catch (error) {
            console.error('Error al enviar por WhatsApp:', error);
            Alert.alert('Error', 'No se pudo generar el ticket para enviar');
        }
    };

    // Enviar ticket por correo electrónico
    const enviarFacturaCorreo = async (venta, correo) => {
        try {
            // Generar el PDF del ticket
            const { generarTicketPDF } = require('../../services/printerService');
            const pdfUri = await generarTicketPDF(venta);

            // Crear el asunto y cuerpo del correo
            const asunto = `Factura de Venta #${venta.id} - Arepas El Guerrero`;
            const cuerpo = `Adjunto encontrará la factura de su compra.\n\nTotal: $${formatearMoneda(venta.total)}\nFecha: ${new Date(venta.fecha).toLocaleDateString()}\n\n¡Gracias por su compra!`;

            // Abrir cliente de correo con el PDF adjunto
            const mailUrl = `mailto:${correo}?subject=${encodeURIComponent(asunto)}&body=${encodeURIComponent(cuerpo)}`;

            // Primero intentar abrir el correo
            const canOpen = await Linking.canOpenURL(mailUrl);
            if (canOpen) {
                await Linking.openURL(mailUrl);
            }

            // Luego compartir el PDF para que pueda adjuntarlo
            const Sharing = require('expo-sharing');
            if (await Sharing.isAvailableAsync()) {
                await Sharing.shareAsync(pdfUri, {
                    mimeType: 'application/pdf',
                    dialogTitle: 'Adjuntar ticket al correo'
                });
            }

            limpiarVenta();
        } catch (error) {
            console.error('Error al enviar por correo:', error);
            Alert.alert('Error', 'No se pudo enviar por correo');
        }
    };

    // Limpiar venta
    const limpiarVenta = () => {
        setCarrito({});
        setDescuento(0);
        setCarrito({});
        setDescuento(0);
        setVencidas([]);
        setFotoVencidas(null);
        setVentaTemporal(null);
        setMostrarResumen(false);
        setNota('');
        setBusquedaProducto('');
    };

    // Manejar selección de cliente
    const handleSeleccionarCliente = (cliente) => {
        setClienteSeleccionado(cliente);
    };

    // Manejar cliente guardado
    const handleClienteGuardado = async (nuevoCliente) => {
        setClienteSeleccionado(nuevoCliente);
        // Recargar lista de clientes
        const clientesData = await obtenerClientes();
        setClientes(clientesData);
    };

    // Manejar vencidas
    const handleGuardarVencidas = (productosVencidos, foto) => {
        setVencidas(productosVencidos);
        setFotoVencidas(foto);
    };

    // 🆕 Manejar cerrar turno
    const handleCerrarTurno = async () => {
        try {
            // 🔧 CORREGIDO: Usar fechaSeleccionada en lugar de fecha actual
            const fechaFormateada = fechaSeleccionada.toISOString().split('T')[0];

            console.log(`🔒 CERRAR TURNO - Fecha: ${fechaFormateada}, Vendedor: ${userId}`);
            console.log(`   Vencidas a reportar:`, vencidas);

            // Preparar productos vencidos en formato correcto
            const productosVencidosFormateados = vencidas.map(item => ({
                producto: item.nombre,
                cantidad: item.cantidad
            }));

            console.log(`   Productos formateados:`, productosVencidosFormateados);

            // Mostrar confirmación
            Alert.alert(
                '🔒 Cerrar Turno',
                `¿Estás seguro de cerrar el turno del día?\n\nVentas: ${totalVentasHoy}\nTotal: ${formatearMoneda(totalDineroHoy)}\n\nEsta acción calculará las devoluciones automáticamente.`,
                [
                    {
                        text: 'Cancelar',
                        style: 'cancel'
                    },
                    {
                        text: 'Cerrar Turno',
                        style: 'destructive',
                        onPress: async () => {
                            try {
                                console.log(`📤 Enviando a ${ENDPOINTS.CERRAR_TURNO}`);

                                // 🆕 Llamar al endpoint usando config centralizado
                                const response = await fetch(ENDPOINTS.CERRAR_TURNO, {
                                    method: 'POST',
                                    headers: {
                                        'Content-Type': 'application/json',
                                    },
                                    body: JSON.stringify({
                                        id_vendedor: userId,
                                        fecha: fechaFormateada, // 🔧 CORREGIDO
                                        productos_vencidos: productosVencidosFormateados
                                    })
                                });

                                const data = await response.json();
                                console.log(`📥 Respuesta:`, data);

                                if (data.success) {
                                    // Mostrar resumen
                                    const resumenTexto = data.resumen.map(item =>
                                        `${item.producto}:\n` +
                                        `  Cargado: ${item.cargado}\n` +
                                        `  Vendido: ${item.vendido}\n` +
                                        `  Vencidas: ${item.vencidas}\n` +
                                        `  Devuelto: ${item.devuelto}`
                                    ).join('\n\n');

                                    Alert.alert(
                                        '✅ Turno Cerrado',
                                        `Resumen del día:\n\n${resumenTexto}\n\n` +
                                        `📊 TOTALES:\n` +
                                        `Cargado: ${data.totales.cargado}\n` +
                                        `Vendido: ${data.totales.vendido}\n` +
                                        `Vencidas: ${data.totales.vencidas}\n` +
                                        `Devuelto: ${data.totales.devuelto}\n\n` +
                                        `✅ Datos enviados al CRM`
                                    );

                                    // Limpiar ventas del día
                                    setTotalVentasHoy(0);
                                    setTotalDineroHoy(0);
                                    setVencidas([]);
                                    setMostrarModalCerrarTurno(false);

                                    // 🆕 Marcar turno como cerrado
                                    setTurnoAbierto(false);
                                    setHoraTurno(null);

                                    // 🆕 Limpiar stock local (turno cerrado)
                                    setStockCargue({});
                                } else if (data.error === 'TURNO_YA_CERRADO') {
                                    // 🆕 Turno ya fue cerrado anteriormente
                                    Alert.alert(
                                        '⚠️ Turno Ya Cerrado',
                                        'El turno para este día ya fue cerrado anteriormente.\n\nNo se pueden enviar devoluciones duplicadas.'
                                    );
                                    setMostrarModalCerrarTurno(false);
                                    setTurnoAbierto(false);
                                    setHoraTurno(null);
                                    setStockCargue({}); // Limpiar stock
                                } else {
                                    Alert.alert('Error', data.error || 'No se pudo cerrar el turno');
                                }
                            } catch (error) {
                                console.error('Error cerrando turno:', error);
                                Alert.alert('Error', 'No se pudo conectar con el servidor');
                            }
                        }
                    }
                ]
            );
        } catch (error) {
            console.error('Error:', error);
            Alert.alert('Error', 'Ocurrió un error inesperado');
        }
    };

    // Renderizar producto
    const renderProducto = ({ item }) => {
        const cantidad = getCantidad(item.id);
        const subtotalProducto = item.precio * cantidad;

        // 🆕 Obtener stock del cargue
        const stock = stockCargue[item.nombre.toUpperCase()] || 0;

        return (
            <View style={styles.productoItem}>
                <View style={styles.productoInfo}>
                    <Text style={styles.productoNombre}>{item.nombre}</Text>
                    <Text style={styles.productoPrecio}>
                        Precio: {formatearMoneda(item.precio)}
                        {stock > 0 && <Text style={styles.stockTexto}>({stock})</Text>}
                    </Text>
                    {cantidad > 0 && (
                        <Text style={styles.productoSubtotal}>
                            Total: {formatearMoneda(subtotalProducto)}
                        </Text>
                    )}
                </View>

                <View style={styles.cantidadControl}>
                    <TouchableOpacity
                        style={[styles.btnCantidad, cantidad === 0 && styles.btnDeshabilitado]}
                        onPress={() => actualizarCantidad(item.id, cantidad - 1)}
                        disabled={cantidad === 0}
                    >
                        <Ionicons name="remove" size={20} color={cantidad === 0 ? '#ccc' : 'white'} />
                    </TouchableOpacity>

                    <TextInput
                        style={styles.inputCantidad}
                        value={String(cantidad)}
                        onChangeText={(texto) => {
                            const num = parseInt(texto) || 0;
                            actualizarCantidad(item.id, num);
                        }}
                        keyboardType="numeric"
                        selectTextOnFocus
                    />

                    <TouchableOpacity
                        style={styles.btnCantidad}
                        onPress={() => actualizarCantidad(item.id, cantidad + 1)}
                    >
                        <Ionicons name="add" size={20} color="white" />
                    </TouchableOpacity>
                </View>
            </View>
        );
    };

    return (
        <View style={styles.container}>
            {/* 🆕 Pantalla de carga mientras verifica turno */}
            {verificandoTurno && (
                <View style={styles.cargandoOverlay}>
                    <View style={styles.cargandoContainer}>
                        <Ionicons name="time-outline" size={48} color="#003d88" />
                        <Text style={styles.cargandoTexto}>Verificando turno...</Text>
                    </View>
                </View>
            )}

            {/* Indicador de ventas pendientes */}
            {ventasPendientes > 0 && (
                <TouchableOpacity
                    style={styles.pendientesBar}
                    onPress={onRefresh}
                >
                    <Ionicons name="cloud-upload-outline" size={16} color="white" />
                    <Text style={styles.pendientesText}>
                        {ventasPendientes} venta{ventasPendientes > 1 ? 's' : ''} pendiente{ventasPendientes > 1 ? 's' : ''} de sincronizar
                    </Text>
                    <Ionicons name="refresh" size={16} color="white" />
                </TouchableOpacity>
            )}

            {/* 🆕 Indicador de Turno - ENCIMA del cliente */}
            {turnoAbierto && (
                <View style={styles.turnoIndicador}>
                    <View style={styles.turnoIndicadorContent}>
                        <View style={styles.puntoVerde} />
                        <Text style={styles.turnoTexto}>
                            Turno Abierto
                        </Text>
                        {horaTurno && (
                            <Text style={styles.turnoHora}>
                                desde {horaTurno.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' })}
                            </Text>
                        )}
                    </View>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                        <Text style={styles.turnoDia}>
                            {diaSeleccionado} • {fechaSeleccionada?.toLocaleDateString('es-ES', { day: 'numeric', month: 'short' })}
                        </Text>
                        {/* 🆕 Botón para cambiar de día */}
                        <TouchableOpacity
                            onPress={() => {
                                Alert.alert(
                                    '🔄 Cambiar Día',
                                    '¿Quieres seleccionar otro día?\n\nEsto NO cerrará el turno actual, solo te permite cambiar.',
                                    [
                                        { text: 'Cancelar', style: 'cancel' },
                                        {
                                            text: 'Cambiar',
                                            onPress: () => {
                                                // Limpiar estado local y mostrar selector
                                                setTurnoAbierto(false);
                                                setHoraTurno(null);
                                                setDiaSeleccionado(null);
                                                setMostrarSelectorDia(true);
                                            }
                                        }
                                    ]
                                );
                            }}
                            style={styles.btnCambiarDia}
                        >
                            <Ionicons name="calendar-outline" size={16} color="#003d88" />
                        </TouchableOpacity>
                    </View>
                </View>
            )}

            {/* Indicador de turno cerrado */}
            {!turnoAbierto && !mostrarSelectorDia && !verificandoTurno && (
                <View style={[styles.turnoIndicador, styles.turnoCerrado]}>
                    <View style={styles.turnoIndicadorContent}>
                        <View style={styles.puntoGris} />
                        <Text style={[styles.turnoTexto, { color: '#666' }]}>
                            Sin turno activo
                        </Text>
                    </View>
                    <TouchableOpacity
                        onPress={() => setMostrarSelectorDia(true)}
                        style={styles.btnAbrirTurno}
                    >
                        <Text style={styles.btnAbrirTurnoTexto}>Abrir Turno</Text>
                    </TouchableOpacity>
                </View>
            )}

            {/* Header - Cliente */}
            <View style={styles.headerCliente}>
                <TouchableOpacity
                    style={styles.clienteSelector}
                    onPress={() => setMostrarSelectorCliente(true)}
                >
                    <Ionicons name="person" size={20} color="#003d88" />
                    <View style={styles.clienteInfo}>
                        <Text style={styles.clienteNombre}>
                            {clienteSeleccionado?.negocio || 'Seleccionar Cliente'}
                        </Text>
                        {clienteSeleccionado?.nombre && (
                            <Text style={styles.clienteDetalle}>
                                👤 {clienteSeleccionado.nombre}
                            </Text>
                        )}
                        <Text style={styles.clienteDetalle}>
                            📞 {clienteSeleccionado?.celular || 'Sin teléfono'}
                        </Text>
                        <Text style={styles.clienteDetalle}>
                            📍 {clienteSeleccionado?.direccion || 'Sin dirección'}
                        </Text>
                    </View>
                    <Ionicons name="chevron-forward" size={20} color="#003d88" />
                </TouchableOpacity>
            </View>

            {/* Botones Acciones: Vencidas + Cerrar Turno */}
            <View style={styles.botonesAccionesContainer}>
                {/* Botón Vencidas */}
                <TouchableOpacity
                    style={[styles.btnAccion, styles.btnVencidas]}
                    onPress={() => setMostrarVencidas(true)}
                >
                    <Ionicons name="alert-circle" size={18} color="white" />
                    <Text style={styles.btnAccionTexto}>Vencidas</Text>
                    {vencidas.length > 0 && (
                        <View style={styles.badgeAccion}>
                            <Text style={styles.badgeTexto}>
                                {vencidas.reduce((sum, p) => sum + p.cantidad, 0)}
                            </Text>
                        </View>
                    )}
                </TouchableOpacity>

                {/* 🆕 Botón Cerrar Turno (pequeño) */}
                <TouchableOpacity
                    style={[styles.btnAccion, styles.btnCerrarPequeño]}
                    onPress={() => setMostrarModalCerrarTurno(true)}
                >
                    <Ionicons name="lock-closed" size={18} color="white" />
                    <Text style={styles.btnAccionTexto}>Cerrar</Text>
                </TouchableOpacity>
            </View>

            {/* Búsqueda de productos */}
            <View style={styles.busquedaContainer}>
                <Ionicons name="search" size={20} color="#666" style={styles.iconoBusqueda} />
                <TextInput
                    style={styles.inputBusqueda}
                    placeholder="Buscar producto..."
                    value={busquedaProducto}
                    onChangeText={setBusquedaProducto}
                    autoCapitalize="characters"
                />
                {busquedaProducto.length > 0 && (
                    <TouchableOpacity onPress={() => setBusquedaProducto('')}>
                        <Ionicons name="close-circle" size={20} color="#666" />
                    </TouchableOpacity>
                )}
            </View>

            {/* Lista de productos - Arrastra hacia abajo para sincronizar */}
            <FlatList
                data={productosFiltrados}
                renderItem={renderProducto}
                keyExtractor={(item) => String(item.id)}
                style={styles.listaProductos}
                contentContainerStyle={styles.listaContent}
                refreshControl={
                    <RefreshControl
                        refreshing={refreshing}
                        onRefresh={onRefresh}
                        colors={['#003d88']}
                        tintColor="#003d88"
                        title="Sincronizando productos..."
                        titleColor="#666"
                    />
                }
                ListEmptyComponent={
                    <View style={styles.emptyContainer}>
                        <Ionicons name="search-outline" size={48} color="#ccc" />
                        <Text style={styles.emptyText}>No se encontraron productos</Text>
                        <Text style={styles.emptySubtext}>Arrastra hacia abajo para sincronizar</Text>
                    </View>
                }
            />

            {/* Resumen y botón */}
            <View style={styles.footer}>
                <TouchableOpacity
                    style={[
                        styles.btnCompletar,
                        (Object.keys(carrito).filter(id => carrito[id] > 0).length === 0 && vencidas.length === 0) && styles.btnDeshabilitado
                    ]}
                    onPress={completarVenta}
                    disabled={Object.keys(carrito).filter(id => carrito[id] > 0).length === 0 && vencidas.length === 0}
                >
                    <Ionicons name="checkmark-circle" size={24} color="white" style={styles.iconoBoton} />
                    <Text style={styles.btnCompletarTexto}>
                        COMPLETAR VENTA {formatearMoneda(total)}
                    </Text>
                </TouchableOpacity>
            </View>

            {/* Modal Selección de Día */}
            <Modal
                visible={mostrarSelectorDia}
                animationType="fade"
                transparent={true}
            >
                <View style={styles.modalDiaOverlay}>
                    <View style={styles.modalDiaContainer}>
                        <View style={styles.modalDiaHeader}>
                            <Ionicons name="calendar" size={32} color="#003d88" />
                            <Text style={styles.modalDiaTitulo}>Selecciona el Día</Text>
                            <Text style={styles.modalDiaSubtitulo}>¿Qué día vas a trabajar?</Text>
                        </View>

                        <View style={styles.modalDiaBotones}>
                            {DIAS_SEMANA.map((dia) => {
                                const esHoy = dia === getDiaActual();
                                return (
                                    <TouchableOpacity
                                        key={dia}
                                        style={[
                                            styles.modalDiaBoton,
                                            esHoy && styles.modalDiaBotonHoy
                                        ]}
                                        onPress={() => handleSeleccionarDia(dia)}
                                    >
                                        <Text style={[
                                            styles.modalDiaBotonTexto,
                                            esHoy && styles.modalDiaBotonTextoHoy
                                        ]}>
                                            {dia}
                                        </Text>
                                        {esHoy && (
                                            <Text style={styles.modalDiaHoyLabel}>HOY</Text>
                                        )}
                                    </TouchableOpacity>
                                );
                            })}
                        </View>
                    </View>
                </View>
            </Modal>

            {/* 🆕 DatePicker para Seleccionar Fecha */}
            {mostrarDatePicker && (
                <DateTimePicker
                    value={fechaSeleccionada}
                    mode="date"
                    display={Platform.OS === 'ios' ? 'spinner' : 'default'}
                    onChange={handleConfirmarFecha}
                    maximumDate={new Date(2030, 11, 31)}
                    minimumDate={new Date(2020, 0, 1)}
                />
            )}

            {/* Modales */}
            <ClienteSelector
                visible={mostrarSelectorCliente}
                onClose={() => setMostrarSelectorCliente(false)}
                onSelectCliente={handleSeleccionarCliente}
                onNuevoCliente={() => {
                    setMostrarSelectorCliente(false);
                    setMostrarModalCliente(true);
                }}
                userId={userId}
                diaSeleccionado={diaSeleccionado}
            />

            <ClienteModal
                visible={mostrarModalCliente}
                onClose={() => setMostrarModalCliente(false)}
                onClienteGuardado={handleClienteGuardado}
                vendedorId={userId}
            />



            <DevolucionesVencidas
                visible={mostrarVencidas}
                onClose={() => setMostrarVencidas(false)}
                onGuardar={handleGuardarVencidas}
                tipo="vencidas"
                datosGuardados={vencidas}
                fotosGuardadas={fotoVencidas}
                userId={userId}
                fechaSeleccionada={fechaSeleccionada}
            />

            <ResumenVentaModal
                visible={mostrarResumen}
                onClose={() => setMostrarResumen(false)}
                onConfirmar={confirmarVenta}
                venta={ventaTemporal}
            />

            {/* Modal Cerrar Turno */}
            <Modal
                visible={mostrarModalCerrarTurno}
                animationType="fade"
                transparent={true}
            >
                <View style={styles.modalOverlay}>
                    <View style={styles.modalCerrarTurno}>
                        <View style={styles.modalCerrarHeader}>
                            <Ionicons name="lock-closed" size={40} color="#dc3545" />
                            <Text style={styles.modalCerrarTitulo}>🔒 Cerrar Turno del Día</Text>
                        </View>

                        <View style={styles.modalCerrarBody}>
                            <Text style={styles.modalCerrarText}>¿Estás seguro de cerrar el turno?</Text>
                            <Text style={styles.modalCerrarSubtext}>Esta acción calculará automáticamente las devoluciones.</Text>

                            {totalVentasHoy > 0 && (
                                <View style={styles.modalCerrarResumen}>
                                    <View style={styles.modalCerrarFila}>
                                        <Text style={styles.modalCerrarLabel}>Ventas realizadas:</Text>
                                        <Text style={styles.modalCerrarValor}>{totalVentasHoy}</Text>
                                    </View>
                                    <View style={styles.modalCerrarFila}>
                                        <Text style={styles.modalCerrarLabel}>Total vendido:</Text>
                                        <Text style={styles.modalCerrarValor}>{formatearMoneda(totalDineroHoy)}</Text>
                                    </View>
                                </View>
                            )}
                        </View>

                        <View style={styles.modalCerrarBotones}>
                            <TouchableOpacity
                                style={[styles.modalCerrarBtn, styles.modalCancelarBtn]}
                                onPress={() => setMostrarModalCerrarTurno(false)}
                            >
                                <Text style={styles.modalCancelarTexto}>Cancelar</Text>
                            </TouchableOpacity>

                            <TouchableOpacity
                                style={[styles.modalCerrarBtn, styles.modalConfirmarBtn]}
                                onPress={() => {
                                    setMostrarModalCerrarTurno(false);
                                    handleCerrarTurno();
                                }}
                            >
                                <Ionicons name="lock-closed" size={18} color="white" />
                                <Text style={styles.modalConfirmarTexto}>Cerrar Turno</Text>
                            </TouchableOpacity>
                        </View>
                    </View>
                </View>
            </Modal>
        </View>
    );
};

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: '#f5f5f5',
        paddingTop: Platform.OS === 'android' ? StatusBar.currentHeight : 0,
    },
    headerCliente: {
        backgroundColor: 'white',
        padding: 15,
        borderBottomWidth: 1,
        borderBottomColor: '#e0e0e0',
    },
    clienteSelector: {
        flexDirection: 'row',
        alignItems: 'center',
        padding: 10,
        backgroundColor: '#f0f8ff',
        borderRadius: 8,
        borderWidth: 1,
        borderColor: '#003d88',
    },
    clienteInfo: {
        marginLeft: 10,
        flex: 1,
    },
    clienteNombre: {
        fontSize: 16,
        fontWeight: 'bold',
        color: '#003d88',
    },
    clienteDetalle: {
        fontSize: 12,
        color: '#666',
        marginTop: 2,
    },
    busquedaContainer: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: 'white',
        padding: 10,
        borderBottomWidth: 1,
        borderBottomColor: '#e0e0e0',
    },
    iconoBusqueda: {
        marginRight: 8,
    },
    inputBusqueda: {
        flex: 1,
        fontSize: 16,
        padding: 8,
    },
    listaProductos: {
        flex: 1,
    },
    listaContent: {
        padding: 10,
    },
    productoItem: {
        flexDirection: 'row',
        backgroundColor: 'white',
        padding: 12,
        marginBottom: 8,
        borderRadius: 8,
        borderWidth: 1,
        borderColor: '#66b3ff',
        elevation: 1,
    },
    productoInfo: {
        flex: 1,
    },
    productoNombre: {
        fontSize: 13,
        fontWeight: 'bold',
        color: '#333',
        marginBottom: 4,
    },
    productoPrecio: {
        fontSize: 12,
        color: '#666',
    },
    stockTexto: {
        fontSize: 12,
        color: '#666',
        fontWeight: 'normal',
    },
    productoSubtotal: {
        fontSize: 13,
        fontWeight: 'bold',
        color: '#00ad53',
        marginTop: 4,
    },
    cantidadControl: {
        flexDirection: 'row',
        alignItems: 'center',
    },
    btnCantidad: {
        backgroundColor: '#00ad53',
        borderRadius: 6,
        padding: 8,
        width: 36,
        height: 36,
        justifyContent: 'center',
        alignItems: 'center',
    },
    btnDeshabilitado: {
        backgroundColor: '#ccc',
    },
    inputCantidad: {
        width: 50,
        textAlign: 'center',
        fontSize: 16,
        fontWeight: 'bold',
        marginHorizontal: 8,
        borderBottomWidth: 1,
        borderBottomColor: '#66b3ff',
        paddingVertical: 4,
    },
    emptyContainer: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
        paddingVertical: 40,
    },
    emptyText: {
        fontSize: 16,
        color: '#999',
        marginTop: 10,
    },
    emptySubtext: {
        fontSize: 12,
        color: '#bbb',
        marginTop: 5,
    },
    pendientesBar: {
        backgroundColor: '#ff9800',
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 8,
        gap: 8,
    },
    pendientesText: {
        color: 'white',
        fontSize: 12,
        fontWeight: 'bold',
        marginTop: 10,
    },
    footer: {
        backgroundColor: 'white',
        borderTopWidth: 1,
        borderTopColor: '#e0e0e0',
        padding: 15,
        paddingBottom: Platform.OS === 'android' ? 40 : 15,
    },
    btnCompletar: {
        backgroundColor: '#00ad53',
        flexDirection: 'row',
        justifyContent: 'center',
        alignItems: 'center',
        padding: 15,
        borderRadius: 10,
    },
    iconoBoton: {
        marginRight: 8,
    },
    btnCompletarTexto: {
        color: 'white',
        fontSize: 16,
        fontWeight: 'bold',
    },
    botonesAccionesContainer: {
        flexDirection: 'row',
        backgroundColor: 'white',
        padding: 10,
        gap: 10,
        borderBottomWidth: 1,
        borderBottomColor: '#e0e0e0',
    },
    btnAccion: {
        flex: 1,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 12,
        borderRadius: 8,
        gap: 6,
    },
    btnVencidas: {
        backgroundColor: '#ff6b6b',
    },
    btnAccionTexto: {
        color: 'white',
        fontSize: 14,
        fontWeight: 'bold',
    },
    badgeAccion: {
        backgroundColor: 'rgba(255, 255, 255, 0.3)',
        borderRadius: 12,
        paddingHorizontal: 8,
        paddingVertical: 2,
        marginLeft: 4,
    },
    badgeTexto: {
        color: 'white',
        fontSize: 12,
        fontWeight: 'bold',
    },
    // 🆕 Estilos botón Cerrar Turno pequeño
    btnCerrarPequeño: {
        backgroundColor: '#dc3545',
    },
    // 🆕 Estilos sección cerrar turno (expandida)
    seccionCerrarTurno: {
        marginTop: 15,
        backgroundColor: '#fff3cd',
        borderRadius: 10,
        padding: 15,
        borderWidth: 2,
        borderColor: '#dc3545',
    },
    resumenDia: {
        marginBottom: 12,
    },
    resumenTitulo: {
        fontSize: 16,
        fontWeight: 'bold',
        color: '#dc3545',
        marginBottom: 8,
    },
    resumenFila: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        marginVertical: 4,
    },
    resumenLabel: {
        fontSize: 14,
        color: '#666',
    },
    resumenValor: {
        fontSize: 14,
        fontWeight: 'bold',
        color: '#333',
    },
    btnCerrarTurnoGrande: {
        backgroundColor: '#dc3545',
        flexDirection: 'row',
        justifyContent: 'center',
        alignItems: 'center',
        padding: 15,
        borderRadius: 10,
        gap: 8,
    },
    btnCerrarTurnoTexto: {
        color: 'white',
        fontSize: 16,
        fontWeight: 'bold',
    },
    // Estilos Modal Selección de Día
    modalDiaOverlay: {
        flex: 1,
        backgroundColor: 'rgba(0, 0, 0, 0.6)',
        justifyContent: 'center',
        alignItems: 'center',
        padding: 20,
    },
    modalDiaContainer: {
        backgroundColor: 'white',
        borderRadius: 16,
        padding: 20,
        width: '90%',
        maxWidth: 320,
        elevation: 10,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.3,
        shadowRadius: 8,
    },
    modalDiaHeader: {
        alignItems: 'center',
        marginBottom: 15,
    },
    modalDiaTitulo: {
        fontSize: 20,
        fontWeight: 'bold',
        color: '#003d88',
        marginTop: 10,
    },
    modalDiaSubtitulo: {
        fontSize: 12,
        color: '#666',
        marginTop: 3,
    },
    modalDiaBotones: {
        gap: 8,
    },
    modalDiaBoton: {
        backgroundColor: '#f0f8ff',
        padding: 12,
        borderRadius: 10,
        borderWidth: 1.5,
        borderColor: '#003d88',
        flexDirection: 'row',
        justifyContent: 'center',
        alignItems: 'center',
    },
    modalDiaBotonHoy: {
        backgroundColor: '#003d88',
    },
    modalDiaBotonTexto: {
        fontSize: 14,
        fontWeight: 'bold',
        color: '#003d88',
    },
    modalDiaBotonTextoHoy: {
        color: 'white',
    },
    modalDiaHoyLabel: {
        backgroundColor: '#00ad53',
        color: 'white',
        fontSize: 10,
        fontWeight: 'bold',
        paddingHorizontal: 8,
        paddingVertical: 2,
        borderRadius: 10,
        marginLeft: 10,
    },
    // Estilos Modal Cerrar Turno
    modalOverlay: {
        flex: 1,
        backgroundColor: 'rgba(0, 0, 0, 0.5)',
        justifyContent: 'center',
        alignItems: 'center',
        padding: 20,
    },
    modalCerrarTurno: {
        backgroundColor: 'white',
        borderRadius: 16,
        padding: 20,
        width: '90%',
        maxWidth: 400,
    },
    modalCerrarHeader: {
        alignItems: 'center',
        marginBottom: 20,
    },
    modalCerrarTitulo: {
        fontSize: 18,
        fontWeight: 'bold',
        color: '#dc3545',
        marginTop: 10,
        textAlign: 'center',
    },
    modalCerrarBody: {
        marginBottom: 20,
    },
    modalCerrarText: {
        fontSize: 16,
        color: '#333',
        textAlign: 'center',
        marginBottom: 8,
    },
    modalCerrarSubtext: {
        fontSize: 13,
        color: '#666',
        textAlign: 'center',
        marginBottom: 15,
    },
    modalCerrarResumen: {
        backgroundColor: '#f8f9fa',
        padding: 15,
        borderRadius: 8,
        borderWidth: 1,
        borderColor: '#dee2e6',
    },
    modalCerrarFila: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        marginVertical: 5,
    },
    modalCerrarLabel: {
        fontSize: 14,
        color: '#666',
    },
    modalCerrarValor: {
        fontSize: 14,
        fontWeight: 'bold',
        color: '#333',
    },
    modalCerrarBotones: {
        flexDirection: 'row',
        gap: 10,
    },
    modalCerrarBtn: {
        flex: 1,
        flexDirection: 'row',
        justifyContent: 'center',
        alignItems: 'center',
        padding: 15,
        borderRadius: 8,
        gap: 6,
    },
    modalCancelarBtn: {
        backgroundColor: '#6c757d',
    },
    modalCancelarTexto: {
        color: 'white',
        fontSize: 15,
        fontWeight: 'bold',
    },
    modalConfirmarBtn: {
        backgroundColor: '#dc3545',
    },
    modalConfirmarTexto: {
        color: 'white',
        fontSize: 15,
        fontWeight: 'bold',
    },
    // 🆕 Estilos para indicador de turno
    turnoIndicador: {
        backgroundColor: '#ecfdf5',
        paddingHorizontal: 16,
        paddingVertical: 10,
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        borderBottomWidth: 1,
        borderBottomColor: '#d1fae5',
    },
    turnoCerrado: {
        backgroundColor: '#f3f4f6',
        borderBottomColor: '#e5e7eb',
    },
    turnoIndicadorContent: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
    },
    puntoVerde: {
        width: 10,
        height: 10,
        borderRadius: 5,
        backgroundColor: '#22c55e',
    },
    puntoGris: {
        width: 10,
        height: 10,
        borderRadius: 5,
        backgroundColor: '#9ca3af',
    },
    turnoTexto: {
        fontSize: 14,
        fontWeight: '600',
        color: '#166534',
    },
    turnoHora: {
        fontSize: 12,
        color: '#16a34a',
    },
    turnoDia: {
        fontSize: 12,
        fontWeight: '500',
        color: '#059669',
    },
    // 🆕 Estilos para pantalla de carga
    cargandoOverlay: {
        position: 'absolute',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        backgroundColor: 'rgba(255, 255, 255, 0.95)',
        justifyContent: 'center',
        alignItems: 'center',
        zIndex: 1000,
    },
    cargandoContainer: {
        backgroundColor: 'white',
        padding: 30,
        borderRadius: 16,
        alignItems: 'center',
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.1,
        shadowRadius: 8,
        elevation: 4,
    },
    cargandoTexto: {
        marginTop: 12,
        fontSize: 16,
        color: '#003d88',
        fontWeight: '500',
    },
    // 🆕 Estilos para botones de turno
    btnCambiarDia: {
        padding: 6,
        backgroundColor: '#e0f2fe',
        borderRadius: 6,
    },
    btnAbrirTurno: {
        paddingHorizontal: 12,
        paddingVertical: 6,
        backgroundColor: '#003d88',
        borderRadius: 6,
    },
    btnAbrirTurnoTexto: {
        color: 'white',
        fontSize: 12,
        fontWeight: '600',
    },
});

export default VentasScreen;
