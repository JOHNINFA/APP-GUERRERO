import React, { useState, useEffect } from 'react';
import { View, Text, TextInput, TouchableOpacity, FlatList, StyleSheet, Alert, SafeAreaView, StatusBar, Platform, RefreshControl, Modal, Linking, ScrollView } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import DateTimePicker from '@react-native-community/datetimepicker'; // 🆕 Import DatePicker
import ClienteSelector from './ClienteSelector';
import ClienteModal from './ClienteModal';
import DevolucionesVencidas from './DevolucionesVencidas';
import ResumenVentaModal from './ResumenVentaModal';
import { ConfirmarEntregaModal } from './ConfirmarEntregaModal'; // 🆕 Importar modal
import {
    obtenerProductos,
    buscarProductos,
    obtenerClientes,
    calcularSubtotal,
    guardarVenta,
    formatearMoneda,
    sincronizarProductos,
    sincronizarVentasPendientes,
    obtenerVentasPendientes,
    obtenerVentas  // 🆕 Agregar para contar ventas del día
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
    const [pedidoClienteSeleccionado, setPedidoClienteSeleccionado] = useState(null); // 🆕 Pedido del cliente actual
    const [busquedaProducto, setBusquedaProducto] = useState('');
    const [productos, setProductos] = useState([]);
    const [categorias, setCategorias] = useState([]);
    const [carrito, setCarrito] = useState({});
    const [descuento, setDescuento] = useState(0); // Restaurado

    // 🆕 Estados para Pedidos Asignados
    const [pedidosPendientes, setPedidosPendientes] = useState([]);
    const [modalPedidosVisible, setModalPedidosVisible] = useState(false);

    // 🆕 Estados para Novedades (No Entregado)
    const [modalNovedadVisible, setModalNovedadVisible] = useState(false);
    const [motivoNovedad, setMotivoNovedad] = useState('');
    const [ventasDelDia, setVentasDelDia] = useState([]); // 🆕 Almacenar ventas del día
    const [pedidoEnNovedad, setPedidoEnNovedad] = useState(null);
    const [pedidosEntregadosHoy, setPedidosEntregadosHoy] = useState([]); // 🆕 IDs de pedidos entregados hoy

    // 🆕 Cargar Pedidos
    const verificarPedidosPendientes = async (fechaStr) => {
        try {
            // Usar fecha proporcionada o la seleccionada
            let fecha = fechaStr;
            if (!fecha && fechaSeleccionada) {
                fecha = fechaSeleccionada.toISOString().split('T')[0];
            }
            // Si no hay fecha ni userId, salir
            if (!fecha || !userId) return;

            console.log(`📦 Buscando pedidos para ${userId} en ${fecha}`);
            const response = await fetch(`${ENDPOINTS.PEDIDOS_PENDIENTES}?vendedor_id=${userId}&fecha=${fecha}`);

            if (response.ok) {
                const data = await response.json();
                if (Array.isArray(data)) {
                    // 🆕 Separar pendientes de entregados
                    const pendientes = data.filter(p => p.estado !== 'ENTREGADO');
                    const entregados = data.filter(p => p.estado === 'ENTREGADO').map(p => ({
                        id: p.id,
                        destinatario: p.destinatario,
                        numero_pedido: p.numero_pedido
                    }));

                    setPedidosPendientes(pendientes);
                    setPedidosEntregadosHoy(entregados);

                    console.log(`✅ ${pendientes.length} pedidos pendientes, ${entregados.length} entregados`);
                }
            }
        } catch (e) {
            console.log('Error buscando pedidos:', e);
        }
    };

    const cargarPedidoEnCarrito = (pedido) => {
        Alert.alert(
            '🔄 Cargar Pedido',
            'Esto reemplazará los productos actuales del carrito. ¿Continuar?',
            [
                { text: 'Cancelar', style: 'cancel' },
                {
                    text: 'Cargar',
                    onPress: () => {
                        const nuevoCarrito = {};
                        let encontrados = 0;

                        pedido.detalles.forEach(d => {
                            // Buscar producto en catálogo local por ID o nombre
                            const prodReal = productos.find(p => p.id === d.producto || p.nombre === d.producto_nombre);

                            if (prodReal) {
                                encontrados++;
                                // Construir objeto carrito con ID como clave
                                nuevoCarrito[prodReal.id] = {
                                    ...prodReal, // ID, nombre, imagen, etc
                                    cantidad: d.cantidad,
                                    precio: parseFloat(d.precio_unitario), // Usar precio del pedido
                                    subtotal: parseFloat(d.precio_unitario) * d.cantidad
                                };
                            }
                        });

                        setCarrito(nuevoCarrito);
                        setModalPedidosVisible(false);

                        // Intentar pre-seleccionar cliente (si existe lógica simple)
                        // Por ahora solo avisar
                        setTimeout(() => {
                            Alert.alert(
                                '✅ Pedido Cargado',
                                `Se cargaron ${encontrados} productos del pedido.\n\nPor favor selecciona el cliente y confirma la venta.`
                            );
                        }, 500);
                    }
                }
            ]
        );
    };

    // 🆕 Reportar Novedad (No entregado)
    const confirmarNovedad = async () => {
        if (!motivoNovedad.trim()) {
            Alert.alert('Atención', 'Por favor escribe el motivo de la no entrega.');
            return;
        }

        try {
            const response = await fetch(ENDPOINTS.PEDIDO_MARCAR_NO_ENTREGADO(pedidoEnNovedad.id), {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ motivo: motivoNovedad })
            });

            if (response.ok) {
                Alert.alert('Registrado', 'La novedad ha sido reportada y el pedido se ha retirado de la lista.');
                setModalNovedadVisible(false);
                setMotivoNovedad('');
                // Recargar lista
                const fechaStr = fechaSeleccionada.toISOString().split('T')[0];
                verificarPedidosPendientes(fechaStr);
            } else {
                Alert.alert('Error', 'No se pudo registrar la novedad.');
            }
        } catch (error) {
            console.error(error);
            Alert.alert('Error', 'Error de conexión.');
        }
    };

    const marcarPedidoEntregado = (pedido) => {
        setPedidoParaEntregar(pedido);
        setMostrarResumenEntrega(true);
    };

    const confirmarEntregaPedido = async () => {
        if (!pedidoParaEntregar) return;

        try {
            const response = await fetch(ENDPOINTS.PEDIDO_MARCAR_ENTREGADO(pedidoParaEntregar.id), { method: 'POST' });
            const data = await response.json();

            setMostrarResumenEntrega(false);

            if (data.success) {
                // 🆕 Agregar pedido con info del destinatario
                setPedidosEntregadosHoy(prev => [...prev, {
                    id: pedidoParaEntregar.id,
                    destinatario: pedidoParaEntregar.destinatario || clienteSeleccionado?.negocio || 'Cliente',
                    numero_pedido: pedidoParaEntregar.numero_pedido
                }]);

                // 🆕 Limpiar pedido del cliente para volver a botones normales
                setPedidoClienteSeleccionado(null);
                setPedidoParaEntregar(null);

                // Recargar pedidos pendientes
                const fechaStr = fechaSeleccionada.toISOString().split('T')[0];
                await verificarPedidosPendientes(fechaStr);

                Alert.alert('✅ Pedido Entregado', `El pedido #${pedidoParaEntregar.numero_pedido} ha sido marcado como entregado exitosamente.`);
            } else {
                Alert.alert('Error', data.message || 'No se pudo actualizar el pedido');
            }
        } catch (e) {
            setMostrarResumenEntrega(false);
            console.error(e);
            Alert.alert('Error', 'No se pudo actualizar el pedido. Revisa tu conexión.');
        }
    };
    const [nota, setNota] = useState('');
    const [clientes, setClientes] = useState([]);

    // Estados para modales
    const [mostrarSelectorCliente, setMostrarSelectorCliente] = useState(false);
    const [mostrarModalCliente, setMostrarModalCliente] = useState(false);
    const [mostrarVencidas, setMostrarVencidas] = useState(false);
    const [mostrarResumen, setMostrarResumen] = useState(false);
    const [mostrarResumenEntrega, setMostrarResumenEntrega] = useState(false); // 🆕 Para confirmar entrega de pedido
    const [pedidoParaEntregar, setPedidoParaEntregar] = useState(null); // 🆕 Pedido a entregar
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

                // 🆕 Cargar pedidos
                verificarPedidosPendientes(fechaFormatted);

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
                        [{
                            text: 'OK',
                            onPress: () => setMostrarSelectorDia(true) // Mostrar selector DESPUÉS de cerrar alert
                        }]
                    );
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

            // 🆕 Cargar ventas del día al abrir turno
            await cargarVentasDelDia(date);
        }
    };

    // Estado para cliente preseleccionado desde rutas
    const [clientePreseleccionado, setClientePreseleccionado] = useState(null);

    // 🆕 Función para cargar las ventas del día (para mostrar el conteo correcto)
    const cargarVentasDelDia = async (fecha) => {
        try {
            const todasLasVentas = await obtenerVentas();

            // Formatear fecha del día para comparar (YYYY-MM-DD)
            const fechaDia = fecha.toISOString().split('T')[0];

            // Filtrar ventas del día
            const ventasHoy = todasLasVentas.filter(venta => {
                const fechaVenta = venta.fecha.split('T')[0];
                return fechaVenta === fechaDia;
            });

            // 🆕 DEBUG: Mostrar cada venta encontrada
            console.log(`📊 Buscando ventas del día ${fechaDia}...`);
            console.log(`📊 Total ventas guardadas: ${todasLasVentas.length}`);
            ventasHoy.forEach((v, i) => {
                console.log(`   ${i + 1}. Cliente: ${v.cliente_nombre || 'N/A'}, Total: ${formatearMoneda(v.total)}, Fecha: ${v.fecha}`);
            });

            // Calcular totales
            const cantidadVentas = ventasHoy.length;
            const totalDinero = ventasHoy.reduce((sum, v) => sum + (v.total || 0), 0);

            console.log(`📊 Ventas del día ${fechaDia}: ${cantidadVentas} ventas, ${formatearMoneda(totalDinero)}`);

            setTotalVentasHoy(cantidadVentas);
            setTotalDineroHoy(totalDinero);
            setVentasDelDia(ventasHoy); // 🆕 Guardar ventas para indicador visual
        } catch (error) {
            console.error('Error cargando ventas del día:', error);
        }
    };

    // 🆕 Verificar turno activo al iniciar la app
    const verificarTurnoActivo = async () => {
        try {
            const response = await fetch(`${ENDPOINTS.TURNO_VERIFICAR}?vendedor_id=${userId}`);
            const data = await response.json();

            if (data.turno_activo) {
                console.log('✅ Turno activo encontrado:', data);
                // Hay turno abierto - saltar modal de selección
                setDiaSeleccionado(data.dia);

                // Restaurar fecha seleccionada del turno
                const fechaTurno = new Date(data.fecha + 'T12:00:00'); // Forzar hora mediodía para evitar UTC shift
                setFechaSeleccionada(fechaTurno);

                // 🆕 Cargar pedidos
                verificarPedidosPendientes(data.fecha);

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

                // 🆕 Cargar ventas reales del día
                await cargarVentasDelDia(fechaTurno);

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

            // 🆕 Agregar timeout de 30 segundos
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 30000);

            try {
                // Llamar al endpoint de obtener cargue
                const response = await fetch(
                    `${ENDPOINTS.OBTENER_CARGUE}?vendedor_id=${userId}&dia=${dia}&fecha=${fechaFormateada}`,
                    { signal: controller.signal }
                );
                clearTimeout(timeoutId);

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
                    console.log('📦 Stock cargado:', Object.keys(stockPorProducto).length, 'productos');
                } else {
                    console.log('⚠️ No hay cargue para esta fecha');
                    setStockCargue({});
                }
            } catch (fetchError) {
                clearTimeout(timeoutId);
                if (fetchError.name === 'AbortError') {
                    console.error('⏱️ Timeout cargando stock');
                } else {
                    console.error('❌ Error cargando stock:', fetchError.message);
                }
                setStockCargue({});
            }
        } catch (error) {
            console.error('❌ Error general cargando stock:', error);
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

        // 🆕 Validar si hay stock suficiente para cambiar vencidas
        const advertenciasVencidas = [];
        if (vencidas && vencidas.length > 0) {
            vencidas.forEach(vencida => {
                const nombreProducto = vencida.nombre.toUpperCase();
                const stockActual = stockCargue[nombreProducto] || 0;
                const cantidadVendida = productosVenta.find(p => p.nombre.toUpperCase() === nombreProducto)?.cantidad || 0;
                const stockDisponible = stockActual - cantidadVendida;

                if (vencida.cantidad > stockDisponible) {
                    if (stockDisponible <= 0) {
                        advertenciasVencidas.push(`⚠️ ${vencida.nombre}: No tienes stock para cambiar ${vencida.cantidad} vencidas`);
                    } else {
                        advertenciasVencidas.push(`⚠️ ${vencida.nombre}: Solo tienes ${stockDisponible} para cambiar ${vencida.cantidad} vencidas`);
                    }
                }
            });
        }

        // Si hay advertencias, mostrar alerta pero permitir continuar
        if (advertenciasVencidas.length > 0) {
            Alert.alert(
                '⚠️ Advertencia de Stock',
                advertenciasVencidas.join('\n') + '\n\n¿Deseas continuar de todas formas?',
                [
                    { text: 'Cancelar', style: 'cancel' },
                    { text: 'Continuar', onPress: () => setMostrarResumen(true) }
                ]
            );
        } else {
            setMostrarResumen(true);
        }
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

            // 1. Restar productos vendidos
            Object.keys(carrito).forEach(productoId => {
                const producto = productos.find(p => p.id === parseInt(productoId));
                if (producto) {
                    const nombreProducto = producto.nombre.toUpperCase();
                    const cantidadVendida = carrito[productoId];
                    const stockActual = nuevoStock[nombreProducto] || 0;
                    nuevoStock[nombreProducto] = Math.max(0, stockActual - cantidadVendida);
                    console.log(`📉 Vendido: ${nombreProducto}: ${stockActual} -> ${nuevoStock[nombreProducto]}`);
                }
            });

            // 🆕 2. Restar productos vencidos (también salen del stock)
            if (vencidas && vencidas.length > 0) {
                vencidas.forEach(item => {
                    const nombreProducto = item.nombre.toUpperCase();
                    const cantidadVencida = item.cantidad || 0;
                    const stockActual = nuevoStock[nombreProducto] || 0;
                    nuevoStock[nombreProducto] = Math.max(0, stockActual - cantidadVencida);
                    console.log(`🗑️ Vencido: ${nombreProducto}: ${stockActual} -> ${nuevoStock[nombreProducto]}`);
                });
            }

            setStockCargue(nuevoStock);

            // 🆕 Actualizar contador y agregar venta al estado inmediatamente
            setTotalVentasHoy(prev => prev + 1);
            setTotalDineroHoy(prev => prev + ventaConDatos.total);

            // ✅ Agregar venta recién guardada al estado inmediatamente (sin esperar recarga)
            setVentasDelDia(prev => [...prev, {
                ...ventaGuardada,
                cliente_nombre: ventaConDatos.cliente_nombre,
                cliente_negocio: ventaConDatos.cliente_negocio,
                fecha: ventaConDatos.fecha,
                total: ventaConDatos.total
            }]);

            // Cerrar modal después de actualizar datos
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
        setPedidoClienteSeleccionado(null); // 🆕 Limpiar pedido del cliente
    };

    // Manejar selección de cliente
    const handleSeleccionarCliente = (cliente) => {
        // 🆕 Verificar si ya le vendió hoy
        const norm = (str) => str ? str.toString().toUpperCase().trim() : '';
        const yaVendidoHoy = ventasDelDia.some(venta => {
            const vNegocio = norm(venta.cliente_negocio);
            const vNombre = norm(venta.cliente_nombre);
            const cNegocio = norm(cliente.negocio);
            const cNombre = norm(cliente.nombre);
            return (vNegocio && vNegocio === cNegocio) || (vNombre && vNombre === cNombre);
        });

        if (yaVendidoHoy) {
            Alert.alert(
                '⚠️ Cliente con Venta',
                `Ya se realizó una venta a ${cliente.negocio || cliente.nombre} el día de hoy.\n\n¿Deseas continuar de todas formas?`,
                [
                    { text: 'Cancelar', style: 'cancel' },
                    {
                        text: 'Sí, Continuar',
                        onPress: () => {
                            setClienteSeleccionado(cliente);
                            // 🆕 Verificar si tiene pedido
                            verificarPedidoCliente(cliente);
                        }
                    }
                ]
            );
            return;
        }

        setClienteSeleccionado(cliente);
        // 🆕 Verificar si tiene pedido
        verificarPedidoCliente(cliente);
    };

    // 🆕 Verificar si el cliente tiene pedido pendiente
    const verificarPedidoCliente = (cliente) => {
        const norm = (str) => str ? str.toString().toUpperCase().trim() : '';
        const cNegocio = norm(cliente.negocio);
        const cNombre = norm(cliente.nombre);

        const pedido = pedidosPendientes.find(p => {
            const pDestinatario = norm(p.destinatario);
            return (pDestinatario === cNegocio) || (pDestinatario === cNombre);
        });

        setPedidoClienteSeleccionado(pedido || null);
        console.log('🔍 Pedido del cliente:', pedido ? `#${pedido.numero_pedido}` : 'Sin pedido');
    };

    // 🆕 Editar pedido del cliente seleccionado (cargar en carrito)
    const editarPedidoClienteSeleccionado = () => {
        if (!pedidoClienteSeleccionado) return;

        const nuevoCarrito = {};
        let encontrados = 0;

        pedidoClienteSeleccionado.detalles.forEach(d => {
            // Buscar producto en catálogo local por ID o nombre
            const prodReal = productos.find(p => p.id === d.producto || p.nombre === d.producto_nombre);

            if (prodReal) {
                encontrados++;
                // Construir objeto carrito con ID como clave
                nuevoCarrito[prodReal.id] = d.cantidad; // Solo la cantidad
            }
        });

        setCarrito(nuevoCarrito);

        Alert.alert(
            '✏️ Pedido Cargado',
            `Se cargaron ${encontrados} productos del pedido.\n\nPuedes modificar las cantidades y completar la venta.`
        );
    };

    // 🆕 Marcar pedido del cliente seleccionado como entregado
    const marcarEntregadoClienteSeleccionado = () => {
        if (!pedidoClienteSeleccionado) return;
        marcarPedidoEntregado(pedidoClienteSeleccionado);
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

                                    // 🆕 Marcar turno como cerrado EN LA BD
                                    try {
                                        const responseCerrar = await fetch(ENDPOINTS.TURNO_CERRAR, {
                                            method: 'POST',
                                            headers: { 'Content-Type': 'application/json' },
                                            body: JSON.stringify({
                                                vendedor_id: userId,
                                                fecha: fechaFormateada
                                            })
                                        });
                                        const dataCerrar = await responseCerrar.json();
                                        console.log('✅ Turno cerrado en BD:', dataCerrar);
                                    } catch (errorCerrar) {
                                        console.error('⚠️ Error cerrando turno en BD:', errorCerrar);
                                    }

                                    // Marcar turno como cerrado localmente
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

            {/* 🆕 Botón Pedidos Asignados - DESACTIVADO (ahora se muestran en selector de clientes) */}
            {/* {pedidosPendientes.length > 0 && turnoAbierto && (
                <TouchableOpacity
                    style={styles.btnPedidosFlotante}
                    onPress={() => setModalPedidosVisible(true)}
                >
                    <Ionicons name="cube-outline" size={24} color="#fff" />
                    <Text style={styles.btnPedidosTexto}>
                        📦 Ver {pedidosPendientes.length} Pedidos Asignados
                    </Text>
                    <Ionicons name="chevron-forward" size={20} color="#fff" />
                </TouchableOpacity>
            )} */}

            {/* Header - Cliente */}
            <View style={styles.headerCliente}>
                <TouchableOpacity
                    style={[
                        styles.clienteSelector,
                        // 🆕 Fondo y borde verde si tiene pedido entregado
                        clienteSeleccionado && (() => {
                            const norm = (str) => str ? str.toString().toUpperCase().trim() : '';
                            const tienePedidoEntregado = pedidosEntregadosHoy.some(p => {
                                const pDestinatario = norm(p.destinatario);
                                const cNegocio = norm(clienteSeleccionado.negocio);
                                const cNombre = norm(clienteSeleccionado.nombre);
                                return (pDestinatario === cNegocio) || (pDestinatario === cNombre);
                            });
                            return tienePedidoEntregado ? {
                                backgroundColor: 'rgba(34, 197, 94, 0.1)',
                                borderColor: '#22c55e' // Verde
                            } : null;
                        })()
                    ]}
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
                            {(() => {
                                // Buscar pedido pendiente
                                if (pedidoClienteSeleccionado) {
                                    return `📦 Pedido #${pedidoClienteSeleccionado.numero_pedido}`;
                                }

                                // Buscar pedido entregado
                                const norm = (str) => str ? str.toString().toUpperCase().trim() : '';
                                const pedidoEntregado = pedidosEntregadosHoy.find(p => {
                                    const pDestinatario = norm(p.destinatario);
                                    const cNegocio = norm(clienteSeleccionado?.negocio);
                                    const cNombre = norm(clienteSeleccionado?.nombre);
                                    return (pDestinatario === cNegocio) || (pDestinatario === cNombre);
                                });

                                if (pedidoEntregado) {
                                    return `📦 Pedido #${pedidoEntregado.numero_pedido}`;
                                }

                                // No hay pedido, mostrar teléfono
                                return `📞 ${clienteSeleccionado?.celular || 'Sin teléfono'}`;
                            })()}
                        </Text>
                        <Text style={styles.clienteDetalle}>
                            📍 {clienteSeleccionado?.direccion || 'Sin dirección'}
                        </Text>
                    </View>
                    <Ionicons name="chevron-forward" size={20} color="#003d88" />

                    {/* 🆕 Badge "Entregado" en esquina superior derecha */}
                    {clienteSeleccionado && (() => {
                        const norm = (str) => str ? str.toString().toUpperCase().trim() : '';
                        const pedidoEntregado = pedidosEntregadosHoy.find(p => {
                            const pDestinatario = norm(p.destinatario);
                            const cNegocio = norm(clienteSeleccionado.negocio);
                            const cNombre = norm(clienteSeleccionado.nombre);
                            return (pDestinatario === cNegocio) || (pDestinatario === cNombre);
                        });
                        return pedidoEntregado ? (
                            <View style={styles.badgeEntregado}>
                                <Text style={styles.badgeEntregadoTexto}>Entregado</Text>
                            </View>
                        ) : null;
                    })()}

                    {/* 🆕 Check verde si ya se le vendió hoy (NO si solo está entregado) */}
                    {clienteSeleccionado && (() => {
                        const norm = (str) => str ? str.toString().toUpperCase().trim() : '';

                        // Verificar si ya se le vendió
                        const yaVendido = ventasDelDia.some(venta => {
                            const vNegocio = norm(venta.cliente_negocio);
                            const vNombre = norm(venta.cliente_nombre);
                            const cNegocio = norm(clienteSeleccionado.negocio);
                            const cNombre = norm(clienteSeleccionado.nombre);
                            return (vNegocio && vNegocio === cNegocio) || (vNombre && vNombre === cNombre);
                        });

                        return yaVendido ? (
                            <View style={styles.headerCheckVendido}>
                                <Ionicons name="checkmark-circle" size={24} color="#10b981" />
                            </View>
                        ) : null;
                    })()}

                    {/* 🆕 X roja si tiene pedido */}
                    {pedidoClienteSeleccionado && (
                        <TouchableOpacity
                            style={styles.headerXPedido}
                            onPress={() => {
                                // Por ahora solo un placeholder, luego defines la acción
                                Alert.alert('Cancelar Pedido', 'Funcionalidad por definir');
                            }}
                        >
                            <Ionicons name="close-circle" size={28} color="#dc3545" />
                        </TouchableOpacity>
                    )}
                </TouchableOpacity>
            </View>

            {/* Botones Acciones: Cambian según si tiene pedido */}
            <View style={styles.botonesAccionesContainer}>
                {pedidoClienteSeleccionado ? (
                    <>
                        {/* Botón Editar (rojo) - Cliente con Pedido */}
                        <TouchableOpacity
                            style={[styles.btnAccion, styles.btnEditar]}
                            onPress={editarPedidoClienteSeleccionado}
                        >
                            <Ionicons name="create" size={18} color="white" />
                            <Text style={styles.btnAccionTexto}>Editar</Text>
                        </TouchableOpacity>

                        {/* Botón Entregado (verde) - Cliente con Pedido */}
                        <TouchableOpacity
                            style={[styles.btnAccion, styles.btnEntregado]}
                            onPress={marcarEntregadoClienteSeleccionado}
                        >
                            <Ionicons name="checkmark-circle" size={18} color="white" />
                            <Text style={styles.btnAccionTexto}>Entregado</Text>
                        </TouchableOpacity>
                    </>
                ) : (
                    <>
                        {/* Botón Vencidas - Cliente Normal */}
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

                        {/* Botón Cerrar Turno - Cliente Normal */}
                        <TouchableOpacity
                            style={[styles.btnAccion, styles.btnCerrarPequeño]}
                            onPress={() => setMostrarModalCerrarTurno(true)}
                        >
                            <Ionicons name="lock-closed" size={18} color="white" />
                            <Text style={styles.btnAccionTexto}>Cerrar</Text>
                        </TouchableOpacity>
                    </>
                )}
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

                        {/* 🆕 Botón Volver para cerrar el modal */}
                        <TouchableOpacity
                            style={styles.modalDiaBotonVolver}
                            onPress={() => setMostrarSelectorDia(false)}
                        >
                            <Ionicons name="arrow-back" size={20} color="#666" />
                            <Text style={styles.modalDiaVolverTexto}>Volver</Text>
                        </TouchableOpacity>
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
                ventasDelDia={ventasDelDia} // 🆕 Pasar ventas del día
                pedidosPendientes={pedidosPendientes} // 🆕 Pasar pedidos pendientes
                pedidosEntregadosHoy={pedidosEntregadosHoy} // 🆕 Pasar pedidos entregados
                onCargarPedido={cargarPedidoEnCarrito} // 🆕 Cargar pedido en carrito
                onMarcarEntregado={marcarPedidoEntregado} // 🆕 Marcar como entregado
                onMarcarNoEntregado={(pedido) => { // 🆕 Marcar como no entregado
                    setPedidoEnNovedad(pedido);
                    setModalNovedadVisible(true);
                }}
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
                onSelect={handleSeleccionarCliente}
                onClienteGuardado={handleClienteGuardado}
                clientes={clientes}
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

            <ConfirmarEntregaModal
                visible={mostrarResumenEntrega}
                onClose={() => setMostrarResumenEntrega(false)}
                onConfirmar={confirmarEntregaPedido}
                pedido={pedidoParaEntregar}
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
            {/* 🆕 MODAL PEDIDOS ASIGNADOS */}
            <Modal
                visible={modalPedidosVisible}
                animationType="slide"
                transparent={true}
                onRequestClose={() => setModalPedidosVisible(false)}
            >
                <View style={[styles.modalOverlay, { justifyContent: 'flex-end' }]}>
                    <View style={[styles.modalContent, { maxHeight: '85%', width: '100%', borderBottomLeftRadius: 0, borderBottomRightRadius: 0 }]}>
                        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 15 }}>
                            <Text style={styles.modalTitle}>📦 Pedidos Asignados ({pedidosPendientes.length})</Text>
                            <TouchableOpacity onPress={() => setModalPedidosVisible(false)}>
                                <Ionicons name="close-circle" size={30} color="#666" />
                            </TouchableOpacity>
                        </View>

                        <ScrollView contentContainerStyle={{ paddingBottom: 20 }}>
                            {pedidosPendientes.length === 0 ? (
                                <Text style={{ textAlign: 'center', color: '#666', marginTop: 20 }}>No tienes pedidos pendientes</Text>
                            ) : (
                                pedidosPendientes.map((p) => (
                                    <View key={p.id} style={styles.pedidoCard}>
                                        <TouchableOpacity
                                            style={styles.btnNovedadX}
                                            onPress={() => {
                                                setPedidoEnNovedad(p);
                                                setModalNovedadVisible(true);
                                            }}
                                        >
                                            <Ionicons name="close-circle" size={28} color="#dc3545" />
                                        </TouchableOpacity>

                                        <View style={styles.pedidoHeader}>
                                            <Text style={styles.pedidoCliente}>{p.destinatario || 'Cliente'}</Text>
                                            <Text style={styles.pedidoTotal}>${parseFloat(p.total).toLocaleString()}</Text>
                                        </View>
                                        <Text style={styles.pedidoInfo}>📍 {p.direccion_entrega || 'Sin dirección'}</Text>
                                        <Text style={styles.pedidoInfo}>📄 Pedido #{p.numero_pedido} • {p.fecha.split('T')[0]}</Text>
                                        <Text style={[styles.pedidoInfo, { fontStyle: 'italic' }]}>{p.nota}</Text>

                                        <View style={styles.pedidoDetallesBox}>
                                            {p.detalles.map((d, idx) => (
                                                <Text key={idx} style={styles.pedidoDetalleText}>
                                                    • {d.producto_nombre || 'Producto'} x{d.cantidad}
                                                </Text>
                                            ))}
                                        </View>

                                        <View style={styles.pedidoAccionesRow}>
                                            <TouchableOpacity
                                                style={[styles.botonAccion, { backgroundColor: '#28a745', flex: 1, marginRight: 5 }]}
                                                onPress={() => cargarPedidoEnCarrito(p)}
                                            >
                                                <Ionicons name="cart" size={18} color="white" />
                                                <Text style={styles.textoBotonAccion}>Vender (Carrito)</Text>
                                            </TouchableOpacity>

                                            <TouchableOpacity
                                                style={[styles.botonAccion, { backgroundColor: '#e9ecef', flex: 1, marginLeft: 5 }]}
                                                onPress={() => marcarPedidoEntregado(p)}
                                            >
                                                <Ionicons name="checkmark-done" size={18} color="#003d88" />
                                                <Text style={[styles.textoBotonAccion, { color: '#003d88' }]}>Solo Entregar</Text>
                                            </TouchableOpacity>
                                        </View>
                                    </View>
                                ))
                            )}
                        </ScrollView>
                    </View>
                </View>
            </Modal>

            {/* 🆕 MODAL REPORTE NOVEDAD */}
            <Modal
                visible={modalNovedadVisible}
                animationType="fade"
                transparent={true}
                onRequestClose={() => setModalNovedadVisible(false)}
            >
                <View style={styles.modalOverlay}>
                    <View style={[styles.modalContent, { width: '85%' }]}>
                        <Text style={[styles.modalTitle, { color: '#dc3545' }]}>⚠️ Reportar No Entrega</Text>
                        <Text style={{ marginBottom: 10, color: '#666' }}>
                            ¿Por qué no se entregó el pedido de {pedidoEnNovedad?.destinatario}?
                        </Text>

                        <TextInput
                            style={{
                                borderWidth: 1,
                                borderColor: '#ccc',
                                borderRadius: 8,
                                padding: 10,
                                height: 80,
                                textAlignVertical: 'top',
                                marginBottom: 15,
                                backgroundColor: '#f9f9f9'
                            }}
                            placeholder="Escribe el motivo (ej: Cerrado, Sin dinero...)"
                            value={motivoNovedad}
                            onChangeText={setMotivoNovedad}
                            multiline
                            autoFocus
                        />

                        <View style={{ flexDirection: 'row', justifyContent: 'flex-end', gap: 10 }}>
                            <TouchableOpacity
                                style={[styles.botonAccion, { backgroundColor: '#e9ecef', paddingHorizontal: 20 }]}
                                onPress={() => setModalNovedadVisible(false)}
                            >
                                <Text style={{ color: '#666', fontWeight: 'bold' }}>Cancelar</Text>
                            </TouchableOpacity>
                            <TouchableOpacity
                                style={[styles.botonAccion, { backgroundColor: '#dc3545', paddingHorizontal: 20 }]}
                                onPress={confirmarNovedad}
                            >
                                <Text style={{ color: 'white', fontWeight: 'bold' }}>Reportar</Text>
                            </TouchableOpacity>
                        </View>
                    </View>
                </View>
            </Modal>
        </View>
    );
};

const styles = StyleSheet.create({
    btnNovedadX: {
        position: 'absolute',
        top: 0,
        right: 0,
        zIndex: 10,
        padding: 5,
    },
    // 🆕 Estilos Pedidos
    btnPedidosFlotante: {
        backgroundColor: '#00ad53', // Verde App
        flexDirection: 'row',
        alignItems: 'center',
        paddingVertical: 10, // Más compacto
        paddingHorizontal: 15,
        marginHorizontal: 15,
        marginBottom: 10, // Menos espacio
        marginTop: 5,
        borderRadius: 10,
        shadowColor: "#000",
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.1,
        shadowRadius: 3,
        elevation: 3,
    },
    btnPedidosTexto: {
        color: 'white',
        fontWeight: 'bold',
        fontSize: 15, // Texto un poco más pequeño
        marginLeft: 10,
        flex: 1,
    },
    pedidoCard: {
        backgroundColor: '#f8f9fa',
        padding: 15,
        borderRadius: 10,
        marginBottom: 15,
        borderWidth: 1,
        borderColor: '#dee2e6',
    },
    pedidoHeader: {
        marginBottom: 8,
        paddingRight: 40, // Espacio para la X
    },
    pedidoCliente: {
        fontSize: 17,
        fontWeight: 'bold',
        color: '#212529',
        marginBottom: 4,
    },
    pedidoTotal: {
        fontSize: 16,
        fontWeight: 'bold',
        color: '#28a745',
    },
    pedidoInfo: {
        color: '#6c757d',
        marginBottom: 2,
        fontSize: 14,
    },
    pedidoDetallesBox: {
        marginTop: 10,
        padding: 10,
        backgroundColor: '#fff',
        borderRadius: 8,
        borderWidth: 1,
        borderColor: '#e9ecef',
    },
    pedidoDetalleText: {
        color: '#495057',
        fontSize: 14,
        marginBottom: 2,
    },
    pedidoAccionesRow: {
        flexDirection: 'row',
        marginTop: 15,
    },
    botonAccion: {
        flexDirection: 'row',
        justifyContent: 'center',
        alignItems: 'center',
        padding: 12,
        borderRadius: 8,
    },
    textoBotonAccion: {
        fontWeight: 'bold',
        marginLeft: 5,
        fontSize: 14,
    },
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
        position: 'relative',
    },
    headerCheckVendido: {
        position: 'absolute',
        top: 4,
        right: 4,
        backgroundColor: 'white',
        borderRadius: 12,
        padding: 2,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.2,
        shadowRadius: 3,
        elevation: 4,
    },
    headerXPedido: {
        position: 'absolute',
        top: 4,
        right: 4,
        backgroundColor: 'white',
        borderRadius: 14,
        padding: 0,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.3,
        shadowRadius: 3,
        elevation: 5,
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
    badgeEntregado: {
        position: 'absolute',
        top: 4,
        right: 4,
        backgroundColor: '#22c55e',
        paddingHorizontal: 8,
        paddingVertical: 3,
        borderRadius: 12,
    },
    badgeEntregadoTexto: {
        color: 'white',
        fontSize: 10,
        fontWeight: 'bold',
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
    btnEditar: {
        backgroundColor: '#dc3545', // Rojo
    },
    btnEntregado: {
        backgroundColor: '#28a745', // Verde
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
        backgroundColor: '#003d88', // Azul de la app
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
    // 🆕 Estilos botón Volver
    modalDiaBotonVolver: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        marginTop: 16,
        padding: 12,
        borderRadius: 8,
        backgroundColor: '#f0f0f0',
    },
    modalDiaVolverTexto: {
        fontSize: 14,
        color: '#666',
        marginLeft: 8,
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
