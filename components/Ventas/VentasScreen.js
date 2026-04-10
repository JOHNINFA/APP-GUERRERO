import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { View, Text, TextInput, TouchableOpacity, Pressable, FlatList, StyleSheet, Alert, SafeAreaView, StatusBar, Platform, RefreshControl, Modal, Linking, ScrollView, Keyboard, KeyboardAvoidingView, AppState, ActivityIndicator } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import DateTimePicker from '@react-native-community/datetimepicker'; // 🆕 Import DatePicker
import ClienteSelector from './ClienteSelector';
import ClienteModal from './ClienteModal';
import ClienteNotaModal from './ClienteNotaModal'; // 🆕 Importar
import ClienteOcasionalModal from './ClienteOcasionalModal'; // 🆕 Modal venta rápida
import DevolucionesVencidas from './DevolucionesVencidas';
import ResumenVentaModal from './ResumenVentaModal';
import { ConfirmarEntregaModal } from './ConfirmarEntregaModal'; // 🆕 Importar modal
import {
    obtenerProductos,
    obtenerClientes,
    calcularSubtotal,
    guardarVenta,
    formatearMoneda,
    sincronizarProductos,
    sincronizarVentasPendientes,
    obtenerVentasPendientes,
    obtenerVentasEnRevision,
    descartarVentaEnRevision,
    obtenerVentas,  // 🆕 Agregar para contar ventas del día
    limpiarVentasLocales, // 🆕 Limpiar al cerrar turno
    convertirFotosABase64, // 🆕 Helper para fotos
    obtenerDispositivoId,
} from '../../services/ventasService';
import { imprimirTicket, precalentarConfigImpresion } from '../../services/printerService';
import { sincronizarPedidosAccionesPendientes } from '../../services/syncService';
import { ENDPOINTS, API_URL } from '../../config';
import { actualizarPedido, editarVentaRuta, obtenerAuthHeaders } from '../../services/rutasApiService';
import AsyncStorage from '@react-native-async-storage/async-storage'; // 🆕 Para precarga de clientes
import NetInfo from '@react-native-community/netinfo'; // 🆕 Para detectar conexión
import { useSafeAreaInsets } from 'react-native-safe-area-context';

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
const METODOS_PAGO_VALIDOS_EDICION = ['EFECTIVO', 'NEQUI', 'DAVIPLATA'];
const METODOS_PAGO_RAPIDOS = ['EFECTIVO', 'NEQUI', 'DAVIPLATA'];

const VentasScreen = ({ navigation, route, userId: userIdProp, vendedorNombre }) => {
    // userId puede venir de route.params o como prop directa
    const userId = route?.params?.userId || userIdProp;
    const insets = useSafeAreaInsets();

    // Estado para selección de día
    const [mostrarSelectorDia, setMostrarSelectorDia] = useState(false); // 🆕 Inicia en FALSE para verificar turno primero
    const [diaSeleccionado, setDiaSeleccionado] = useState(null);
    const [fechaSeleccionada, setFechaSeleccionada] = useState(new Date());
    const [mostrarDatePicker, setMostrarDatePicker] = useState(false);
    const [verificandoTurno, setVerificandoTurno] = useState(true); // 🆕 Estado de carga inicial

    // Estados
    const [clienteSeleccionado, setClienteSeleccionado] = useState(null);
    const [pedidoClienteSeleccionado, setPedidoClienteSeleccionado] = useState(null); // 🆕 Pedido del cliente actual
    const [modoEdicionPedido, setModoEdicionPedido] = useState(false); // 🆕 Controla si se permite editar cantidades del pedido
    const [busquedaProducto, setBusquedaProducto] = useState('');
    const [busquedaProductoDebounced, setBusquedaProductoDebounced] = useState('');
    const [productos, setProductos] = useState([]);
    const [categorias, setCategorias] = useState([]);
    const [carrito, setCarrito] = useState({});
    const [descuento, setDescuento] = useState(0); // Restaurado
    const [preciosAlternosCargue, setPreciosAlternosCargue] = useState({}); // 🆕 Precios por listas

    // 🆕 Estados para Pedidos Asignados
    const [pedidosPendientes, setPedidosPendientes] = useState([]);
    const [modalPedidosVisible, setModalPedidosVisible] = useState(false);

    // 🆕 Estados para Novedades (No Entregado)
    const [modalNovedadVisible, setModalNovedadVisible] = useState(false);
    const [motivoNovedad, setMotivoNovedad] = useState('');
    const [ventasDelDia, setVentasDelDia] = useState([]); // 🆕 Almacenar ventas del día
    const [pedidoEnNovedad, setPedidoEnNovedad] = useState(null);
    const [pedidosEntregadosHoy, setPedidosEntregadosHoy] = useState([]); // 🆕 IDs de pedidos entregados hoy
    const [pedidosNoEntregadosHoy, setPedidosNoEntregadosHoy] = useState([]); // 🆕 Pedidos NO entregados hoy
    const [mostrarHistorialVentas, setMostrarHistorialVentas] = useState(false); // 🆕 Estado para modal historial
    const [mostrarSoloAnuladas, setMostrarSoloAnuladas] = useState(false); // 🆕 Filtro para ver solo ventas anuladas
    const [clientesOrdenDia, setClientesOrdenDia] = useState([]); // 🆕 Orden del día para auto-avance
    const [clienteSeleccionadoEsPedido, setClienteSeleccionadoEsPedido] = useState(false);
    const [tecladoAbierto, setTecladoAbierto] = useState(false);
    const [alturaTeclado, setAlturaTeclado] = useState(0);
    const [historialReimpresion, setHistorialReimpresion] = useState([]); // 🆕 Historial unificado (backend + local fallback)
    const [cargandoHistorial, setCargandoHistorial] = useState(false);
    const [historialResumenPreview, setHistorialResumenPreview] = useState([]); // 🆕 Solo para resumen mientras carga backend
    const ultimaVentaHistorialRef = useRef(null);
    const [modalMetodoPagoCardVisible, setModalMetodoPagoCardVisible] = useState(false);
    const [ventaMetodoPagoCard, setVentaMetodoPagoCard] = useState(null);
    const [metodoPagoCardSeleccionado, setMetodoPagoCardSeleccionado] = useState('EFECTIVO');
    const [guardandoMetodoPagoCard, setGuardandoMetodoPagoCard] = useState(false);
    const guardandoMetodoPagoCardRef = useRef(false);
    const [inputBuscadorEnFoco, setInputBuscadorEnFoco] = useState(false); // 🆕 Rastrear foco del buscador
    const [forzarMostrarTurno, setForzarMostrarTurno] = useState(false); // 🆕 Para ver el turno bajo demanda (peeking)
    const [compensacionBloqueSuperior, setCompensacionBloqueSuperior] = useState(0);
    const [modoListaProductos, setModoListaProductos] = useState('scroll'); // normal | scroll
    const [cargandoAnulacion, setCargandoAnulacion] = useState(false); // 🆕 Estado para evitar doble toque al anular

    // 🆕 Estados para edición de venta desde historial
    const [ventaEnEdicion, setVentaEnEdicion] = useState(null); // venta completa que se está editando
    const [modalEdicionVisible, setModalEdicionVisible] = useState(false);
    const [carritoEdicion, setCarritoEdicion] = useState({}); // {nombreProducto: cantidad}

    // 🚀 OPTIMIZACIÓN: Memoizar flags del cliente seleccionado para evitar cálculos en render
    const norm = useCallback((str) => str ? str.toString().toUpperCase().trim() : '', []);
    const normTelefono = useCallback((valor) => String(valor || '').replace(/\D/g, ''), []);

    const obtenerIdentidadCliente = useCallback((cliente) => {
        const id = String(cliente?.id ?? cliente?.cliente_id ?? cliente?.cliente ?? '').trim();
        const negocio = norm(cliente?.negocio || cliente?.cliente_negocio || cliente?.nombre_negocio || cliente?.destinatario);
        const nombre = norm(cliente?.nombre || cliente?.cliente_nombre || cliente?.destinatario);
        const telefono = normTelefono(cliente?.celular || cliente?.telefono || cliente?.cliente_celular);
        const direccion = norm(cliente?.direccion || cliente?.direccion_entrega);

        return { id, negocio, nombre, telefono, direccion };
    }, [norm, normTelefono]);

    const coincideCliente = useCallback((clienteA, clienteB) => {
        if (!clienteA || !clienteB) return false;

        const identidadA = obtenerIdentidadCliente(clienteA);
        const identidadB = obtenerIdentidadCliente(clienteB);

        if (identidadA.id && identidadB.id) return identidadA.id === identidadB.id;

        if (identidadA.negocio && identidadB.negocio) {
            return identidadA.negocio === identidadB.negocio;
        }

        if (identidadA.negocio || identidadB.negocio) {
            const negocio = identidadA.negocio || identidadB.negocio;
            const nombre = identidadA.negocio ? identidadB.nombre : identidadA.nombre;
            const nombreCorrespondeAlNegocio = negocio && nombre && negocio === nombre;
            const mismoTelefono = identidadA.telefono && identidadB.telefono && identidadA.telefono === identidadB.telefono;
            const mismaDireccion = identidadA.direccion && identidadB.direccion && identidadA.direccion === identidadB.direccion;

            if (!nombreCorrespondeAlNegocio) return false;
            if (mismoTelefono || mismaDireccion) return true;

            return !identidadA.telefono && !identidadB.telefono && !identidadA.direccion && !identidadB.direccion;
        }

        if (identidadA.nombre && identidadB.nombre) {
            if (identidadA.nombre !== identidadB.nombre) return false;
            if (identidadA.telefono && identidadB.telefono) return identidadA.telefono === identidadB.telefono;
            if (identidadA.direccion && identidadB.direccion) return identidadA.direccion === identidadB.direccion;
            return !identidadA.telefono && !identidadB.telefono && !identidadA.direccion && !identidadB.direccion;
        }

        return false;
    }, [obtenerIdentidadCliente]);

    const obtenerClavesCoincidenciaCliente = useCallback((cliente) => {
        const identidad = obtenerIdentidadCliente(cliente);
        if (identidad.negocio) return [`neg:${identidad.negocio}`];
        if (identidad.nombre) return [`nom:${identidad.nombre}`];
        return [];
    }, [obtenerIdentidadCliente]);

    const ventasPorCliente = useMemo(() => {
        const mapa = new Map();
        const anuladas = new Set();

        const registrarClave = (setObj, cliente) => {
            obtenerClavesCoincidenciaCliente(cliente).forEach((clave) => setObj.add(clave));
        };

        const registrarVenta = (venta) => {
            const claves = obtenerClavesCoincidenciaCliente(venta);
            claves.forEach((clave) => {
                if (!mapa.has(clave)) mapa.set(clave, venta);
            });
        };

        // 🛡️ RECOLECTAR TODAS LAS ANULADAS (Backend y local)
        // Esto es CLAVE para que el badge desaparezca de inmediato tras anular
        (ventasBackendDia || []).forEach((v) => {
            if (String(v?.estado || '').toUpperCase() === 'ANULADA') registrarClave(anuladas, v);
        });
        (ventasDelDia || []).forEach((v) => {
            if (String(v?.estado || '').toUpperCase() === 'ANULADA') registrarClave(anuladas, v);
        });

        (ventasDelDia || []).forEach((venta) => {
            if (String(venta?.estado || '').toUpperCase() === 'ANULADA') return;
            const claves = obtenerClavesCoincidenciaCliente(venta);
            const estaAnulada = claves.some((clave) => anuladas.has(clave));
            if (estaAnulada) return;
            registrarVenta(venta);
        });

        (ventasBackendDia || []).forEach((venta) => {
            if (String(venta?.estado || '').toUpperCase() === 'ANULADA') return;
            registrarVenta(venta);
        });

        return mapa;
    }, [ventasDelDia, ventasBackendDia, obtenerClavesCoincidenciaCliente]);

    const clienteSeleccionadoYaVendido = useMemo(() => {
        if (!clienteSeleccionado) return false;
        return obtenerClavesCoincidenciaCliente(clienteSeleccionado).some((clave) => ventasPorCliente.has(clave));
    }, [clienteSeleccionado, ventasPorCliente, obtenerClavesCoincidenciaCliente]);

    const clienteSeleccionadoConPedidoEntregado = useMemo(() => {
        if (!clienteSeleccionado) return false;

        // 🔧 Igualar lógica robusta de verificación de pedidos para cubrir navegación con flechas (⏭️)
        const normT = (s) => (s || '').toString().trim().toUpperCase();
        const negocioCliente = normT(clienteSeleccionado?.negocio);
        const nombreCliente = normT(clienteSeleccionado?.nombre);

        return (pedidosEntregadosHoy || []).some((pedido) => {
            if (coincideCliente(clienteSeleccionado, pedido)) return true;
            const dest = normT(pedido?.destinatario);
            return dest && (dest === negocioCliente || dest === nombreCliente);
        });
    }, [clienteSeleccionado, pedidosEntregadosHoy, coincideCliente]);
    const [cantidadesEdicionInput, setCantidadesEdicionInput] = useState({}); // texto temporal por producto para evitar que desaparezca al borrar
    const [metodoPagoEdicion, setMetodoPagoEdicion] = useState('EFECTIVO');
    const [busquedaProductoEdicion, setBusquedaProductoEdicion] = useState('');
    const [focoCampoEdicion, setFocoCampoEdicion] = useState(null); // null | 'search' | 'cantidad'
    const [cargandoEdicion, setCargandoEdicion] = useState(false);
    const [stockOculto, setStockOculto] = useState(false); // spinner breve en vez del 0 flash al confirmar venta
    const modoCantidadConTeclado = tecladoAbierto && focoCampoEdicion === 'cantidad';
    const alturaListaEdicionConTeclado = (alturaTeclado >= 320 ? 220 : 260);

    // 🆕 Ventas del backend del día actual (para badges y alertas de venta duplicada)
    const [ventasBackendDia, setVentasBackendDia] = useState([]);

    // 🆕 Estados de conectividad y banner offline
    const [hayInternet, setHayInternet] = useState(true);
    const [estadoBanner, setEstadoBanner] = useState(null); // null | 'offline' | 'sincronizando' | 'exito'
    const [ventasSincronizadas, setVentasSincronizadas] = useState(0);
    const [mostrarModalSyncRapido, setMostrarModalSyncRapido] = useState(false);
    const [textoModalSyncRapido, setTextoModalSyncRapido] = useState('');
    const bannerTimerRef = useRef(null);
    const modalSyncTimerRef = useRef(null);
    const sincronizandoAutoRef = useRef(false);
    const bloqueSuperiorRef = useRef(null);
    const bloqueSuperiorYBaseRef = useRef(null);
    const compensacionRafRef = useRef(null);
    const buscadorRef = useRef(null);
    const listaProductosRef = useRef(null);
    const scrollOffsetProductosRef = useRef(0);
    const indiceCantidadEnFocoRef = useRef(null);
    const [indiceCantidadActivo, setIndiceCantidadActivo] = useState(null); // Para saber en qué indice estamos usando el foco de cantidad y ocultar base 
    const tecladoDesdeCantidadPrincipalRef = useRef(false);
    const scrollOffsetEdicionRef = useRef(0);
    const indiceCantidadEdicionEnFocoRef = useRef(null);
    const carritoRef = useRef({});
    const clienteAntesVentaRapidaRef = useRef(null);
    const listaEdicionRef = useRef(null);
    const carritoEdicionRef = useRef({});
    const inputsCantidadEdicionRef = useRef({});
    const bloqueoRefreshStockHastaRef = useRef(0);
    const esModoListaScroll = modoListaProductos === 'scroll';

    useEffect(() => {
        const cargarModoListaProductos = async () => {
            try {
                const modoGuardado = await AsyncStorage.getItem('@ventas_modo_lista_productos');
                if (modoGuardado === 'scroll' || modoGuardado === 'normal') {
                    setModoListaProductos(modoGuardado);
                }
            } catch (e) {
                console.log('⚠️ No se pudo cargar modo de lista de productos:', e?.message || e);
            }
        };

        cargarModoListaProductos();
    }, []);

    const cambiarModoListaProductos = useCallback(async (modo) => {
        if (modo !== 'normal' && modo !== 'scroll') return;

        try {
            await AsyncStorage.setItem('@ventas_modo_lista_productos', modo);
        } catch (e) {
            console.log('⚠️ No se pudo guardar modo de lista de productos:', e?.message || e);
        }

        setModoListaProductos(modo);
        Keyboard.dismiss();
        tecladoDesdeCantidadPrincipalRef.current = false;
        indiceCantidadEnFocoRef.current = null;
        setIndiceCantidadActivo(null);
        setTecladoAbierto(false);
        setAlturaTeclado(0);
    }, []);

    const abrirOpcionesModoListaProductos = useCallback(() => {
        Alert.alert(
            'Modo de lista',
            `Actual: ${esModoListaScroll ? 'Scroll' : 'Normal'}`,
            [
                {
                    text: 'Normal',
                    onPress: () => cambiarModoListaProductos('normal'),
                },
                {
                    text: 'Scroll',
                    onPress: () => cambiarModoListaProductos('scroll'),
                },
                {
                    text: 'Cancelar',
                    style: 'cancel',
                },
            ]
        );
    }, [cambiarModoListaProductos, esModoListaScroll]);

    const asegurarVisibilidadInputCantidad = useCallback((index, animated = true, forzarTecladoAbierto = null) => {
        if (index === null || index === undefined || index < 0) return;

        requestAnimationFrame(() => {
            try {
                // Hacemos scroll directo al índice sin usar offset matemático fijo para
                // evitar que Android colapse el ScrollView y empuje el header superior.
                listaProductosRef.current?.scrollToIndex({
                    index,
                    viewPosition: 0.1, // Mostrarlo más cerca de la parte superior del teclado
                    viewOffset: 20, // Pequeño espacio para que el teclado no lo tape exacto
                    // 🚀 Optimizador: si es el producto 1 o 2 (índice 0 o 1), el salto es inmediato (sin animación)
                    // para que el teclado salga y la vista se acomode al instante sin sentirse lento.
                    animated: index > 1,
                });
            } catch (e) {
                // Fallback silencioso: no bloquear la edición si FlatList aún no midió el índice.
            }
        });
    }, []);

    const empujarSoloListaCantidad = useCallback((index, keyboardHeight = 0) => {
        if (index === null || index === undefined || index < 0) return;
        if (index < 2) return; // 1ro-2do no necesitan empuje adicional

        requestAnimationFrame(() => {
            try {
                const actual = scrollOffsetProductosRef.current || 0;
                const altoFila = 92;
                const topFila = index * altoFila;
                const distanciaDesdeTop = topFila - actual;

                // Si la fila tocada cae en la mitad inferior visible,
                // nudgear un poco la lista hacia arriba (sin mover header/card).
                if (distanciaDesdeTop >= 170) {
                    const nudge = Math.min(90, Math.max(60, keyboardHeight * 0.1));
                    listaProductosRef.current?.scrollToOffset({
                        offset: Math.max(0, actual + nudge),
                        animated: true,
                    });
                }
            } catch (e) {
                // fallback silencioso
            }
        });
    }, []);

    const preAjusteListaAntesDeTecladoCantidad = useCallback((index) => {
        // NO hacer nada - dejar que el usuario haga scroll manual si es necesario
        return;
    }, []);

    const medirBloqueSuperiorEnPantalla = useCallback((callback) => {
        const nodo = bloqueSuperiorRef.current;
        if (!nodo || typeof nodo.measureInWindow !== 'function') return;
        nodo.measureInWindow((x, y) => {
            if (typeof y === 'number' && Number.isFinite(y)) {
                callback?.(y);
            }
        });
    }, []);

    const refrescarBaseBloqueSuperior = useCallback(() => {
        if (tecladoDesdeCantidadPrincipalRef.current || indiceCantidadEnFocoRef.current !== null) return;
        requestAnimationFrame(() => {
            medirBloqueSuperiorEnPantalla((y) => {
                bloqueSuperiorYBaseRef.current = y;
            });
        });
    }, [medirBloqueSuperiorEnPantalla]);

    const cancelarCompensacionAnimada = useCallback(() => {
        if (compensacionRafRef.current) {
            cancelAnimationFrame(compensacionRafRef.current);
            compensacionRafRef.current = null;
        }
    }, []);

    const actualizarCompensacionBloqueSuperior = useCallback(() => {
        if (!tecladoDesdeCantidadPrincipalRef.current) return;
        medirBloqueSuperiorEnPantalla((yActual) => {
            const yBase = bloqueSuperiorYBaseRef.current;
            if (typeof yBase !== 'number') return;
            const delta = Math.max(0, yBase - yActual);
            setCompensacionBloqueSuperior((prev) => (Math.abs(prev - delta) > 0.5 ? delta : prev));
        });
    }, [medirBloqueSuperiorEnPantalla]);

    const iniciarCompensacionAnimada = useCallback((duracionMs = 700) => {
        cancelarCompensacionAnimada();
        const inicio = Date.now();

        const tick = () => {
            actualizarCompensacionBloqueSuperior();
            if (tecladoDesdeCantidadPrincipalRef.current && (Date.now() - inicio) < duracionMs) {
                compensacionRafRef.current = requestAnimationFrame(tick);
            } else {
                compensacionRafRef.current = null;
            }
        };

        compensacionRafRef.current = requestAnimationFrame(tick);
    }, [actualizarCompensacionBloqueSuperior, cancelarCompensacionAnimada]);

    const normalizarMetodoPagoEdicion = useCallback((metodoRaw) => {
        const metodo = String(metodoRaw || 'EFECTIVO').trim().toUpperCase();
        return METODOS_PAGO_VALIDOS_EDICION.includes(metodo) ? metodo : 'EFECTIVO';
    }, []);

    const formatearHoraEdicion = useCallback((fechaRaw) => {
        if (!fechaRaw) return '';
        const fecha = new Date(fechaRaw);
        if (Number.isNaN(fecha.getTime())) return '';
        return fecha.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    }, []);

    const ventaYaFueModificada = useCallback((venta) => {
        const flagEditada = venta?.editada === true || String(venta?.editada || '').toLowerCase() === 'true';
        const conteoEdiciones = Number(venta?.veces_editada || 0);
        return flagEditada || conteoEdiciones > 0;
    }, []);

    // Verifica si el método de pago ya fue cambiado (independiente de edición de productos)
    const ventaYaCambioMetodoPago = useCallback((venta) => {
        return venta?.metodo_pago_cambiado === true ||
            String(venta?.metodo_pago_cambiado || '').toLowerCase() === 'true';
    }, []);

    const fusionarMetaEdicionHistorial = useCallback((itemBase, itemLocal) => {
        if (!itemBase) return itemLocal || itemBase;
        if (!itemLocal || !ventaYaFueModificada(itemLocal)) return itemBase;

        return {
            ...itemBase,
            editada: true,
            veces_editada: Math.max(Number(itemBase?.veces_editada || 0), Number(itemLocal?.veces_editada || 0), 1),
            fecha_ultima_edicion: itemBase?.fecha_ultima_edicion || itemLocal?.fecha_ultima_edicion || null,
            dispositivo_ultima_edicion: itemBase?.dispositivo_ultima_edicion || itemLocal?.dispositivo_ultima_edicion || '',
            metodo_pago: itemBase?.metodo_pago || itemLocal?.metodo_pago,
            fecha_actualizacion: itemBase?.fecha_actualizacion || itemBase?.fecha_ultima_edicion || itemLocal?.fecha_ultima_edicion || itemLocal?.fecha_actualizacion,
            detalles: Array.isArray(itemBase?.detalles) && itemBase.detalles.length > 0
                ? itemBase.detalles
                : (Array.isArray(itemLocal?.detalles) ? itemLocal.detalles : (Array.isArray(itemLocal?.productos) ? itemLocal.productos : [])),
            productos_vencidos: Array.isArray(itemBase?.productos_vencidos) && itemBase.productos_vencidos.length > 0
                ? itemBase.productos_vencidos
                : (Array.isArray(itemLocal?.productos_vencidos) ? itemLocal.productos_vencidos : (Array.isArray(itemLocal?.vencidas) ? itemLocal.vencidas : [])),
            evidencias: Array.isArray(itemBase?.evidencias) && itemBase.evidencias.length > 0
                ? itemBase.evidencias
                : (Array.isArray(itemLocal?.evidencias) ? itemLocal.evidencias : []),
            foto_vencidos: itemBase?.foto_vencidos || itemLocal?.foto_vencidos || null,
        };
    }, [ventaYaFueModificada]);

    const esErrorVentaYaModificada = useCallback((error) => {
        const codigo = String(error?.code || error?.payload?.codigo || '').toUpperCase();
        const mensaje = String(error?.message || '').toUpperCase();
        return (
            codigo === 'VENTA_YA_MODIFICADA' ||
            mensaje.includes('VENTA_YA_MODIFICADA') ||
            mensaje.includes('YA FUE MODIFICADA UNA VEZ')
        );
    }, []);

    const asegurarVisibilidadInputEdicion = useCallback((
        index = 0,
        delayMs = 0,
        forzarTecladoAbierto = null,
        evitarBajarConTeclado = false
    ) => {
        const tecladoActivo = typeof forzarTecladoAbierto === 'boolean'
            ? forzarTecladoAbierto
            : tecladoAbierto;

        const ejecutar = () => {
            try {
                const baseY = Math.max(0, index * 86);

                if (tecladoActivo && evitarBajarConTeclado) {
                    // Igual que venta normal: con teclado abierto, evitar "bajón"
                    // y mover solo si la fila quedó tapada por debajo.
                    const actual = scrollOffsetEdicionRef.current || 0;
                    const altoFila = 86;
                    const viewport = Math.max(120, alturaListaEdicionConTeclado);
                    const rowTop = Math.max(0, baseY - altoFila);
                    const rowBottom = rowTop + altoFila;
                    const visibleTop = actual;
                    const visibleBottom = actual + viewport - 12;
                    const tolerancia = 36;

                    // Si ya está visible, no tocar scroll (evita "subida" innecesaria).
                    if (rowTop >= visibleTop && rowBottom <= (visibleBottom + tolerancia)) {
                        return;
                    }

                    const target = Math.max(0, rowBottom - (viewport - 22));
                    const destinoSeguro = Math.max(target, actual);
                    listaEdicionRef.current?.scrollTo({ y: destinoSeguro, animated: false });
                    return;
                }

                const destinoY = tecladoActivo ? Math.max(0, baseY - 102) : baseY;
                listaEdicionRef.current?.scrollTo({ y: destinoY, animated: !tecladoActivo });
            } catch (e) {
                // sin bloqueo
            }
        };

        if (delayMs > 0) {
            setTimeout(ejecutar, delayMs);
            return;
        }

        requestAnimationFrame(ejecutar);
    }, [tecladoAbierto, alturaListaEdicionConTeclado]);

    useEffect(() => {
        carritoRef.current = carrito;
    }, [carrito]);

    useEffect(() => {
        carritoEdicionRef.current = carritoEdicion;
    }, [carritoEdicion]);

    useEffect(() => {
        const timeoutId = setTimeout(() => {
            refrescarBaseBloqueSuperior();
        }, 120);

        return () => clearTimeout(timeoutId);
    }, [refrescarBaseBloqueSuperior]);

    // 🚀 Auto-foco en el buscador al seleccionar cliente (Venta Rápida)
    useEffect(() => {
        if (clienteSeleccionado && clienteSeleccionado.id !== 'general') {
            // Un pequeño delay para asegurar que la UI se haya acomodado
            setTimeout(() => {
                buscadorRef.current?.focus();
            }, 500);
        }
    }, [clienteSeleccionado]);

    useEffect(() => {
        const debounceId = setTimeout(() => {
            setBusquedaProductoDebounced(busquedaProducto);
        }, 140);

        return () => clearTimeout(debounceId);
    }, [busquedaProducto]);

    const manejarBusquedaProducto = useCallback((texto) => {
        setBusquedaProducto(texto);

        // 🚀 Optimización: Si el texto está vacío (X presionada), limpiar el filtro inmediatamente
        // sin esperar los 140ms del debounce.
        if (!texto) {
            setBusquedaProductoDebounced('');
        }

        // Al filtrar manualmente, reiniciar la lista para mostrar el primer
        // resultado visible sin depender del scroll anterior.
        if (listaProductosRef.current) {
            requestAnimationFrame(() => {
                try {
                    listaProductosRef.current?.scrollToOffset({ offset: 0, animated: false });
                    scrollOffsetProductosRef.current = 0;
                } catch (e) {
                    // Sin bloqueo si FlatList aun no esta lista.
                }
            });
        }
    }, [setBusquedaProductoDebounced]);

    const contarPendientesSincronizables = useCallback((pendientes = []) => (
        (pendientes || []).filter((venta) => !(
            venta?.requiere_revision === true ||
            String(venta?.estado_sync || '').trim().toUpperCase() === 'REVISION'
        )).length
    ), []);

    const contarPendientesEnRevision = useCallback((pendientes = []) => (
        Math.max(0, (pendientes || []).length - contarPendientesSincronizables(pendientes))
    ), [contarPendientesSincronizables]);

    const mostrarConfirmacionSyncRapida = useCallback((enviadas) => {
        setTextoModalSyncRapido(
            enviadas === 1 ? 'Venta offline enviada' : `${enviadas} ventas offline enviadas`
        );
        setMostrarModalSyncRapido(true);

        if (modalSyncTimerRef.current) clearTimeout(modalSyncTimerRef.current);
        modalSyncTimerRef.current = setTimeout(() => {
            setMostrarModalSyncRapido(false);
        }, 1800);
    }, []);

    const sincronizarPendientesAutomatico = useCallback(async ({ forzar = false } = {}) => {
        if (!forzar && !hayInternet) return;
        if (sincronizandoAutoRef.current) return;

        try {
            const pendientesAntes = await obtenerVentasPendientes();
            const pendientesAntesSincronizables = contarPendientesSincronizables(pendientesAntes);
            setVentasPendientes(pendientesAntesSincronizables);
            if (pendientesAntesSincronizables === 0) return;

            sincronizandoAutoRef.current = true;
            setEstadoBanner('sincronizando');

            // Timeout de seguridad: si en 15s no resuelve (internet intermitente), limpiar el banner
            const timeoutSeguridad = setTimeout(() => {
                if (sincronizandoAutoRef.current) {
                    sincronizandoAutoRef.current = false;
                    setEstadoBanner(null);
                }
            }, 15000);

            let resultado;
            try {
                resultado = await sincronizarVentasPendientes();
            } finally {
                clearTimeout(timeoutSeguridad);
            }
            const enviadas = resultado?.sincronizadas || 0;

            const pendientesDespues = await obtenerVentasPendientes();
            setVentasPendientes(contarPendientesSincronizables(pendientesDespues));

            // Detectar ventas/ediciones que quedaron en revisión (cualquier error permanente)
            const enRevision = pendientesDespues.filter(v => v?.requiere_revision === true);
            if (enRevision.length > 0) {
                const codigoError = (v) => String(v?.codigo_error || v?.motivo_error || '').toUpperCase();
                const esConflictoEdicion = (v) =>
                    codigoError(v).includes('YA_MODIFICADA') ||
                    codigoError(v).includes('YA FUE MODIFICADA') ||
                    codigoError(v).includes('NO SE PERMITEN') ||
                    codigoError(v).includes('YA FUE EDITADA');
                const esStockInsuficiente = (v) =>
                    codigoError(v).includes('STOCK_CARGUE_INSUFICIENTE') ||
                    codigoError(v).includes('STOCK_INSUFICIENTE_CARGUE') ||
                    codigoError(v).includes('STOCK DISPONIBLE DEL CARGUE');

                const filas = enRevision.map(v => {
                    const nombre = v?.data?.nombre_negocio || v?.data?.cliente_nombre || v?.data?.cliente_negocio || 'Cliente desconocido';
                    let motivo = '';
                    if (esConflictoEdicion(v)) motivo = ' (ya fue editada antes)';
                    else if (esStockInsuficiente(v)) motivo = ' (stock insuficiente en cargue)';
                    else if (v?.motivo_error) motivo = `: ${v.motivo_error}`;
                    return `• ${nombre}${motivo}`;
                }).join('\n');

                Alert.alert(
                    '⚠️ Edición no guardada',
                    `${enRevision.length} venta(s) no pudieron actualizarse en el servidor:\n\n${filas}\n\nLa venta quedó con sus valores originales. Puedes volver a editarla.`,
                    [{
                        text: 'Entendido',
                        style: 'default',
                        onPress: async () => {
                            for (const v of enRevision) {
                                const id = v?.id || v?.data?.id_local || v?.data?.id;
                                if (id) await descartarVentaEnRevision(id);
                            }
                        }
                    }]
                );
            }

            if (enviadas > 0) {
                setVentasSincronizadas(enviadas);
                setEstadoBanner('exito');
                if (bannerTimerRef.current) clearTimeout(bannerTimerRef.current);
                bannerTimerRef.current = setTimeout(() => setEstadoBanner(null), 3500);
                mostrarConfirmacionSyncRapida(enviadas);

                // 🔧 Actualizar IDs de backend en ventasDelDia tras sincronización exitosa.
                // guardarVenta() actualiza AsyncStorage con el ID numérico del backend,
                // pero ventasDelDia (estado React) queda con el ID local viejo.
                // Sin esto, esVentaBackendPersistida() retorna false y la edición no se envía.
                try {
                    const ventasStorage = await obtenerVentas();
                    const resolverIdBackend = (v) => {
                        const idLocal = v.id_local || v.id;
                        const match = ventasStorage.find(vs =>
                            (vs.id_local && vs.id_local === idLocal) ||
                            (vs.id && vs.id === v.id)
                        );
                        if (match && match.id !== v.id) {
                            return { ...v, id: match.id, id_local: v.id_local || v.id, sincronizada: true };
                        }
                        return v;
                    };
                    setVentasDelDia(prev => prev.map(resolverIdBackend));
                    setHistorialReimpresion(prev => prev.map(resolverIdBackend));
                    setHistorialResumenPreview(prev => prev.map(resolverIdBackend));
                } catch (e) {
                    console.log('⚠️ No se pudo actualizar IDs tras sync:', e?.message);
                }
            } else if (pendientesDespues.length === 0) {
                setEstadoBanner(null);
            } else {
                setEstadoBanner(null);
            }
        } catch (e) {
            if (!hayInternet) {
                setEstadoBanner('offline');
            } else {
                setEstadoBanner(null);
            }
        } finally {
            sincronizandoAutoRef.current = false;
        }
    }, [hayInternet, mostrarConfirmacionSyncRapida, contarPendientesSincronizables]);

    // 🆕 Monitor de conectividad — detecta cambios de red y sincroniza ventas pendientes
    useEffect(() => {
        const precalentarImpresionSiHayInternet = async () => {
            try {
                await precalentarConfigImpresion();
            } catch (error) {
                console.log('⚠️ No se pudo precalentar config de impresión:', error?.message || error);
            }
        };

        const unsubscribe = NetInfo.addEventListener(async (state) => {
            const conectado = state.isConnected && state.isInternetReachable !== false;
            setHayInternet(conectado);

            if (!conectado) {
                // Sin internet → mostrar banner naranja
                if (bannerTimerRef.current) clearTimeout(bannerTimerRef.current);
                setEstadoBanner('offline');
            } else {
                // Volvió internet → quitar banner offline PRIMERO, luego sincronizar
                setEstadoBanner(null);
                await precalentarImpresionSiHayInternet();
                await sincronizarPendientesAutomatico({ forzar: true });
            }
        });

        precalentarImpresionSiHayInternet();

        return () => {
            unsubscribe();
            if (bannerTimerRef.current) clearTimeout(bannerTimerRef.current);
            if (modalSyncTimerRef.current) clearTimeout(modalSyncTimerRef.current);
        };
    }, [sincronizarPendientesAutomatico]);

    // Auto-sincronización cada 5s cuando hay internet (sin tocar nada)
    useEffect(() => {
        if (!hayInternet) return;
        const intervalId = setInterval(() => {
            sincronizarPendientesAutomatico();
        }, 30000); // 30 segundos (antes 5s) para no saturar en mala señal

        return () => clearInterval(intervalId);
    }, [hayInternet, sincronizarPendientesAutomatico]);

    // 🆕 Verificar flags de permisos de ruta (se llama al montar y al abrir selector)
    const verificarFlagsRuta = useCallback(async () => {
        const fallback = {
            crear: flagCrearCliente,
            rapida: flagVentaRapida,
            tope: Number(topeVentaRutaOcasional) || 60000,
        };

        if (!userId) return fallback;
        try {
            const resp = await fetch(`${API_URL}/api/rutas/?vendedor_id=${userId}`);
            if (resp.ok) {
                const rutas = await resp.json();
                if (rutas.length > 0) {
                    const crear = rutas.every(r => r.permitir_crear_cliente !== false);
                    const rapida = rutas.every(r => r.permitir_venta_rapida !== false);
                    const topes = rutas.map((ruta) => parseFloat(ruta?.tope_cliente_ocasional || 60000) || 60000);
                    const tope = topes.length > 0 ? Math.max(...topes) : 60000;
                    setFlagCrearCliente(crear);
                    setFlagVentaRapida(rapida);
                    setTopeVentaRutaOcasional(tope);
                    return { crear, rapida, tope };
                }
            }
        } catch (e) {
            // Silencioso — sin internet no bloquea nada
        }
        return fallback;
    }, [userId, flagCrearCliente, flagVentaRapida, topeVentaRutaOcasional]);

    // Verificar al montar VentasScreen (1 sola vez)
    useEffect(() => {
        verificarFlagsRuta();
    }, [verificarFlagsRuta]);

    // 🆕 Cargar Pedidos
    const verificarPedidosPendientes = async (fechaStr) => {
        try {
            // Usar fecha proporcionada o la seleccionada
            let fecha = fechaStr;
            if (!fecha && fechaSeleccionada) {
                fecha = `${fechaSeleccionada.getFullYear()}-${String(fechaSeleccionada.getMonth() + 1).padStart(2, '0')}-${String(fechaSeleccionada.getDate()).padStart(2, '0')}`;
            }
            // Si no hay fecha ni userId, salir
            if (!fecha || !userId) return;

            const cacheKey = `pedidos_cache_${userId}_${fecha}`;

            // 🚀 CACHE-FIRST: Cargar caché inmediatamente
            try {
                const cached = await AsyncStorage.getItem(cacheKey);
                if (cached) {
                    const datosCache = JSON.parse(cached);
                    setPedidosPendientes(datosCache.pendientes || []);
                    setPedidosEntregadosHoy(datosCache.entregados || []);
                    setPedidosNoEntregadosHoy(datosCache.noEntregados || []);
                    console.log(`💾 Pedidos cargados desde caché (${datosCache.pendientes?.length || 0} pendientes)`);
                }
            } catch (errCache) {
                console.log('⚠️ Error leyendo caché de pedidos:', errCache?.message);
            }

            // 🌐 Actualizar desde backend en segundo plano
            console.log(`📦 Actualizando pedidos desde backend para ${userId} en ${fecha}`);
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 12000); // 12 segundos (reducido para señal media)
            const headersAuth = await obtenerAuthHeaders();

            const response = await fetch(`${ENDPOINTS.PEDIDOS_PENDIENTES}?vendedor_id=${userId}&fecha=${fecha}`, {
                headers: headersAuth,
                signal: controller.signal
            });
            clearTimeout(timeoutId);

            if (response.ok) {
                const data = await response.json();
                if (Array.isArray(data)) {
                    // 🆕 Incluir: 1) Pendientes normales, 2) ANULADOS reportados desde App (No Entregados)
                    // Excluir: ANULADOS administrativos y ENTREGADOS
                    const pendientes = data.filter(p =>
                        (p.estado !== 'ENTREGADO' && p.estado !== 'ENTREGADA' && p.estado !== 'ANULADA') ||
                        (p.estado === 'ANULADA' && p.nota?.toLowerCase().includes('entregado')) // Case-insensitive
                    );

                    const entregados = data.filter(p => p.estado === 'ENTREGADO' || p.estado === 'ENTREGADA').map(p => ({
                        id: p.id,
                        destinatario: p.destinatario,
                        numero_pedido: p.numero_pedido,
                        total: parseFloat(p.total) || 0,
                        estado: 'ENTREGADA', // 🔧 Inyectar estado explícito para deshabilitar botones
                        fecha: p.fecha_actualizacion || p.fecha || p.fecha_entrega,
                        fecha_actualizacion: p.fecha_actualizacion
                    }));

                    // 🆕 SOLO mostrar pedidos anulados desde App Móvil (no los del frontend)
                    const noEntregados = data.filter(p =>
                        p.estado === 'ANULADA' &&
                        p.nota?.toLowerCase().includes('entregado') // Case-insensitive
                    ).map(p => ({
                        id: p.id,
                        destinatario: p.destinatario,
                        numero_pedido: p.numero_pedido,
                        estado: 'ANULADA',
                        total: parseFloat(p.total) || 0
                    }));

                    setPedidosPendientes(pendientes);
                    setPedidosEntregadosHoy(entregados);
                    setPedidosNoEntregadosHoy(noEntregados);

                    // 💾 Guardar en caché
                    try {
                        await AsyncStorage.setItem(cacheKey, JSON.stringify({
                            pendientes,
                            entregados,
                            noEntregados,
                            timestamp: Date.now()
                        }));
                    } catch (errSave) {
                        console.log('⚠️ Error guardando caché de pedidos:', errSave?.message);
                    }

                    console.log(`✅ ${pendientes.length} pedidos pendientes, ${entregados.length} entregados (actualizado desde backend)`);
                }
            }
        } catch (e) {
            console.log('⚠️ Error actualizando pedidos desde backend (usando caché):', e?.message || e);
        }
    };

    const abrirSelectorCliente = async () => {
        // 🚀 Abrir inmediatamente para mejor UX
        setMostrarSelectorCliente(true);

        // Refrescar pedidos y flags en segundo plano
        verificarPedidosPendientes();
        verificarFlagsRuta();
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
                        const nuevosPrecios = {}; // 🆕
                        let encontrados = 0;

                        pedido.detalles.forEach(d => {
                            // Buscar producto en catálogo local por ID o nombre
                            const prodReal = productos.find(p => p.id === d.producto || p.nombre === d.producto_nombre);

                            if (prodReal) {
                                encontrados++;

                                // 🆕 Guardar precio original del pedido para que no se pierda al editar
                                const precioUnitario = parseFloat(d.precio_unitario);
                                nuevosPrecios[prodReal.id] = precioUnitario;

                                // Construir objeto carrito con ID como clave
                                nuevoCarrito[prodReal.id] = {
                                    ...prodReal, // ID, nombre, imagen, etc
                                    cantidad: d.cantidad,
                                    precio: precioUnitario, // Usar precio del pedido
                                    subtotal: precioUnitario * d.cantidad
                                };
                            }
                        });

                        setPreciosPersonalizados(nuevosPrecios); // 🆕 Persistir precios especiales
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
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 8000); // 🔧 Reducido de 25s a 8s
            const headersAuth = await obtenerAuthHeaders({ 'Content-Type': 'application/json' });

            const response = await fetch(ENDPOINTS.PEDIDO_MARCAR_NO_ENTREGADO(pedidoEnNovedad.id), {
                method: 'POST',
                headers: headersAuth,
                body: JSON.stringify({ motivo: motivoNovedad }),
                signal: controller.signal
            });
            clearTimeout(timeoutId);

            if (response.ok) {
                Alert.alert('Registrado', 'La novedad ha sido reportada.');

                // 🆕 Agregar a lista local de no entregados
                setPedidosNoEntregadosHoy(prev => [...prev, {
                    id: pedidoEnNovedad.id,
                    destinatario: pedidoEnNovedad.destinatario || 'Cliente',
                    numero_pedido: pedidoEnNovedad.numero_pedido,
                    total: parseFloat(pedidoEnNovedad.total) || 0
                }]);

                // 🆕 Actualizar el pedido en la lista de pendientes para marcarlo como anulado
                // En lugar de eliminarlo, lo marcamos como ANULADA localmente
                setPedidosPendientes(prev => prev.map(p =>
                    p.id === pedidoEnNovedad.id
                        ? { ...p, estado: 'ANULADA', nota: `No entregado: ${motivoNovedad}${p.nota ? ' | ' + p.nota : ''}` }
                        : p
                ));

                // 🆕 Limpiar selección
                setPedidoClienteSeleccionado(null);

                setModalNovedadVisible(false);
                setMotivoNovedad('');

                // 🆕 UX: avanzar automáticamente al siguiente cliente
                avanzarAlSiguienteCliente({ limpiarAntes: false, mostrarAvisoFin: true });

            } else {
                Alert.alert('Error', 'No se pudo registrar la novedad.');
            }
        } catch (error) {
            console.error(error);
            // OFFLINE FALLBACK
            try {
                const accionPendiente = {
                    tipo: 'NO_ENTREGADO',
                    id: pedidoEnNovedad.id,
                    motivo: motivoNovedad,
                    fecha_accion: new Date().toISOString()
                };
                const pendientes = JSON.parse(await AsyncStorage.getItem('pedidos_acciones_pendientes') || '[]');
                pendientes.push(accionPendiente);
                await AsyncStorage.setItem('pedidos_acciones_pendientes', JSON.stringify(pendientes));

                // Actualizar UI Local
                setPedidosNoEntregadosHoy(prev => [...prev, {
                    id: pedidoEnNovedad.id,
                    destinatario: pedidoEnNovedad.destinatario || 'Cliente',
                    numero_pedido: pedidoEnNovedad.numero_pedido,
                    total: parseFloat(pedidoEnNovedad.total) || 0
                }]);

                setPedidosPendientes(prev => prev.map(p =>
                    p.id === pedidoEnNovedad.id
                        ? { ...p, estado: 'ANULADA', nota: `No entregado: ${motivoNovedad}${p.nota ? ' | ' + p.nota : ''} [OFFLINE]` }
                        : p
                ));

                setPedidoClienteSeleccionado(null);
                setModalNovedadVisible(false);
                setMotivoNovedad('');
                avanzarAlSiguienteCliente({ limpiarAntes: false, mostrarAvisoFin: true });

                Alert.alert(
                    '📴 Novedad Guardada Offline',
                    `Sin conexión. La novedad del pedido #${pedidoEnNovedad.numero_pedido} se guardó en tu celular y se sincronizará cuando regrese internet.`
                );
            } catch (e) {
                console.error("Error guardando novedad offline", e);
                Alert.alert('Error', 'No se pudo guardar la novedad ni siquiera offline.');
            }
        }
    };

    const marcarPedidoEntregado = (pedido) => {
        setPedidoParaEntregar(pedido);
        setMostrarResumenEntrega(true);
    };

    const confirmarEntregaPedido = async (tieneVencidas = false, metodoPago = 'EFECTIVO') => {
        if (!pedidoParaEntregar) return;

        // 🔥 VALIDAR: Si no tiene ID de pedido real, es una venta normal con precios especiales
        if (!pedidoParaEntregar.id || !pedidoParaEntregar.numero_pedido) {
            console.log('⚠️ No es un pedido real, procesando como venta normal');
            setMostrarResumenEntrega(false);
            // Procesar como venta normal
            confirmarVenta(fechaSeleccionada, metodoPago, {});
            return;
        }

        // 🆕 LÓGICA DE EDICIÓN: Si hay un pedido seleccionado en modo edición, usamos confirmarVenta
        if (pedidoClienteSeleccionado && ventaTemporal) {
            console.log('🔄 Confirmando pedido editado con método:', metodoPago);
            setMostrarResumenEntrega(false); // Cerrar modal pequeño

            // Llamar a confirmarVenta con el método de pago seleccionado
            // confirmarVenta usa ventaTemporal que ya fue seteado en completarVenta
            confirmarVenta(fechaSeleccionada, metodoPago, {});
            return;
        }

        // Marcar como entregado siempre (vencidas se reportan manualmente después)
        // 🆕 Ahora enviamos el metodo_pago seleccionado

        try {
            // Enviar metodo_pago en el cuerpo del POST
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 8000); // 🔧 Reducido de 25s a 8s para mejor UX
            const headersAuth = await obtenerAuthHeaders({ 'Content-Type': 'application/json' });

            const response = await fetch(ENDPOINTS.PEDIDO_MARCAR_ENTREGADO(pedidoParaEntregar.id), {
                method: 'POST',
                headers: headersAuth,
                body: JSON.stringify({ metodo_pago: metodoPago }),
                signal: controller.signal
            });
            clearTimeout(timeoutId);
            const data = await response.json();

            setMostrarResumenEntrega(false);

            if (data.success) {
                setPedidosEntregadosHoy(prev => [...prev, {
                    id: pedidoParaEntregar.id,
                    destinatario: pedidoParaEntregar.destinatario || clienteSeleccionado?.negocio || 'Cliente',
                    numero_pedido: pedidoParaEntregar.numero_pedido,
                    metodo_pago: metodoPago,
                    total: parseFloat(pedidoParaEntregar.total) || 0,
                    fecha: new Date().toISOString(),
                    fecha_actualizacion: new Date().toISOString()
                }]);

                setPedidosPendientes(prev => prev.map(p =>
                    p.id === pedidoParaEntregar.id ? { ...p, estado: 'ENTREGADO' } : p
                ));

                setPedidoClienteSeleccionado(null);
                setPedidoParaEntregar(null);
                avanzarAlSiguienteCliente({ limpiarAntes: false, mostrarAvisoFin: true });

                if (tieneVencidas) {
                    Alert.alert(
                        '✅ Pedido Entregado',
                        `Pago: ${metodoPago}

El pedido #${pedidoParaEntregar.numero_pedido} ha sido marcado como entregado.

⚠️ Recuerda reportar las vencidas usando el botón "Vencidas" del cliente.`
                    );
                } else {
                    Alert.alert(
                        '✅ Pedido Entregado',
                        `Pago: ${metodoPago}

El pedido #${pedidoParaEntregar.numero_pedido} ha sido marcado como entregado exitosamente.`
                    );
                }

            } else {
                Alert.alert('Error', data.message || 'No se pudo actualizar el pedido');
            }
        } catch (e) {
            setMostrarResumenEntrega(false);
            const mensajeErrorEntrega = String(e?.message || '');
            const esErrorConexionEntrega =
                e?.name === 'AbortError' ||
                mensajeErrorEntrega.includes('Network request failed') ||
                mensajeErrorEntrega.includes('Network Error') ||
                mensajeErrorEntrega.includes('fetch');

            if (esErrorConexionEntrega) {
                console.log('📴 Entrega de pedido sin internet, activando fallback offline');
            } else {
                console.error(e);
            }

            // 🔧 MOSTRAR ALERT CLARO ANTES DEL FALLBACK
            Alert.alert(
                '⚠️ Sin Conexión',
                'No se pudo conectar con el servidor.\n\nEl pedido se guardará localmente y se sincronizará cuando tengas internet.',
                [{ text: 'Entendido', style: 'default' }]
            );

            // OFFLINE FALLBACK
            try {
                const accionPendiente = {
                    tipo: 'ENTREGADO',
                    id: pedidoParaEntregar.id,
                    metodo_pago: metodoPago,
                    fecha_accion: new Date().toISOString()
                };
                const pendientes = JSON.parse(await AsyncStorage.getItem('pedidos_acciones_pendientes') || '[]');
                // Evitar duplicados: si ya hay una acción ENTREGADO para este pedido, no agregar otra
                const yaExiste = pendientes.some(a => a.id === accionPendiente.id && a.tipo === 'ENTREGADO');
                if (!yaExiste) {
                    pendientes.push(accionPendiente);
                    await AsyncStorage.setItem('pedidos_acciones_pendientes', JSON.stringify(pendientes));
                }

                // Actualizar UI localmente
                setPedidosEntregadosHoy(prev => [...prev, {
                    id: pedidoParaEntregar.id,
                    destinatario: pedidoParaEntregar.destinatario || clienteSeleccionado?.negocio || 'Cliente',
                    numero_pedido: pedidoParaEntregar.numero_pedido,
                    metodo_pago: metodoPago,
                    total: parseFloat(pedidoParaEntregar.total) || 0,
                    fecha: new Date().toISOString(),
                    fecha_actualizacion: new Date().toISOString()
                }]);

                setPedidosPendientes(prev => prev.map(p =>
                    p.id === pedidoParaEntregar.id ? { ...p, estado: 'ENTREGADO' } : p
                ));

                setPedidoClienteSeleccionado(null);
                setPedidoParaEntregar(null);
                avanzarAlSiguienteCliente({ limpiarAntes: false, mostrarAvisoFin: true });

                if (tieneVencidas) {
                    Alert.alert(
                        '📴 Guardado Offline',
                        `Sin conexión. Pedido #${pedidoParaEntregar.numero_pedido} marcado como entregado (${metodoPago}).\nSe sincronizará al tener internet.\n\n⚠️ Reporta vencidas con el botón "Vencidas".`
                    );
                } else {
                    Alert.alert('📴 Guardado Offline', `Sin conexión. Pedido #${pedidoParaEntregar.numero_pedido} marcado como entregado (${metodoPago}) en tu celular.`);
                }
            } catch (err) {
                console.error("Error al guardar entrega offline", err);
                Alert.alert('Error', 'No se pudo actualizar el pedido. Revisa tu conexión.');
            }
        }
    };


    const [nota, setNota] = useState('');
    const [clientes, setClientes] = useState([]);
    const [refreshClientesToken, setRefreshClientesToken] = useState(0);

    // Estados para modales
    const [mostrarSelectorCliente, setMostrarSelectorCliente] = useState(false);
    const [mostrarModalCliente, setMostrarModalCliente] = useState(false);
    const [mostrarModalOcasional, setMostrarModalOcasional] = useState(false); // 🆕 Modal Cliente Ocasional
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

    // 🆕 Flags de permisos de ruta (controlados desde la web)
    const [flagCrearCliente, setFlagCrearCliente] = useState(true);
    const [flagVentaRapida, setFlagVentaRapida] = useState(true);
    const [topeVentaRutaOcasional, setTopeVentaRutaOcasional] = useState(60000);

    // 🆕 Estado para cerrar turno
    const [mostrarModalCerrarTurno, setMostrarModalCerrarTurno] = useState(false);
    const [mostrarNotaModal, setMostrarNotaModal] = useState(false); // 🆕 Estado para modal notas
    const [mostrarModalTurnoCerrado, setMostrarModalTurnoCerrado] = useState(false); // 🆕 Modal turno ya cerrado
    const [fechaTurnoCerrado, setFechaTurnoCerrado] = useState(''); // 🆕 Fecha del turno cerrado
    const [totalVentasHoy, setTotalVentasHoy] = useState(0);
    const [totalDineroHoy, setTotalDineroHoy] = useState(0);

    // 🆕 Estado para turno abierto (indicador visual)
    const [preciosPersonalizados, setPreciosPersonalizados] = useState({}); // 🆕 Precios originales de pedidos editados
    const [turnoAbierto, setTurnoAbierto] = useState(false);
    const [horaTurno, setHoraTurno] = useState(null);
    const [diferenciaPrecios, setDiferenciaPrecios] = useState(0); // 🆕 Diferencia por precios especiales

    // 🆕 Estado para stock del cargue
    const [stockCargue, setStockCargue] = useState({});

    // 🆕 useRef para evitar duplicación de ventas (reemplaza window.__guardandoVenta)
    const guardandoVentaRef = React.useRef(false);

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
            // 🆕 VALIDACIÓN: Verificar que el día seleccionado coincida con la fecha
            const diaRealDeFecha = DIAS_MAP[date.getDay()]; // Día real de la fecha (ej: MARTES)
            const diaSeleccionadoUpper = diaSeleccionado.toUpperCase();

            if (diaRealDeFecha !== diaSeleccionadoUpper) {
                // La fecha no coincide con el día seleccionado
                const fechaFormateada = date.toLocaleDateString('es-ES', {
                    day: '2-digit',
                    month: '2-digit',
                    year: 'numeric'
                });

                Alert.alert(
                    '⚠️ Fecha Incorrecta',
                    `La fecha seleccionada (${fechaFormateada}) es ${diaRealDeFecha}, pero elegiste ${diaSeleccionadoUpper}.\n\n¿Deseas continuar de todas formas?`,
                    [
                        {
                            text: 'Cancelar',
                            style: 'cancel',
                            onPress: () => {
                                // Volver a mostrar el selector de fecha
                                setMostrarDatePicker(true);
                            }
                        },
                        {
                            text: 'Continuar',
                            style: 'destructive',
                            onPress: () => {
                                // Continuar con la fecha incorrecta (para pruebas)
                                console.log(`⚠️ Usuario confirmó fecha incorrecta: ${diaSeleccionadoUpper} con fecha ${fechaFormateada}`);
                                procesarAperturaTurno(date);
                            }
                        }
                    ]
                );
                return;
            }

            // Si la fecha coincide, continuar normalmente
            procesarAperturaTurno(date);
        }
    };

    // 🆕 Función auxiliar para procesar la apertura del turno (extraída para reutilizar)
    const procesarAperturaTurno = async (date) => {
        setFechaSeleccionada(date);

        // Cargar inventario del cargue con la fecha seleccionada y capturar resultado
        const infoCargue = await cargarStockCargue(diaSeleccionado, date);

        // 🆕 Formatear fecha para usar en todas las llamadas
        const fechaFormatted = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;

        // 🆕 Cargar pedidos ANTES de verificar
        await verificarPedidosPendientes(fechaFormatted);

        // 🆕 VERIFICAR ESTADO DEL CARGUE Y PEDIDOS ANTES de abrir turno
        const tienePedidos = pedidosPendientes.length > 0;
        const hayCargue = infoCargue?.hayCargue || false;
        const estadoCargue = infoCargue?.estado || 'DESCONOCIDO';
        const totalProductos = infoCargue?.totalProductos || 0;
        const esOffline = infoCargue?.offline || false; // 🆕 Identificar si falló por falta de red
        const cargueEnDespacho = hayCargue && estadoCargue === 'DESPACHO';

        // 🚫 POLÍTICA ESTRICTA: SOLO permite abrir si hay cargue EN DESPACHO
        // 🆕 EXCEPCIÓN: Si estamos offline, permitir la apertura para poder trabajar
        if (!cargueEnDespacho && !esOffline) {
            let mensajeBloqueo = '';

            if (!hayCargue) {
                // NO HAY CARGUE
                mensajeBloqueo = `⚠️ ATENCIÓN: No hay cargue asignado para este día.\n\n` +
                    `❌ Sin stock cargado\n\n` +
                    `Para poder abrir el turno, necesitas que te asignen un cargue y que esté en estado DESPACHO.\n\n` +
                    `Contacta a tu supervisor.`;
            } else {
                // HAY CARGUE pero NO está en DESPACHO
                mensajeBloqueo = `⚠️ ATENCIÓN: El cargue NO está listo para despacho.\n\n` +
                    `📦 Estado actual: ${estadoCargue}\n` +
                    `✅ ${totalProductos} productos cargados\n\n` +
                    `Para poder abrir el turno, el cargue debe estar en estado DESPACHO.\n\n` +
                    `Espera a que tu supervisor cambie el estado a DESPACHO en el sistema.`;
            }

            Alert.alert(
                '🚫 NO PUEDES ABRIR TURNO',
                mensajeBloqueo,
                [
                    {
                        text: 'Volver al Menú',
                        onPress: () => {
                            if (navigation) {
                                navigation.goBack();
                            }
                        }
                    }
                ]
            );
            return; // 🚫 NO abrir turno
        }

        // ✅ CARGUE EN DESPACHO - Abrir turno normalmente
        await abrirTurnoConfirmado(date, fechaFormatted, infoCargue);
    };

    // 🆕 Función para abrir turno (confirmado o forzado)
    const abrirTurnoConfirmado = async (date, fechaFormatted, infoCargue) => {
        try {
            // 🆕 Llamar al backend para abrir turno (persistir estado)
            try {
                const controller = new AbortController();
                const timeoutId = setTimeout(() => controller.abort(), 10000); // 🔧 Reducido de 25s a 10s
                const headersAuth = await obtenerAuthHeaders({ 'Content-Type': 'application/json' });

                const response = await fetch(ENDPOINTS.TURNO_ABRIR, {
                    method: 'POST',
                    headers: headersAuth,
                    body: JSON.stringify({
                        vendedor_id: userId,
                        vendedor_nombre: vendedorNombre || `Vendedor ${userId}`,
                        dia: diaSeleccionado,
                        fecha: fechaFormatted,
                        dispositivo: Platform.OS
                    }),
                    signal: controller.signal
                });
                clearTimeout(timeoutId);

                const data = await response.json();

                if (data.error === 'TURNO_YA_CERRADO') {
                    // Turno estaba cerrado → Mostrar modal de confirmación
                    setFechaTurnoCerrado(fechaFormatted);
                    setMostrarModalTurnoCerrado(true);
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

            // 🆕 Guardar turno en memoria del dispositivo (Offline Fallback)
            try {
                await AsyncStorage.setItem(`@turno_activo_${userId}`, JSON.stringify({
                    dia: diaSeleccionado,
                    fecha: fechaFormatted,
                    hora_apertura: new Date().toISOString()
                }));
                console.log('💾 Turno guardado localmente para offline');
            } catch (e) {
                console.log('⚠️ Error guardando turno en offline:', e);
            }

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

            // 🆕 VERIFICAR ESTADO DEL CARGUE Y PEDIDOS
            const tienePedidos = pedidosPendientes.length > 0;
            const hayCargue = infoCargue?.hayCargue || false;
            const estadoCargue = infoCargue?.estado || 'DESCONOCIDO';
            const totalProductos = infoCargue?.totalProductos || 0;

            // Construir mensaje según el estado
            let mensajeEstado = '';
            let iconoEstado = '✅';

            if (hayCargue && (estadoCargue === 'DESPACHO' || estadoCargue === 'EN_RUTA')) {
                iconoEstado = '🚚';
                mensajeEstado = `\n\n🚚 CARGUE EN ${estadoCargue}:\n✅ ${totalProductos} productos listos\n\n¡Listo para vender!`;
            } else if (hayCargue) {
                iconoEstado = '📦';
                mensajeEstado = `\n\n📦 CARGUE DETECTADO:\n✅ ${totalProductos} productos\n📋 Estado: ${estadoCargue}`;
            }

            if (tienePedidos) {
                mensajeEstado += `\n📋 ${pedidosPendientes.length} pedido(s) asignado(s)`;
            }

            Alert.alert(
                `${iconoEstado} Turno Abierto`,
                `Día: ${diaSeleccionado}\nFecha: ${fechaFormateada}\nHora: ${horaActual}${mensajeEstado}`,
                [{ text: 'OK' }]
            );

            // Si hay cliente preseleccionado desde rutas, usarlo
            if (clientePreseleccionado) {
                cargarDatosConClientePreseleccionado(clientePreseleccionado);
            } else {
                cargarDatos(date);
            }
            verificarPendientes();

            // 🆕 Cargar ventas del día al abrir turno
            await cargarVentasDelDia(date);

            // 🆕 PRECARGA de clientes para que el modal cargue instantáneamente
            precargarClientesEnCache();
        } catch (error) {
            console.error('Error abriendo turno:', error);
            Alert.alert('Error', 'Ocurrió un error al abrir el turno');
        }
    };

    // 🆕 Alias para abrir turno forzado
    const abrirTurnoForzado = abrirTurnoConfirmado;

    // 🆕 Función para precargar clientes en caché (en segundo plano)
    const precargarClientesEnCache = async () => {
        try {
            const cacheKeyLegacy = `clientes_cache_${userId}`;
            const cacheKeyTodos = `clientes_cache_todos_${userId}`;
            const diasSemana = ['LUNES', 'MARTES', 'MIERCOLES', 'JUEVES', 'VIERNES', 'SABADO', 'DOMINGO'];
            const url = `${API_URL}/api/clientes-ruta/?vendedor_id=${userId}`;

            console.log('🚀 Precargando clientes de ruta en segundo plano...');

            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 15000); // 🔧 Reducido de 25s a 15s (precarga puede tardar más)

            const response = await fetch(url, { signal: controller.signal });
            clearTimeout(timeoutId);
            if (response.ok) {
                const data = await response.json();
                const clientesFormateados = data.map((c, index) => ({
                    id: c.id.toString(),
                    nombre: c.nombre_contacto || c.nombre_negocio,
                    negocio: c.nombre_negocio,
                    celular: c.telefono || '',
                    direccion: c.direccion || '',
                    dia_visita: c.dia_visita,
                    nota: c.nota,
                    tipo_negocio: c.tipo_negocio,
                    orden: index + 1,
                    esDeRuta: true
                }));

                // Guardar en caché (legacy + nuevo)
                const payload = JSON.stringify({
                    clientes: clientesFormateados,
                    timestamp: Date.now()
                });
                const operacionesCache = [
                    AsyncStorage.setItem(cacheKeyLegacy, payload),
                    AsyncStorage.setItem(cacheKeyTodos, payload)
                ];

                diasSemana.forEach((dia) => {
                    const clientesDia = clientesFormateados.filter((c) =>
                        c.dia_visita?.toUpperCase().includes(dia)
                    );
                    operacionesCache.push(
                        AsyncStorage.setItem(
                            `clientes_cache_dia_${userId}_${dia}`,
                            JSON.stringify({ clientes: clientesDia, timestamp: Date.now() })
                        )
                    );
                });

                await Promise.all(operacionesCache);

                console.log(`✅ Precarga completa: ${clientesFormateados.length} clientes en caché`);
            }
        } catch (error) {
            console.log('⚠️ Error en precarga de clientes:', error);
            // No es crítico, el modal puede cargar directo del servidor
        }
    };

    // Estado para cliente preseleccionado desde rutas
    const [clientePreseleccionado, setClientePreseleccionado] = useState(null);

    // 🆕 Función para cargar las ventas del día combinando Local y Backend
    const cargarVentasDelDia = async (fecha) => {
        try {
            const fechaDia = fecha.toISOString().split('T')[0];
            const vendedorIdVentas = String(userId).toUpperCase().startsWith('ID') ? String(userId).toUpperCase() : `ID${userId}`;
            const cacheKey = `ventas_backend_cache_${userId}_${fechaDia}`;

            // 1. Obtener locales offline
            const todasLasVentasLocal = await obtenerVentas();
            const localesHoy = todasLasVentasLocal.filter(v => v.fecha.split('T')[0] === fechaDia);

            let ventasUnificadas = localesHoy;
            let backendHoy = [];

            // 🚀 CACHE-FIRST: Cargar caché de backend inmediatamente
            try {
                const cached = await AsyncStorage.getItem(cacheKey);
                if (cached) {
                    const datosCache = JSON.parse(cached);
                    backendHoy = Array.isArray(datosCache.ventas) ? datosCache.ventas : [];
                    setVentasBackendDia(backendHoy);
                    
                    // Deduplicar con caché
                    const mapa = new Map();
                    localesHoy.forEach(v => {
                        if (v.sincronizada !== true && String(v.estado || '').toUpperCase() !== 'ANULADA') {
                            const key = v.id_local || `local-${Math.random()}`;
                            mapa.set(key, v);
                        }
                    });
                    backendHoy.forEach(v => {
                        if (String(v.estado || '').toUpperCase() !== 'ANULADA') {
                            const key = v.id_local || v.id_venta_local || `backend-${v.id}`;
                            mapa.set(key, v);
                        }
                    });
                    ventasUnificadas = Array.from(mapa.values());
                    console.log(`💾 Ventas backend cargadas desde caché (${backendHoy.length} ventas)`);
                }
            } catch (errCache) {
                console.log('⚠️ Error leyendo caché de ventas backend:', errCache?.message);
            }

            // 2. Actualizar desde backend en segundo plano
            try {
                const controller = new AbortController();
                const timeoutId = setTimeout(() => controller.abort(), 12000); // 12 segundos
                
                const respConfig = await fetch(`${API_URL}/api/ventas-ruta/?vendedor_id=${vendedorIdVentas}&fecha=${fechaDia}`, {
                    signal: controller.signal
                });
                clearTimeout(timeoutId);
                
                if (respConfig.ok) {
                    const data = await respConfig.json();
                    backendHoy = Array.isArray(data) ? data : [];
                    setVentasBackendDia(backendHoy);

                    // 💾 Guardar en caché
                    try {
                        await AsyncStorage.setItem(cacheKey, JSON.stringify({
                            ventas: backendHoy,
                            timestamp: Date.now()
                        }));
                    } catch (errSave) {
                        console.log('⚠️ Error guardando caché de ventas backend:', errSave?.message);
                    }

                    // 3. Deduplicar (mantener backend + locales que aún no subieron)
                    const mapa = new Map();
                    // Agregar locales pendientes
                    localesHoy.forEach(v => {
                        if (v.sincronizada !== true && String(v.estado || '').toUpperCase() !== 'ANULADA') {
                            const key = v.id_local || `local-${Math.random()}`;
                            mapa.set(key, v);
                        }
                    });
                    // Agregar backend (sobreescribe local si coinciden, aunque los pendientes no deberían cruzar)
                    backendHoy.forEach(v => {
                        if (String(v.estado || '').toUpperCase() !== 'ANULADA') {
                            const key = v.id_local || v.id_venta_local || `backend-${v.id}`;
                            mapa.set(key, v);
                        }
                    });

                    ventasUnificadas = Array.from(mapa.values());
                    console.log(`✅ Ventas backend actualizadas (${backendHoy.length} ventas)`);
                }
            } catch (errBackend) {
                console.log('⚠️ No se pudo actualizar ventas desde backend (usando caché):', errBackend?.message);
                // Si ya teníamos caché, ventasUnificadas ya está poblado
                if (backendHoy.length === 0) {
                    setVentasBackendDia([]);
                    ventasUnificadas = localesHoy.filter(v => String(v.estado || '').toUpperCase() !== 'ANULADA');
                }
            }

            // Calcular totales
            const cantidadVentas = ventasUnificadas.length;
            const totalDinero = ventasUnificadas.reduce((sum, v) => sum + (parseFloat(v.total) || 0), 0);

            // Calcular diferencia por precios especiales
            let diferencia = 0;
            ventasUnificadas.forEach(venta => {
                const detalles = Array.isArray(venta.detalles) ? venta.detalles : (Array.isArray(venta.productos) ? venta.productos : []);
                let tienePersonalizados = false;
                let objPersonalizados = venta.preciosPersonalizados || {};

                // A veces el backend manda precios personalizados de otra forma, pero si no, la venta local sí los tiene
                if (Object.keys(objPersonalizados).length > 0) {
                    detalles.forEach(prod => {
                        const idProd = prod.id || prod.producto_id; // Depende de la prop local vs backend
                        if (objPersonalizados[idProd]) {
                            const precioBase = parseFloat(prod.precio_base || prod.precio_unitario || prod.precio);
                            const precioEspecial = parseFloat(objPersonalizados[idProd]);
                            const diferenciaProd = (precioEspecial - precioBase) * parseInt(prod.cantidad || 0);
                            if (!isNaN(diferenciaProd)) diferencia += diferenciaProd;
                        }
                    });
                }
            });

            setTotalVentasHoy(cantidadVentas);
            setTotalDineroHoy(totalDinero);
            setDiferenciaPrecios(diferencia);
            setVentasDelDia(ventasUnificadas);
        } catch (error) {
            setVentasBackendDia([]);
            console.error('Error cargando ventas del día:', error);
        }
    };

    const normalizarItemHistorialLocal = (item, index = 0) => {
        const origen = item?.origen || (item?.es_pedido ? 'PEDIDO_FACTURADO' : 'RUTA');
        const id = item?.id;
        const idLocal = item?.id_local || (typeof id === 'string' && id.includes('-') ? id : '');
        const fechaBase = item?.fecha || item?.fecha_actualizacion || item?.fecha_creacion || '';
        const keyCalculada = item?._key
            || (origen === 'PEDIDO_FACTURADO'
                ? `pedido-${id ?? item?.numero_pedido ?? index}`
                : (idLocal
                    ? `ruta-local-${idLocal}`
                    : (id !== undefined && id !== null
                        ? `ruta-id-${id}` // Unificado con obtenerClaveHistorial
                        : `ruta-local-${index}-${fechaBase}`)));

        return {
            ...item,
            _key: keyCalculada,
            origen,
            cliente_negocio: item?.cliente_negocio || item?.nombre_negocio || item?.destinatario || item?.cliente_nombre || 'Cliente General',
            cliente_nombre: item?.cliente_nombre || item?.destinatario || 'Cliente General',
            total: parseFloat(item?.total) || 0,
            vendedor: item?.vendedor || vendedorNombre || userId,
            fecha_creacion: item?.fecha_creacion || item?.fecha || item?.fecha_actualizacion,
            fecha_actualizacion: item?.fecha_actualizacion || item?.fecha || item?.fecha_creacion,
            fecha: item?.fecha || item?.fecha_actualizacion || item?.fecha_creacion,
            detalles: Array.isArray(item?.detalles) ? item.detalles : (Array.isArray(item?.productos) ? item.productos : []),
        };
    };

    const obtenerClaveHistorialLocal = (item) => {
        if (!item) return '';

        const origen = item?.origen || (item?.es_pedido ? 'PEDIDO_FACTURADO' : 'RUTA');
        if (origen === 'PEDIDO_FACTURADO') {
            return `pedido-${item?.id ?? item?._key ?? ''}`;
        }

        const idLocal = item?.id_local || (typeof item?.id === 'string' && item.id.includes('-') ? item.id : '');
        if (idLocal) return `ruta-local-${idLocal}`;

        if (item?.id !== undefined && item?.id !== null) {
            return `ruta-id-${item.id}`;
        }

        const cliente = norm(item?.cliente_negocio || item?.nombre_negocio || item?.cliente_nombre || item?.destinatario || '');
        const total = Math.round(parseFloat(item?.total) || 0);
        const fechaBase = String(item?.fecha_actualizacion || item?.fecha_creacion || item?.fecha || '').slice(0, 16);
        return `ruta-fallback-${cliente}-${total}-${fechaBase}`;
    };

    const fusionarVentaRecienteEnHistorial = (items = [], ventaReciente = ultimaVentaHistorialRef.current) => {
        const base = Array.isArray(items) ? items : [];
        if (!ventaReciente) {
            return ordenarHistorialLocal(base.map((item, index) => normalizarItemHistorialLocal(item, index)));
        }

        const ventaNormalizada = normalizarItemHistorialLocal(ventaReciente, 0);
        const claveVentaReciente = obtenerClaveHistorialLocal(ventaNormalizada);
        const restantes = base
            .map((item, index) => normalizarItemHistorialLocal(item, index + 1))
            .filter((item) => obtenerClaveHistorialLocal(item) !== claveVentaReciente);

        return ordenarHistorialLocal([ventaNormalizada, ...restantes]);
    };

    const ordenarHistorialLocal = (items = []) => items.sort((a, b) => {
        const dA = new Date(a?.fecha_actualizacion || a?.fecha_creacion || a?.fecha || 0);
        const dB = new Date(b?.fecha_actualizacion || b?.fecha_creacion || b?.fecha || 0);
        dA.setFullYear(2000, 0, 1);
        dB.setFullYear(2000, 0, 1);
        return dB.getTime() - dA.getTime();
    });

    const construirHistorialLocal = () => {
        const rutaLocales = Array.isArray(ventasDelDia) ? ventasDelDia : [];
        const pedidosLocales = (Array.isArray(pedidosEntregadosHoy) ? pedidosEntregadosHoy : []).map(p => ({
            ...p,
            _key: `pedido-local-${p.id}`,
            origen: 'PEDIDO_FACTURADO',
            cliente_negocio: p.destinatario || p.nombre_negocio || 'Cliente General',
            cliente_nombre: p.destinatario || 'Cliente General',
            total: parseFloat(p.total) || 0,
            fecha: p.fecha_actualizacion || p.fecha || p.fecha_entrega,
            detalles: Array.isArray(p.detalles) ? p.detalles : (Array.isArray(p.detalles_info) ? p.detalles_info : []),
        }));

        // 🛡️ Deduplicación estricta antes de pasar a la UI
        const mapaUnico = new Map();
        [...rutaLocales, ...pedidosLocales].forEach(v => {
            const tempKey = obtenerClaveHistorialLocal(v);
            if (tempKey) mapaUnico.set(tempKey, v);
        });

        return fusionarVentaRecienteEnHistorial(Array.from(mapaUnico.values()));
    };

    const cargarHistorialReimpresion = async () => {
        const fallbackLocal = construirHistorialLocal();
        setHistorialResumenPreview(fallbackLocal);
        setHistorialReimpresion([]);
        setCargandoHistorial(true);

        try {
            if (!fechaSeleccionada || !userId) {
                setHistorialReimpresion(fallbackLocal);
                setCargandoHistorial(false);
                return;
            }

            const fechaStr = `${fechaSeleccionada.getFullYear()}-${String(fechaSeleccionada.getMonth() + 1).padStart(2, '0')}-${String(fechaSeleccionada.getDate()).padStart(2, '0')}`;
            const vendedorIdVentas = String(userId).toUpperCase().startsWith('ID')
                ? String(userId).toUpperCase()
                : `ID${userId}`;
            const cacheKey = `historial_cache_${userId}_${fechaStr}`;

            let ventasRuta = [];
            let pedidosFacturados = [];

            // 🚀 CACHE-FIRST: Cargar caché inmediatamente
            try {
                const cached = await AsyncStorage.getItem(cacheKey);
                if (cached) {
                    const datosCache = JSON.parse(cached);
                    ventasRuta = Array.isArray(datosCache.ventasRuta) ? datosCache.ventasRuta : [];
                    pedidosFacturados = Array.isArray(datosCache.pedidosFacturados) ? datosCache.pedidosFacturados : [];
                    
                    if (ventasRuta.length > 0 || pedidosFacturados.length > 0) {
                        // Procesar caché igual que backend
                        const fallbackLocalPendientes = fallbackLocal.filter((venta) => {
                            const estado = String(venta?.estado || '').toUpperCase();
                            if (estado === 'ANULADA') return true;
                            return venta?.sincronizada !== true || ventaYaFueModificada(venta);
                        });

                        const obtenerClaveHistorial = (item) => {
                            if (item?.origen === 'PEDIDO_FACTURADO') {
                                return `pedido-${item?.id ?? item?._key ?? Math.random()}`;
                            }
                            const idLocal = item?.id_local
                                || (typeof item?.id === 'string' && item.id.includes('-') ? item.id : null);
                            if (idLocal) return `ruta-local-${idLocal}`;
                            if (item?.id !== undefined && item?.id !== null) return `ruta-id-${item.id}`;
                            return `ruta-key-${item?._key ?? Math.random()}`;
                        };

                        const mapa = new Map();
                        [...ventasRuta, ...pedidosFacturados, ...fallbackLocalPendientes].forEach((item) => {
                            const key = obtenerClaveHistorial(item);
                            const previo = mapa.get(key);
                            if (!previo) {
                                mapa.set(key, item);
                                return;
                            }
                            const itemEsBackend = typeof item?._key === 'string' && (item._key.startsWith('ruta-') || item._key.startsWith('pedido-'));
                            const previoEsBackend = typeof previo?._key === 'string' && (previo._key.startsWith('ruta-') || previo._key.startsWith('pedido-'));
                            if (itemEsBackend && !previoEsBackend) {
                                mapa.set(key, fusionarMetaEdicionHistorial(item, previo));
                                return;
                            }
                            if (!itemEsBackend && previoEsBackend) {
                                mapa.set(key, fusionarMetaEdicionHistorial(previo, item));
                            }
                        });

                        const combinado = Array.from(mapa.values())
                            .sort((a, b) => {
                                const fA = a?.fecha_actualizacion || a?.fecha_creacion || a?.fecha || 0;
                                const fB = b?.fecha_actualizacion || b?.fecha_creacion || b?.fecha || 0;
                                const dA = new Date(fA);
                                const dB = new Date(fB);
                                dA.setFullYear(2000, 0, 1);
                                dB.setFullYear(2000, 0, 1);
                                return dB.getTime() - dA.getTime();
                            });

                        const historialCombinado = combinado.length > 0
                            ? fusionarVentaRecienteEnHistorial(combinado)
                            : fallbackLocal;

                        setVentasBackendDia(ventasRuta);
                        setHistorialReimpresion(historialCombinado);
                        console.log(`💾 Historial cargado desde caché (${ventasRuta.length} ventas, ${pedidosFacturados.length} pedidos)`);
                    }
                }
            } catch (errCache) {
                console.log('⚠️ Error leyendo caché de historial:', errCache?.message);
            }

            // 🌐 Actualizar desde backend en segundo plano (solo si hay internet)
            if (!hayInternet) {
                setCargandoHistorial(false);
                return;
            }

            const headersAuth = await obtenerAuthHeaders();
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 12000); // 12 segundos

            const [respVentas, respPedidos] = await Promise.all([
                fetch(`${API_URL}/api/ventas-ruta/?vendedor_id=${vendedorIdVentas}&fecha=${fechaStr}`, {
                    signal: controller.signal
                }),
                fetch(`${ENDPOINTS.PEDIDOS_PENDIENTES}?vendedor_id=${userId}&fecha=${fechaStr}`, { 
                    headers: headersAuth,
                    signal: controller.signal
                })
            ]);
            clearTimeout(timeoutId);

            const ventasData = respVentas.ok ? await respVentas.json() : [];
            const pedidosData = respPedidos.ok ? await respPedidos.json() : [];

            ventasRuta = (Array.isArray(ventasData) ? ventasData : []).map((venta, index) => ({
                ...venta,
                _key: `ruta-id-${venta?.id ?? index}`,
                origen: 'RUTA',
                cliente_negocio: venta?.nombre_negocio || venta?.cliente_nombre || 'Cliente General',
                cliente_nombre: venta?.cliente_nombre || 'Cliente General',
                vendedor: venta?.vendedor_nombre || vendedorNombre || `Vendedor ${userId}`,
                fecha_actualizacion: venta?.fecha_ultima_edicion || venta?.fecha,
                fecha_creacion: venta?.fecha,
                fecha: venta?.fecha || venta?.fecha_ultima_edicion,
                detalles: Array.isArray(venta?.detalles) ? venta.detalles : [],
            }));

            pedidosFacturados = (Array.isArray(pedidosData) ? pedidosData : [])
                .filter((pedido) => pedido?.estado === 'ENTREGADO' || pedido?.estado === 'ENTREGADA')
                .map((pedido) => ({
                    ...pedido,
                    _key: `pedido-${pedido?.id}`,
                    id: pedido?.id,
                    origen: 'PEDIDO_FACTURADO',
                    cliente_negocio: pedido?.destinatario || 'Cliente General',
                    cliente_nombre: pedido?.destinatario || 'Cliente General',
                    vendedor: vendedorNombre || `Vendedor ${userId}`,
                    fecha_actualizacion: pedido?.fecha_actualizacion,
                    fecha_creacion: pedido?.fecha,
                    fecha: pedido?.fecha_actualizacion || pedido?.fecha || (pedido?.fecha_entrega ? `${pedido.fecha_entrega}T12:00:00` : null),
                    total: parseFloat(pedido?.total) || 0,
                    metodo_pago: pedido?.metodo_pago || 'EFECTIVO',
                    detalles: Array.isArray(pedido?.detalles) ? pedido.detalles : (Array.isArray(pedido?.detalles_info) ? pedido.detalles_info : []),
                }));

            // 💾 Guardar en caché
            try {
                await AsyncStorage.setItem(cacheKey, JSON.stringify({
                    ventasRuta,
                    pedidosFacturados,
                    timestamp: Date.now()
                }));
            } catch (errSave) {
                console.log('⚠️ Error guardando caché de historial:', errSave?.message);
            };

            // Si backend respondió, solo mezclar ventas locales pendientes/no sincronizadas.
            // Esto evita tarjetas "fantasma" duplicadas por mezclar local+backend de la misma venta.
            const fallbackLocalPendientes = fallbackLocal.filter((venta) => {
                const estado = String(venta?.estado || '').toUpperCase();
                if (estado === 'ANULADA') return true;
                return venta?.sincronizada !== true || ventaYaFueModificada(venta);
            });

            const obtenerClaveHistorial = (item) => {
                if (item?.origen === 'PEDIDO_FACTURADO') {
                    return `pedido-${item?.id ?? item?._key ?? Math.random()}`;
                }

                const idLocal = item?.id_local
                    || (typeof item?.id === 'string' && item.id.includes('-') ? item.id : null);

                if (idLocal) return `ruta-local-${idLocal}`;
                if (item?.id !== undefined && item?.id !== null) return `ruta-id-${item.id}`;
                return `ruta-key-${item?._key ?? Math.random()}`;
            };

            // Unificar backend + local: evita ocultar ventas locales pendientes
            const mapa = new Map();
            [...ventasRuta, ...pedidosFacturados, ...fallbackLocalPendientes].forEach((item) => {
                const key = obtenerClaveHistorial(item);
                const previo = mapa.get(key);

                if (!previo) {
                    mapa.set(key, item);
                    return;
                }

                // Priorizar el registro de backend para la misma venta (si existe)
                const itemEsBackend = typeof item?._key === 'string' && (item._key.startsWith('ruta-') || item._key.startsWith('pedido-'));
                const previoEsBackend = typeof previo?._key === 'string' && (previo._key.startsWith('ruta-') || previo._key.startsWith('pedido-'));

                if (itemEsBackend && !previoEsBackend) {
                    mapa.set(key, fusionarMetaEdicionHistorial(item, previo));
                    return;
                }

                if (!itemEsBackend && previoEsBackend) {
                    mapa.set(key, fusionarMetaEdicionHistorial(previo, item));
                }
            });

            const combinado = Array.from(mapa.values())
                .sort((a, b) => {
                    const fA = a?.fecha_actualizacion || a?.fecha_creacion || a?.fecha || 0;
                    const fB = b?.fecha_actualizacion || b?.fecha_creacion || b?.fecha || 0;

                    const dA = new Date(fA);
                    const dB = new Date(fB);

                    // 🚀 Para pruebas: Si los días son distintos, forzamos el mismo día 
                    // para que el orden dependa exclusivamente de la HORA.
                    dA.setFullYear(2000, 0, 1);
                    dB.setFullYear(2000, 0, 1);

                    return dB.getTime() - dA.getTime();
                });

            const historialCombinado = combinado.length > 0
                ? fusionarVentaRecienteEnHistorial(combinado)
                : fallbackLocal;

            // 🚀 ACTUALIZAR ESTADO GLOBAL DE VENTAS BACKEND
            // Esto permite que resolverVentaBackendAsociada encuentre coincidencias
            // para ventas recién creadas que acaban de sincronizarse.
            setVentasBackendDia(ventasRuta);

            setHistorialReimpresion(historialCombinado);
        } catch (error) {
            console.log('⚠️ Historial backend no disponible, usando datos locales:', error?.message || error);
            setHistorialReimpresion(fallbackLocal);
        } finally {
            setCargandoHistorial(false);
        }
    };

    const abrirHistorialReimpresion = () => {
        Keyboard.dismiss();
        setMostrarHistorialVentas(true);
        // 🔧 Pequeño delay para que el modal se renderice completamente antes de cargar datos
        setTimeout(() => {
            cargarHistorialReimpresion();
        }, 100);
    };

    const construirUrlMediaVenta = useCallback((valor) => {
        if (!valor || typeof valor !== 'string') return null;
        if (valor.startsWith('http')) return valor;
        return `${API_URL}${valor.startsWith('/') ? valor : `/${valor}`}`;
    }, []);



    const esVentaBackendPersistida = useCallback((ventaFuente) => {
        if (!ventaFuente) return false;

        const rawId = ventaFuente?.id;
        const idTexto = String(rawId ?? '').trim();
        const idEsNumerico = idTexto !== '' && /^\d+$/.test(idTexto);
        const esMarcadaLocal = String(ventaFuente?._key || '').startsWith('local-');

        return idEsNumerico && !esMarcadaLocal;
    }, []);

    const obtenerTimestampVentaComparable = useCallback((ventaFuente) => {
        const candidatos = [
            ventaFuente?.fecha_ultima_edicion,
            ventaFuente?.fecha_actualizacion,
            ventaFuente?.updated_at,
            ventaFuente?.fecha,
            ventaFuente?.fecha_creacion,
        ];

        for (const valor of candidatos) {
            if (!valor) continue;
            const timestamp = new Date(valor).getTime();
            if (!Number.isNaN(timestamp)) return timestamp;
        }

        return 0;
    }, []);

    const resolverVentaBackendAsociada = useCallback((ventaFuente) => {
        if (!ventaFuente) return null;
        if (esVentaBackendPersistida(ventaFuente)) return ventaFuente;

        const clavesObjetivo = obtenerClavesCoincidenciaCliente(ventaFuente);
        if (!clavesObjetivo.length) return null;

        const totalObjetivo = Math.round(parseFloat(ventaFuente?.total) || 0);
        const timestampObjetivo = obtenerTimestampVentaComparable(ventaFuente);
        const yaModificada = !!(ventaFuente.edicion_num || ventaFuente.yaModificada || ventaFuente.fecha_ultima_edicion);
        const margenTiempoMs = (yaModificada ? 120 : 120) * 60 * 1000; // 2 horas de margen para robustez total

        const candidatas = [...(historialReimpresion || []), ...(ventasBackendDia || [])]
            .filter((venta) => {
                if (!esVentaBackendPersistida(venta)) return false;

                // No resolver una venta ANULADA como backend asociada de una venta activa
                if (String(venta?.estado || '').toUpperCase() === 'ANULADA') return false;

                const clavesVenta = obtenerClavesCoincidenciaCliente(venta);
                if (!clavesVenta.some((clave) => clavesObjetivo.includes(clave))) return false;

                const totalVenta = Math.round(parseFloat(venta?.total) || 0);
                
                // 🛡️ Si es una edición, no exigimos que el total coincida (porque el dashboard puede tener el total viejo)
                // Es mejor permitir anular el registro de backend "viejo" que dejar al vendedor bloqueado.
                if (!yaModificada && totalVenta !== totalObjetivo) return false;

                if (!timestampObjetivo) return true;

                const timestampVenta = obtenerTimestampVentaComparable(venta);
                if (!timestampVenta) return true;

                return Math.abs(timestampVenta - timestampObjetivo) <= margenTiempoMs;
            })
            .sort((a, b) => obtenerTimestampVentaComparable(b) - obtenerTimestampVentaComparable(a));

        return candidatas[0] || null;
    }, [
        esVentaBackendPersistida,
        historialReimpresion,
        ventasBackendDia,
        obtenerClavesCoincidenciaCliente,
        obtenerTimestampVentaComparable,
    ]);

    const obtenerVentaPreviaCliente = useCallback((clienteObjetivo) => {
        if (!clienteObjetivo) return null;

        const clavesCliente = obtenerClavesCoincidenciaCliente(clienteObjetivo);
        if (!clavesCliente.length) return null;

        const ventaCoincidePorClave = (venta) => {
            const clavesVenta = obtenerClavesCoincidenciaCliente(venta);
            return clavesVenta.some((clave) => clavesCliente.includes(clave));
        };

        const coincideVentaConCliente = (venta) => {
            if (!venta || String(venta?.estado || '').toUpperCase() === 'ANULADA') return false;
            return ventaCoincidePorClave(venta);
        };

        const anuladaBackend = (ventasBackendDia || []).some((venta) => {
            if (String(venta?.estado || '').toUpperCase() !== 'ANULADA') return false;
            return ventaCoincidePorClave(venta);
        });

        if (anuladaBackend) return null;

        const candidatas = [...(ventasDelDia || []), ...(ventasBackendDia || [])].filter(coincideVentaConCliente);
        if (!candidatas.length) return null;

        const mapa = new Map();
        candidatas.forEach((venta, indice) => {
            const clave = String(
                venta?.id_local ||
                venta?.id_venta_local ||
                venta?.id ||
                `${normalizar(venta?.cliente_negocio || venta?.nombre_negocio || venta?.cliente_nombre)}-${indice}`
            );

            const actual = mapa.get(clave);
            if (!actual) {
                mapa.set(clave, venta);
                return;
            }

            const scoreVenta = [
                ventaYaFueModificada(venta) ? 1 : 0,
                esVentaBackendPersistida(venta) ? 1 : 0,
                obtenerTimestampVentaComparable(venta),
            ];
            const scoreActual = [
                ventaYaFueModificada(actual) ? 1 : 0,
                esVentaBackendPersistida(actual) ? 1 : 0,
                obtenerTimestampVentaComparable(actual),
            ];

            if (scoreVenta[0] > scoreActual[0] ||
                (scoreVenta[0] === scoreActual[0] && scoreVenta[1] > scoreActual[1]) ||
                (scoreVenta[0] === scoreActual[0] && scoreVenta[1] === scoreActual[1] && scoreVenta[2] > scoreActual[2])) {
                mapa.set(clave, venta);
            }
        });

        return Array.from(mapa.values()).sort((a, b) => {
            const modA = ventaYaFueModificada(a) ? 1 : 0;
            const modB = ventaYaFueModificada(b) ? 1 : 0;
            if (modA !== modB) return modB - modA;

            const backendA = esVentaBackendPersistida(a) ? 1 : 0;
            const backendB = esVentaBackendPersistida(b) ? 1 : 0;
            if (backendA !== backendB) return backendB - backendA;

            return obtenerTimestampVentaComparable(b) - obtenerTimestampVentaComparable(a);
        })[0] || null;
    }, [ventasDelDia, ventasBackendDia, ventaYaFueModificada, esVentaBackendPersistida, obtenerTimestampVentaComparable, obtenerClavesCoincidenciaCliente]);

    // Cuenta cuántas ventas activas (no anuladas) tiene un cliente hoy.
    // Usa el estado más reciente de AMBAS listas: si una venta aparece como ANULADA
    // en cualquier lista (local o backend), se excluye del conteo aunque la otra
    // lista la tenga todavía como ACTIVA (datos viejos del servidor).
    const contarVentasActivasCliente = useCallback((clienteObjetivo) => {
        if (!clienteObjetivo) return 0;
        const clavesCliente = obtenerClavesCoincidenciaCliente(clienteObjetivo);
        if (!clavesCliente.length) return 0;

        const todas = [...(ventasDelDia || []), ...(ventasBackendDia || [])];

        // Paso 1: recopilar IDs de ventas que tienen alguna versión ANULADA
        const idsAnuladas = new Set();
        todas.forEach((v) => {
            if (String(v?.estado || '').toUpperCase() === 'ANULADA') {
                const id = v?.id_local || v?.id_venta_local || v?.id;
                if (id) idsAnuladas.add(String(id));
            }
        });

        // Paso 2: filtrar ventas activas cuyo ID no esté en idsAnuladas
        const coincideActiva = (venta) => {
            if (!venta || String(venta?.estado || '').toUpperCase() === 'ANULADA') return false;
            if (parseFloat(venta?.total || 0) === 0) return false; // reporte puro de vencidas, no cuenta como venta
            const id = venta?.id_local || venta?.id_venta_local || venta?.id;
            if (id && idsAnuladas.has(String(id))) return false; // versión anulada existe en otra lista
            const clavesVenta = obtenerClavesCoincidenciaCliente(venta);
            return clavesVenta.some(c => clavesCliente.includes(c));
        };

        const candidatas = todas.filter(coincideActiva);
        const mapa = new Map();
        candidatas.forEach((venta, idx) => {
            const clave = String(venta?.id_local || venta?.id_venta_local || venta?.id || `idx-${idx}`);
            if (!mapa.has(clave)) mapa.set(clave, venta);
        });
        return mapa.size;
    }, [ventasDelDia, ventasBackendDia, obtenerClavesCoincidenciaCliente]);


    const cerrarEdicionVenta = useCallback((reabrirHistorial = true) => {
        setModalEdicionVisible(false);
        setVentaEnEdicion(null);
        setCarritoEdicion({});
        setMetodoPagoEdicion('EFECTIVO');
        setCantidadesEdicionInput({});
        setBusquedaProductoEdicion('');
        setFocoCampoEdicion(null);
        if (reabrirHistorial) {
            setMostrarHistorialVentas(true);
            cargarHistorialReimpresion();
        }
    }, [cargarHistorialReimpresion]);

    // ─────────────────────────────────────────────
    // 🆕 EDICIÓN DE VENTA DESDE HISTORIAL
    // ─────────────────────────────────────────────

    /** Abre el modal de edición con los productos de la venta pre-cargados */
    const abrirEdicionVenta = async (venta) => {
        const normalizarDetallesVenta = (ventaFuente) => {
            if (Array.isArray(ventaFuente?.detalles) && ventaFuente.detalles.length > 0) {
                return ventaFuente.detalles;
            }
            if (Array.isArray(ventaFuente?.productos) && ventaFuente.productos.length > 0) {
                return ventaFuente.productos;
            }
            if (Array.isArray(ventaFuente?.detalles_info) && ventaFuente.detalles_info.length > 0) {
                return ventaFuente.detalles_info;
            }
            return [];
        };

        let ventaEditable = {
            ...venta,
            detalles: normalizarDetallesVenta(venta),
        };

        // 🔧 Si la venta no tiene ID numérico (aún tiene ID local), buscar en AsyncStorage
        // por si ya fue sincronizada y tiene el ID real del backend.
        if (!esVentaBackendPersistida(ventaEditable)) {
            try {
                const ventasStorage = await obtenerVentas();
                const idLocal = ventaEditable.id_local || ventaEditable.id;
                const match = ventasStorage.find(vs =>
                    (vs.id_local === idLocal || vs.id === idLocal) &&
                    vs.id && /^\d+$/.test(String(vs.id))
                );
                if (match) {
                    ventaEditable = { ...ventaEditable, id: match.id, sincronizada: true };
                    console.log(`🔧 ID backend resuelto para edición: ${match.id}`);
                }
            } catch (e) {
                console.log('⚠️ No se pudo resolver ID backend:', e?.message);
            }
        }

        // 🚀 OPTIMIZACIÓN: Validar bloqueos ANTES de abrir el modal
        if (ventaYaFueModificada(ventaEditable)) {
            Alert.alert('Bloqueado', 'Esta venta ya fue modificada una vez y no se puede volver a editar.');
            return;
        }

        if (!ventaEditable?.detalles || ventaEditable.detalles.length === 0) {
            Alert.alert('Sin productos', 'Esta venta no tiene detalles para editar.');
            return;
        }

        // 🚀 OPTIMIZACIÓN: Pre-llenar carrito con los detalles existentes ANTES de abrir modal
        const carritoInicial = {};
        ventaEditable.detalles.forEach(item => {
            const nombre = item.nombre || item.producto || '';
            const cantidad = parseInt(item.cantidad || 0);
            if (nombre && cantidad > 0) {
                carritoInicial[nombre] = {
                    cantidad,
                    precio: parseFloat(item.precio || item.precio_unitario || 0),
                    subtotal: parseFloat(item.subtotal || 0),
                };
            }
        });

        // 🚀 ABRIR MODAL INMEDIATAMENTE — cerrar historial y abrir edición en el mismo frame
        setMostrarHistorialVentas(false);
        setVentaEnEdicion(ventaEditable);
        setCarritoEdicion(carritoInicial);
        setCantidadesEdicionInput(
            Object.fromEntries(
                Object.entries(carritoInicial).map(([nombre, item]) => [nombre, String(item?.cantidad || 0)])
            )
        );
        setMetodoPagoEdicion(normalizarMetodoPagoEdicion(ventaEditable?.metodo_pago));
        setBusquedaProductoEdicion('');
        setFocoCampoEdicion(null);
        setModalEdicionVisible(true);

        // 🚀 CARGAR DETALLES COMPLETOS EN SEGUNDO PLANO (solo si es venta del backend)
        if (esVentaBackendPersistida(ventaEditable)) {
            try {
                const headers = await obtenerAuthHeaders();
                const respVenta = await fetch(`${API_URL}/api/ventas-ruta/${ventaEditable.id}/`, { headers });

                if (respVenta.ok) {
                    const ventaDetallada = await respVenta.json();
                    const ventaActualizada = {
                        ...ventaEditable,
                        ...ventaDetallada,
                        detalles: normalizarDetallesVenta(ventaDetallada),
                    };

                    // Actualizar solo si el modal sigue abierto
                    setVentaEnEdicion(ventaActualizada);
                }
            } catch (error) {
                console.log('⚠️ No se pudo cargar detalle completo para edición:', error?.message || error);
                // No hacer nada, el modal ya está abierto con los datos básicos
            }
        }
    };

    const abrirSelectorMetodoPagoDesdeCard = useCallback((venta) => {
        if (!venta || venta.estado === 'ANULADA') return;
        if (ventaYaCambioMetodoPago(venta)) {
            Alert.alert('Bloqueado', 'El método de pago de esta venta ya fue cambiado una vez.');
            return;
        }
        setVentaMetodoPagoCard(venta);
        setMetodoPagoCardSeleccionado(normalizarMetodoPagoEdicion(venta?.metodo_pago));
        setModalMetodoPagoCardVisible(true);
    }, [normalizarMetodoPagoEdicion, ventaYaCambioMetodoPago]);

    const cerrarSelectorMetodoPagoDesdeCard = useCallback(() => {
        if (guardandoMetodoPagoCard) return;
        setModalMetodoPagoCardVisible(false);
        setVentaMetodoPagoCard(null);
    }, [guardandoMetodoPagoCard]);

    const actualizarMetodoPagoDesdeCard = useCallback(async (venta, metodoNuevoRaw) => {
        if (!venta || venta.estado === 'ANULADA') return false;
        if (ventaYaCambioMetodoPago(venta)) {
            Alert.alert('Bloqueado', 'El método de pago de esta venta ya fue cambiado una vez.');
            return false;
        }

        const metodoAnterior = normalizarMetodoPagoEdicion(venta?.metodo_pago);
        const metodoNuevo = normalizarMetodoPagoEdicion(metodoNuevoRaw);
        if (metodoNuevo === metodoAnterior) return true;
        const fechaEdicionLocal = new Date().toISOString();

        const esVentaLocal = !esVentaBackendPersistida(venta);

        const esMismaVenta = (v) => {
            // Match directo por ID numérico de backend
            if (v.id && venta.id && v.id === venta.id) return true;
            // Match por id_local (ambos lo tienen)
            if (v.id_local && venta.id_local && v.id_local === venta.id_local) return true;
            // Match cruzado: el item local tiene id=UUID y el backend tiene id_local=UUID
            if (v.id && venta.id_local && String(v.id) === String(venta.id_local)) return true;
            if (v.id_local && venta.id && String(v.id_local) === String(venta.id)) return true;
            // Match por _key
            if (v._key && venta._key && v._key === venta._key) return true;
            return false;
        };

        const aplicarMetodoEnMemoria = (metodoPago, extra = {}) => {
            const actualizarItem = (v) => esMismaVenta(v) ? {
                ...v,
                metodo_pago: metodoPago,
                metodo_pago_cambiado: true,
                ...extra,
                fecha_actualizacion: extra.fecha_ultima_edicion || v.fecha_actualizacion
            } : v;

            // Solo marcar metodo_pago_cambiado, NO editada (no es edición de productos)
            setVentasDelDia(prev => prev.map(actualizarItem));
            setHistorialReimpresion(prev => prev.map(actualizarItem));
            setHistorialResumenPreview(prev => prev.map(actualizarItem));
        };

        // Optimista en UI para que el cambio se vea instantáneo en la card
        aplicarMetodoEnMemoria(metodoNuevo, {
            fecha_ultima_edicion: fechaEdicionLocal,
        });

        try {
            const dispositivoId = await obtenerDispositivoId();
            let responseData = null;
            if (!esVentaLocal) {
                if (venta.origen === 'PEDIDO_FACTURADO') {
                    responseData = await actualizarPedido(venta.id, {
                        metodo_pago: metodoNuevo,
                        editado_desde_app: true
                    });
                } else {
                    responseData = await editarVentaRuta(venta.id, {
                        metodo_pago: metodoNuevo,
                        dispositivo_id: dispositivoId,
                    });
                }
            }

            const metaEdicionFinal = {
                metodo_pago_cambiado: true,
                fecha_ultima_edicion: responseData?.fecha_ultima_edicion || fechaEdicionLocal,
                dispositivo_ultima_edicion: responseData?.dispositivo_ultima_edicion || dispositivoId || '',
            };

            // Refrescar con metadatos confirmados del backend.
            if (!esVentaLocal) {
                aplicarMetodoEnMemoria(metodoNuevo, metaEdicionFinal);
            }

            // Persistir en almacenamiento local para mantener consistencia al recargar.
            try {
                const ventasGuardadas = await obtenerVentas();
                const ventasActualizadas = ventasGuardadas.map((v) => (
                    esMismaVenta(v)
                        ? { ...v, metodo_pago: metodoNuevo, metodo_pago_cambiado: true, ...metaEdicionFinal }
                        : v
                ));
                await AsyncStorage.setItem('ventas', JSON.stringify(ventasActualizadas));
            } catch (storageErr) {
                console.warn('⚠️ No se pudo persistir método de pago en ventas locales:', storageErr?.message || storageErr);
            }

            // Si la venta está pendiente en cola offline, actualizar método en la cola.
            try {
                const colaRaw = await AsyncStorage.getItem('ventas_pendientes_sync');
                const cola = colaRaw ? JSON.parse(colaRaw) : [];
                let huboCambios = false;

                const colaActualizada = cola.map((pendiente) => {
                    const idPendiente = pendiente?.id;
                    const idLocalPendiente = pendiente?.data?.id_local;
                    const mismaVenta =
                        (idPendiente && (idPendiente === venta.id || idPendiente === venta.id_local)) ||
                        (idLocalPendiente && (idLocalPendiente === venta.id || idLocalPendiente === venta.id_local));

                    if (!mismaVenta) return pendiente;

                    huboCambios = true;
                    return {
                        ...pendiente,
                        data: {
                            ...(pendiente?.data || {}),
                            metodo_pago: metodoNuevo,
                            ...metaEdicionFinal,
                        },
                    };
                });

                if (huboCambios) {
                    await AsyncStorage.setItem('ventas_pendientes_sync', JSON.stringify(colaActualizada));
                }
            } catch (colaErr) {
                console.warn('⚠️ No se pudo actualizar método en cola offline:', colaErr?.message || colaErr);
            }
            return true;
        } catch (error) {
            console.error('❌ Error cambio método pago:', error?.message, '| code:', error?.code, '| status:', error?.status, '| payload:', JSON.stringify(error?.payload));
            const esErrorConexion = error?.message?.includes('Network') || error?.message?.includes('timeout') || error?.message?.includes('Aborted') || error?.message?.includes('fetch');

            // Si es error de conexión — guardar en cola offline y dejar cambio optimista en pantalla
            if (esErrorConexion && !esVentaLocal) {
                try {
                    if (venta.origen === 'PEDIDO_FACTURADO') {
                        const colaAccionesRaw = await AsyncStorage.getItem('pedidos_acciones_pendientes');
                        const colaAcciones = colaAccionesRaw ? JSON.parse(colaAccionesRaw) : [];
                        const nuevaCola = colaAcciones.filter(a => !(a.id === venta.id && a.tipo === 'ACTUALIZAR_PAGO'));
                        nuevaCola.push({ id: venta.id, tipo: 'ACTUALIZAR_PAGO', metodo_pago: metodoNuevo, fecha_local: new Date().toISOString() });
                        await AsyncStorage.setItem('pedidos_acciones_pendientes', JSON.stringify(nuevaCola));
                    } else {
                        // Venta de ruta — guardar en cola de pendientes sync
                        const colaRaw = await AsyncStorage.getItem('ventas_pendientes_sync');
                        const cola = colaRaw ? JSON.parse(colaRaw) : [];
                        const existe = cola.some(p => p.tipo === 'CAMBIO_METODO_PAGO' && esMismaVenta(p.data || {}));
                        if (!existe) {
                            cola.push({ tipo: 'CAMBIO_METODO_PAGO', id: venta.id, data: { id: venta.id, id_local: venta.id_local, metodo_pago: metodoNuevo }, fecha_local: new Date().toISOString() });
                            await AsyncStorage.setItem('ventas_pendientes_sync', JSON.stringify(cola));
                        }
                    }
                    console.log('📡 Cambio de pago guardado offline, se sincronizará con internet');
                    Alert.alert('Modo Offline', 'Sin conexión. El cambio de pago se sincronizará automáticamente cuando vuelva el internet.');
                    return true;
                } catch (queueErr) {
                    console.error('Error guardando cambio de pago offline:', queueErr);
                }
            }

            // Rollback visual solo si el backend respondió con error real (no conexión)
            aplicarMetodoEnMemoria(metodoAnterior, {
                metodo_pago_cambiado: venta?.metodo_pago_cambiado === true,
                fecha_ultima_edicion: venta?.fecha_ultima_edicion || null,
                dispositivo_ultima_edicion: venta?.dispositivo_ultima_edicion || '',
            });

            if (esErrorVentaYaModificada(error) || error?.code === 'METODO_PAGO_YA_CAMBIADO') {
                Alert.alert('Bloqueado', 'El método de pago de esta venta ya fue cambiado una vez.');
            } else {
                Alert.alert('Error', 'No se pudo cambiar el método de pago. Intenta nuevamente.');
            }
            return false;
        }
    }, [normalizarMetodoPagoEdicion, ventaYaCambioMetodoPago, esErrorVentaYaModificada]);

    const confirmarCambioMetodoPagoDesdeCard = useCallback(async () => {
        if (!ventaMetodoPagoCard || guardandoMetodoPagoCardRef.current) return;

        try {
            guardandoMetodoPagoCardRef.current = true;
            setGuardandoMetodoPagoCard(true);
            const ok = await actualizarMetodoPagoDesdeCard(ventaMetodoPagoCard, metodoPagoCardSeleccionado);
            
            if (ok) {
                setModalMetodoPagoCardVisible(false);
                setVentaMetodoPagoCard(null);
            }
        } catch (error) {
            console.error('❌ Error crítico en confirmarCambioMetodoPagoDesdeCard:', error);
            Alert.alert('Error', 'Ocurrió un error inesperado al procesar el cambio.');
        } finally {
            guardandoMetodoPagoCardRef.current = false;
            setGuardandoMetodoPagoCard(false);
        }
    }, [ventaMetodoPagoCard, metodoPagoCardSeleccionado, actualizarMetodoPagoDesdeCard]);

    const normalizarNombreStockEdicion = useCallback((txt) => (
        (txt || '')
            .toString()
            .normalize('NFD')
            .replace(/[\u0300-\u036f]/g, '')
            .toUpperCase()
            .replace(/\s+/g, ' ')
            .trim()
    ), []);

    const resolverClaveStockEdicion = useCallback((nombreProducto) => {
        const claveDirecta = (nombreProducto || '').toString().toUpperCase().trim();
        if (Object.prototype.hasOwnProperty.call(stockCargue, claveDirecta)) {
            return claveDirecta;
        }

        const nombreNorm = normalizarNombreStockEdicion(nombreProducto);
        const claveNormalizada = Object.keys(stockCargue).find(
            (k) => normalizarNombreStockEdicion(k) === nombreNorm
        );
        if (claveNormalizada) return claveNormalizada;

        const prodCatalogo = productos.find((p) => {
            const prodNorm = normalizarNombreStockEdicion(p?.nombre);
            return prodNorm === nombreNorm || prodNorm.includes(nombreNorm) || nombreNorm.includes(prodNorm);
        });

        if (prodCatalogo?.nombre) {
            const claveCatalogo = prodCatalogo.nombre.toUpperCase().trim();
            if (Object.prototype.hasOwnProperty.call(stockCargue, claveCatalogo)) {
                return claveCatalogo;
            }
            const claveCatalogoNorm = Object.keys(stockCargue).find(
                (k) => normalizarNombreStockEdicion(k) === normalizarNombreStockEdicion(prodCatalogo.nombre)
            );
            if (claveCatalogoNorm) return claveCatalogoNorm;
            return claveCatalogo;
        }

        return claveDirecta;
    }, [stockCargue, productos, normalizarNombreStockEdicion]);

    const obtenerCantidadOriginalEdicion = useCallback((nombreProducto) => {
        const detallesOriginales = ventaEnEdicion?.detalles || [];
        const nombreNorm = normalizarNombreStockEdicion(nombreProducto);
        const itemOriginal = detallesOriginales.find((item) => {
            const nombre = item?.nombre || item?.producto || '';
            return normalizarNombreStockEdicion(nombre) === nombreNorm;
        });
        return parseInt(itemOriginal?.cantidad || 0, 10) || 0;
    }, [ventaEnEdicion, normalizarNombreStockEdicion]);

    const obtenerMaximoEditableProducto = useCallback((nombreProducto) => {
        const claveStock = resolverClaveStockEdicion(nombreProducto);
        const stockActual = parseInt(stockCargue[claveStock] || 0, 10) || 0;
        const cantidadOriginal = obtenerCantidadOriginalEdicion(nombreProducto);
        const nombreNorm = normalizarNombreStockEdicion(nombreProducto);
        const cantidadEnCarrito = parseInt(
            Object.entries(carritoEdicion).find(([k]) => normalizarNombreStockEdicion(k) === nombreNorm)?.[1]?.cantidad || 0
        , 10) || 0;
        return Math.max(0, stockActual + cantidadOriginal - cantidadEnCarrito);
    }, [stockCargue, carritoEdicion, resolverClaveStockEdicion, obtenerCantidadOriginalEdicion, normalizarNombreStockEdicion]);


    /** Modifica la cantidad de un producto en el carritoEdicion */
    const cambiarCantidadEdicion = useCallback((nombreProducto, nuevaCantidad) => {
        // Si la cantidad es negativa (ej: presionó - cuando estaba en 0) → quitar del carrito
        if (parseInt(nuevaCantidad) < 0) {
            setCarritoEdicion(prev => {
                const updated = { ...prev };
                delete updated[nombreProducto];
                return updated;
            });
            setCantidadesEdicionInput(prev => {
                const updated = { ...prev };
                delete updated[nombreProducto];
                return updated;
            });
            return;
        }
        const valorRaw = String(nuevaCantidad ?? '');
        const valorLimpio = valorRaw.replace(/[^\d]/g, '');

        // Permitir campo vacío temporalmente para que no desaparezca la fila mientras escribe.
        if (valorLimpio === '') {
            setCantidadesEdicionInput(prev => ({
                ...prev,
                [nombreProducto]: '',
            }));
            return;
        }

        const maximoPermitido = obtenerMaximoEditableProducto(nombreProducto);
        let cantidad = parseInt(valorLimpio, 10) || 0;

        if (cantidad > maximoPermitido) {
            cantidad = maximoPermitido;
            Alert.alert(
                'Stock insuficiente',
                `Solo tienes ${maximoPermitido} und disponibles para "${nombreProducto}".`
            );
        }

        // ⚡ OPTIMIZACIÓN: Actualizar ambos estados en una sola operación
        const cantidadStr = String(cantidad);
        
        setCantidadesEdicionInput(prev => ({
            ...prev,
            [nombreProducto]: cantidadStr,
        }));

        setCarritoEdicion(prev => {
            const updated = { ...prev };
            if (cantidad < 0) {
                // Presionó - estando en 0 → quitar del carrito
                delete updated[nombreProducto];
            } else {
                const precio = updated[nombreProducto]?.precio || 0;
                updated[nombreProducto] = {
                    ...updated[nombreProducto],
                    cantidad,
                    subtotal: precio * cantidad,
                };
            }
            return updated;
        });
    }, [obtenerMaximoEditableProducto]); // ⚡ Memoizar función

    /** Confirma la edición: actualiza backend, stock local y el historial */
    const confirmarEdicionVenta = async () => {
        if (!ventaEnEdicion) return;
        if (ventaYaFueModificada(ventaEnEdicion)) {
            Alert.alert('Bloqueado', 'Esta venta ya fue modificada una vez y no se puede volver a editar.');
            return;
        }
        const metodoPagoNormalizado = normalizarMetodoPagoEdicion(metodoPagoEdicion);

        const nuevosDetalles = Object.entries(carritoEdicion)
            .filter(([, item]) => item.cantidad > 0) // ignorar productos agregados pero sin cantidad
            .map(([nombre, item]) => ({
                nombre,
                producto: nombre,
                cantidad: item.cantidad,
                precio: item.precio,
                subtotal: item.precio * item.cantidad,
            }));

        if (nuevosDetalles.length === 0) {
            Alert.alert('Sin productos', 'Agrega al menos un producto para guardar la edición.');
            return;
        }

        const detalleSinStock = nuevosDetalles.find((item) => {
            const maximoPermitido = obtenerMaximoEditableProducto(item.nombre || item.producto || '');
            return (parseInt(item.cantidad, 10) || 0) > maximoPermitido;
        });

        if (detalleSinStock) {
            const nombreProducto = detalleSinStock.nombre || detalleSinStock.producto || 'Producto';
            const maximoPermitido = obtenerMaximoEditableProducto(nombreProducto);
            Alert.alert(
                'Stock insuficiente',
                `No puedes guardar ${detalleSinStock.cantidad} und de "${nombreProducto}". Máximo disponible: ${maximoPermitido}.`
            );
            return;
        }

        const nuevoTotal = nuevosDetalles.reduce((sum, i) => sum + i.subtotal, 0);
        const fechaEdicionLocal = new Date().toISOString();
        const conteoEdicionLocal = Math.max(1, Number(ventaEnEdicion?.veces_editada || 0) + 1);
        const metaEdicionLocal = {
            editada: true,
            veces_editada: conteoEdicionLocal,
            fecha_ultima_edicion: fechaEdicionLocal,
        };

        setCargandoEdicion(true);
        try {
            const dispositivoId = await obtenerDispositivoId();
            let respuestaEdicion = null;
            const payloadEdicion = {
                detalles: nuevosDetalles,
                total: nuevoTotal,
                metodo_pago: metodoPagoNormalizado,
                dispositivo_id: dispositivoId,
            };

            if (esVentaBackendPersistida(ventaEnEdicion)) {
                try {
                    respuestaEdicion = await editarVentaRuta(ventaEnEdicion.id, payloadEdicion);
                    console.log('✅ Edición sincronizada de inmediato');
                } catch (editError) {
                    console.warn('⚠️ Fallo edición inmediata:', editError.message);
                    // No tragar el error: respuestaEdicion queda null → irá a cola de pendientes
                }
            }

            const metaEdicionConfirmada = {
                editada: true,
                veces_editada: Number(respuestaEdicion?.veces_editada || conteoEdicionLocal),
                fecha_ultima_edicion: respuestaEdicion?.fecha_ultima_edicion || fechaEdicionLocal,
                dispositivo_ultima_edicion: respuestaEdicion?.dispositivo_ultima_edicion || dispositivoId || '',
                // Preservar el flag metodo_pago_cambiado que viene del backend.
                // Si el backend lo devuelve explícitamente lo tomamos; si no, mantenemos el valor previo.
                ...(respuestaEdicion?.metodo_pago_cambiado !== undefined
                    ? { metodo_pago_cambiado: respuestaEdicion.metodo_pago_cambiado }
                    : {}),
            };
            setVentasDelDia(prev =>
                prev.map(v => {
                    const mismaVenta =
                        (v.id && v.id === ventaEnEdicion.id) ||
                        (v.id_local && v.id_local === ventaEnEdicion.id_local);
                    if (mismaVenta) {
                        return {
                            ...v,
                            detalles: nuevosDetalles,
                            productos: nuevosDetalles,
                            total: nuevoTotal,
                            metodo_pago: metodoPagoNormalizado,
                            ...metaEdicionConfirmada,
                        };
                    }
                    return v;
                })
            );

            const aplicarEdicionEnHistorial = (lista = []) => {
                const updated = (Array.isArray(lista) ? lista : []).map(v => {
                    const mismaVenta =
                        (v.id && v.id === ventaEnEdicion.id) ||
                        (v.id_local && v.id_local === ventaEnEdicion.id_local) ||
                        (v._key && v._key === ventaEnEdicion._key);
                    if (mismaVenta) {
                        return {
                            ...v,
                            detalles: nuevosDetalles,
                            productos: nuevosDetalles,
                            total: nuevoTotal,
                            metodo_pago: metodoPagoNormalizado,
                            ...metaEdicionConfirmada,
                            fecha_actualizacion: metaEdicionConfirmada.fecha_ultima_edicion || v.fecha_actualizacion,
                        };
                    }
                    return v;
                });
                return updated.sort((a, b) => {
                    const fechaA = new Date(a?.fecha_actualizacion || a?.fecha_creacion || a?.fecha || 0).getTime();
                    const fechaB = new Date(b?.fecha_actualizacion || b?.fecha_creacion || b?.fecha || 0).getTime();
                    return fechaB - fechaA;
                });
            };

            setHistorialReimpresion(prev => aplicarEdicionEnHistorial(prev));
            setHistorialResumenPreview(prev => aplicarEdicionEnHistorial(prev));

            // 🔧 Invalidar caché del historial para que se recargue con la edición
            try {
                const fechaStr = `${fechaSeleccionada.getFullYear()}-${String(fechaSeleccionada.getMonth() + 1).padStart(2, '0')}-${String(fechaSeleccionada.getDate()).padStart(2, '0')}`;
                const cacheKey = `historial_cache_${userId}_${fechaStr}`;
                await AsyncStorage.removeItem(cacheKey);
                console.log(`🗑️ Caché de historial invalidado tras edición: ${cacheKey}`);
            } catch (errCache) {
                console.log('⚠️ No se pudo invalidar caché de historial:', errCache?.message);
            }

            ultimaVentaHistorialRef.current = normalizarItemHistorialLocal({
                ...ventaEnEdicion,
                detalles: nuevosDetalles,
                productos: nuevosDetalles,
                total: nuevoTotal,
                metodo_pago: metodoPagoNormalizado,
                ...metaEdicionConfirmada,
                fecha_actualizacion: metaEdicionConfirmada.fecha_ultima_edicion || ventaEnEdicion?.fecha_actualizacion || ventaEnEdicion?.fecha,
            });

            const viejoTotal = parseFloat(ventaEnEdicion.total || 0);
            const diferenciaDinero = nuevoTotal - viejoTotal;
            setTotalDineroHoy(prev => Math.max(0, prev + diferenciaDinero));

            try {
                const ventasGuardadas = await obtenerVentas();
                const ventasActualizadas = ventasGuardadas.map(v => {
                    const mismaVenta =
                        (v.id && v.id === ventaEnEdicion.id) ||
                        (v.id_local && v.id_local === ventaEnEdicion.id_local);
                    if (mismaVenta) {
                        return {
                            ...v,
                            detalles: nuevosDetalles,
                            productos: nuevosDetalles,
                            total: nuevoTotal,
                            metodo_pago: metodoPagoNormalizado,
                            ...metaEdicionConfirmada,
                        };
                    }
                    return v;
                });
                await AsyncStorage.setItem('ventas', JSON.stringify(ventasActualizadas));

                try {
                    const colaRaw = await AsyncStorage.getItem('ventas_pendientes_sync');
                    const cola = colaRaw ? JSON.parse(colaRaw) : [];
                    let huboCambiosEnCola = false;

                    let colaActualizada = cola.map((pendiente) => {
                        const idPendiente = pendiente?.id;
                        const idLocalPendiente = pendiente?.data?.id_local;
                        const mismaVenta =
                            (idPendiente && (idPendiente === ventaEnEdicion.id || idPendiente === ventaEnEdicion.id_local)) ||
                            (idLocalPendiente && (idLocalPendiente === ventaEnEdicion.id || idLocalPendiente === ventaEnEdicion.id_local));

                        if (!mismaVenta) return pendiente;

                        huboCambiosEnCola = true;
                        return {
                            ...pendiente,
                            data: {
                                ...(pendiente?.data || {}),
                                detalles: nuevosDetalles,
                                productos: nuevosDetalles,
                                total: nuevoTotal,
                                metodo_pago: metodoPagoNormalizado,
                                ...metaEdicionLocal,
                            },
                        };
                    });

                    // Si era una venta persistida y la edición inmediata falló, agregarla a la cola
                    if (!huboCambiosEnCola && !respuestaEdicion && esVentaBackendPersistida(ventaEnEdicion)) {
                        colaActualizada.push({
                            id: ventaEnEdicion.id,
                            data: {
                                ...ventaEnEdicion,
                                detalles: nuevosDetalles,
                                productos: nuevosDetalles,
                                total: nuevoTotal,
                                metodo_pago: metodoPagoNormalizado,
                                ...metaEdicionConfirmada,
                            },
                            intentos: 0,
                            fechaCreacion: new Date().toISOString()
                        });
                        huboCambiosEnCola = true;
                    }

                    if (huboCambiosEnCola) {
                        await AsyncStorage.setItem('ventas_pendientes_sync', JSON.stringify(colaActualizada));
                    }
                } catch (colaErr) {
                    console.warn('⚠️ No se pudo actualizar la cola offline tras editar venta:', colaErr?.message || colaErr);
                }
            } catch (err) {
                console.error('Error guardando edición localmente', err);
            }

            bloqueoRefreshStockHastaRef.current = Date.now() + 3 * 60 * 1000;

            setStockCargue((prevStock) => {
                const nuevoStock = { ...prevStock };
                const normalizarNombre = (txt) =>
                    (txt || '')
                        .toString()
                        .normalize('NFD')
                        .replace(/[̀-ͯ]/g, '')
                        .toUpperCase()
                        .replace(/\s+/g, ' ')
                        .trim();

                const resolverClaveStock = (nombreProducto) => {
                    const claveDirecta = (nombreProducto || '').toString().toUpperCase().trim();
                    if (Object.prototype.hasOwnProperty.call(nuevoStock, claveDirecta)) {
                        return claveDirecta;
                    }

                    const nombreNorm = normalizarNombre(nombreProducto);
                    const claveNormalizada = Object.keys(nuevoStock).find(
                        (k) => normalizarNombre(k) === nombreNorm
                    );
                    if (claveNormalizada) return claveNormalizada;

                    const prodCatalogo = productos.find((p) => {
                        const prodNorm = normalizarNombre(p?.nombre);
                        return prodNorm === nombreNorm || prodNorm.includes(nombreNorm) || nombreNorm.includes(prodNorm);
                    });

                    if (prodCatalogo?.nombre) {
                        const claveCatalogo = prodCatalogo.nombre.toUpperCase().trim();
                        if (Object.prototype.hasOwnProperty.call(nuevoStock, claveCatalogo)) {
                            return claveCatalogo;
                        }
                        const claveCatalogoNorm = Object.keys(nuevoStock).find(
                            (k) => normalizarNombre(k) === normalizarNombre(prodCatalogo.nombre)
                        );
                        if (claveCatalogoNorm) return claveCatalogoNorm;
                        return claveCatalogo;
                    }

                    return claveDirecta;
                };

                const detallesViejos = ventaEnEdicion.detalles || [];
                detallesViejos.forEach((item) => {
                    const nombre = resolverClaveStock(item.nombre || item.producto || '');
                    const cant = parseInt(item.cantidad, 10) || 0;
                    if (nombre && cant > 0) {
                        nuevoStock[nombre] = (nuevoStock[nombre] || 0) + cant;
                    }
                });

                nuevosDetalles.forEach((item) => {
                    const nombre = resolverClaveStock(item.nombre || item.producto || '');
                    const cant = parseInt(item.cantidad, 10) || 0;
                    if (nombre && cant > 0) {
                        nuevoStock[nombre] = Math.max(0, (nuevoStock[nombre] || 0) - cant);
                    }
                });

                return nuevoStock;
            });

            cerrarEdicionVenta(false);

            // 🆕 Disparar el loop de sincronización manual para que empiece de una vez 
            // pero sin bloquear el Alert de éxito.
            setTimeout(() => {
                sincronizarPendientesAutomatico({ forzar: true }).catch(() => {});
            }, 100);

            Alert.alert(
                '✅ Venta editada',
                `La venta fue actualizada correctamente.
Nuevo total: ${formatearMoneda(Math.round(nuevoTotal))}
Pago: ${metodoPagoNormalizado}`,
                [{ text: 'Ver historial', onPress: () => abrirHistorialReimpresion() }, { text: 'OK' }]
            );
        } catch (error) {
            if (esErrorVentaYaModificada(error)) {
                Alert.alert('Bloqueado', 'Esta venta ya fue modificada una vez y no admite otra edición.');
                cargarHistorialReimpresion();
            } else {
                Alert.alert('Error al editar', `No se pudo guardar la edición:
${error.message}`);
            }
        } finally {
            setCargandoEdicion(false);
        }
    };

    // 🆕 ANULACIÓN DE VENTA DESDE HISTORIAL
    const anularVentaRuta = async (venta) => {
        const esLocal = !esVentaBackendPersistida(venta);
        
        if (venta.estado === 'ANULADA') {
            Alert.alert('Ya anulada', 'Esta venta ya fue anulada.');
            return;
        }

        // 🔒 LÍMITE DE ANULACIONES: Máximo 1 anulación por venta
        const intentosAnulacion = parseInt(venta.intentos_anulacion) || 0;
        if (intentosAnulacion >= 1) {
            Alert.alert(
                '⚠️ Límite Alcanzado',
                'Esta venta ya fue anulada anteriormente.\n\n' +
                '💡 ¿Necesitas corregir algo?\n' +
                'Usa el botón "✏️ Editar" en vez de anular.\n\n' +
                'Editar mantiene el registro y es más rápido.',
                [{ text: 'Entendido', style: 'default' }]
            );
            return;
        }

        Alert.alert(
            esLocal ? '🚫 Cancelar Venta Local' : '🚫 Anular Venta (Servidor)',
            `¿Confirmas anular la venta de "${venta.cliente_negocio || venta.cliente_nombre || 'Cliente'}"?\n\n` +
            `💰 Total: ${formatearMoneda(Math.round(parseFloat(venta.total) || 0))}\n\n` +
            `📦 Productos a devolver al cargue:\n` +
            ((Array.isArray(venta.detalles) && venta.detalles.length > 0)
                ? venta.detalles.map(item => {
                    const nombre = item.nombre || item.producto || 'Producto';
                    const cant = item.cantidad || 0;
                    return `  • ${cant} × ${nombre}`;
                }).join('\n')
                : '  (sin detalle de productos)') +
            ((Array.isArray(venta.productos_vencidos) && venta.productos_vencidos.length > 0)
                ? `\n\n♻️ Vencidas a reintegrar:\n` +
                  venta.productos_vencidos.map(item => {
                      const nombre = item.producto || item.nombre || 'Producto';
                      const cant = item.cantidad || 0;
                      return `  • ${cant} × ${nombre}`;
                  }).join('\n')
                : '') +
            `\n\n⚠️ Esta acción no se puede deshacer.`,
            [
                { text: 'Cancelar', style: 'cancel' },
                {
                    text: '🚫 Anular',
                    style: 'destructive',
                    onPress: async () => {
                        if (cargandoAnulacion) return;
                        setCargandoAnulacion(true);
                        try {
                            if (esLocal) {
                                console.log('🗑️ Anulando venta local:', venta.id);
                                // 1. Quitar de ventas locales
                                const todasVentas = await obtenerVentas();
                                const filtradas = todasVentas.filter(v => v.id !== venta.id);
                                await AsyncStorage.setItem('ventas', JSON.stringify(filtradas));

                                // 2. Quitar de cola sync (importante para que no se envie despues)
                                const colaRaw = await AsyncStorage.getItem('ventas_pendientes_sync');
                                const cola = colaRaw ? JSON.parse(colaRaw) : [];
                                const nuevaCola = cola.filter(item => {
                                    const idItem = item?.id || item?.data?.id_local || item?.data?.id;
                                    return String(idItem) !== String(venta.id) && String(idItem) !== String(venta.id_local);
                                });
                                await AsyncStorage.setItem('ventas_pendientes_sync', JSON.stringify(nuevaCola));

                                // 3. Actualizar UI
                                const marcarAnuladaUI = v => {
                                    const misma = (v.id && venta.id && String(v.id) === String(venta.id)) ||
                                        (v.id_local && venta.id_local && String(v.id_local) === String(venta.id_local)) ||
                                        (v.id && venta.id_local && String(v.id) === String(venta.id_local)) ||
                                        (v.id_local && venta.id && String(v.id_local) === String(venta.id)) ||
                                        (v._key && venta._key && v._key === venta._key);
                                    // 🔒 Incrementar contador de anulaciones
                                    return misma ? { ...v, estado: 'ANULADA', intentos_anulacion: (parseInt(v.intentos_anulacion) || 0) + 1 } : v;
                                };
                                
                                setVentasDelDia(prev => prev.map(marcarAnuladaUI));
                                setHistorialReimpresion(prev => prev.map(marcarAnuladaUI));
                                
                                 // Resetear stock localmente (Vendidas + Vencidas)
                                 if ((Array.isArray(venta.detalles) && venta.detalles.length > 0) || (Array.isArray(venta.productos_vencidos) && venta.productos_vencidos.length > 0)) {
                                     setStockCargue(prevStock => {
                                         const nuevoStock = { ...prevStock };
                                         
                                         // 1. Devolver productos vendidos
                                         if (Array.isArray(venta.detalles)) {
                                            venta.detalles.forEach(item => {
                                                const nombreProducto = resolverClaveStockEdicion(item.nombre || item.producto || '');
                                                const cantidadDevuelta = parseInt(item.cantidad) || 0;
                                                if (nombreProducto && cantidadDevuelta > 0) {
                                                    nuevoStock[nombreProducto] = (nuevoStock[nombreProducto] || 0) + cantidadDevuelta;
                                                }
                                            });
                                         }
                                         
                                         // 2. Devolver productos vencidos (importante en ventas editadas)
                                         if (Array.isArray(venta.productos_vencidos)) {
                                            venta.productos_vencidos.forEach(item => {
                                                const nombreProducto = resolverClaveStockEdicion(item.producto || item.nombre || '');
                                                const cantidadDevuelta = parseInt(item.cantidad) || 0;
                                                if (nombreProducto && cantidadDevuelta > 0) {
                                                    nuevoStock[nombreProducto] = (nuevoStock[nombreProducto] || 0) + cantidadDevuelta;
                                                }
                                            });
                                         }
                                         
                                         return nuevoStock;
                                     });
                                 }

                                Alert.alert('✅ Cancelada', 'La venta local fue anulada y los productos regresaron al stock.');
                                setCargandoAnulacion(false);
                                return;
                            }

                            // --- CASO BACKEND PERSISTIDA (NO BLOQUEANTE) ---
                             // 🛡️ IMPORTANTE: Limpiar cola sync antes de anular en backend
                             try {
                                 const colaRaw = await AsyncStorage.getItem('ventas_pendientes_sync');
                                 const cola = colaRaw ? JSON.parse(colaRaw) : [];
                                 const nuevaCola = cola.filter(item => {
                                     const idItem = item?.id || item?.data?.id_local || item?.data?.id;
                                     return String(idItem) !== String(venta.id) && String(idItem) !== String(venta.id_local);
                                 });
                                 if (cola.length !== nuevaCola.length) {
                                     console.log(`🧹 Limpiada edición pendiente de cola sync para venta ${venta.id}`);
                                     await AsyncStorage.setItem('ventas_pendientes_sync', JSON.stringify(nuevaCola));
                                 }
                             } catch (errCola) {
                                 console.warn("⚠️ No se pudo limpiar cola sync:", errCola.message);
                             }

                            // Estrategia "Danza del Vendedor": Esperar 6s o liberar UI
                            console.log('🚫 Iniciando anulación resiliente (Race 6s)...');
                             
                            const sincronizarAnulacionBackground = async () => {
                                try {
                                    const controller = new AbortController();
                                    const timeoutId = setTimeout(() => controller.abort(), 12000); // 🔧 Reducido de 30s a 12s
                                    const headers = await obtenerAuthHeaders({ 'Content-Type': 'application/json' });
                                    const response = await fetch(
                                        `${API_URL}/api/ventas-ruta/${venta.id}/anular/`,
                                        { method: 'POST', headers, signal: controller.signal }
                                    );
                                    clearTimeout(timeoutId);
                                    if (!response.ok) throw new Error(`HTTP ${response.status}`);
                                } catch (anErr) {
                                    console.warn('⚠️ Falló anulación inmediata, a cola de pendientes:', anErr.message);
                                    // Agregar a cola (data null indica anulación)
                                    await agregarAColaPendientes(null, venta.id);
                                    sincronizarPendientesAutomatico({ forzar: true });
                                }
                            };

                            // Correr la carrera de 6 segundos
                            await Promise.race([
                                sincronizarAnulacionBackground(),
                                new Promise(resolve => setTimeout(resolve, 6000))
                            ]);

                            // Éxito parcial (flujo sigue localmente aunque el server tarde)
                            const data = { success: true }; 

                            if (data.success) {
                                // Actualizar estado local en los tres estados de ventas (Robusto contra tipos de ID)
                                const marcarAnulada = (v) => {
                                    const v_id = v.id != null ? String(v.id) : null;
                                    const venta_id = venta.id != null ? String(venta.id) : null;
                                    const v_id_local = v.id_local != null ? String(v.id_local) : null;
                                    const venta_id_local = venta.id_local != null ? String(venta.id_local) : null;

                                    const misma = (v_id && venta_id && v_id === venta_id) ||
                                                (v_id_local && venta_id_local && v_id_local === venta_id_local) ||
                                                (v_id && venta_id_local && v_id === venta_id_local) ||
                                                (v_id_local && venta_id && v_id_local === venta_id) ||
                                                (v._key && venta._key && v._key === venta._key);

                                    // 🔒 Incrementar contador de anulaciones
                                    return misma ? { ...v, estado: 'ANULADA', intentos_anulacion: (parseInt(v.intentos_anulacion) || 0) + 1 } : v;
                                };

                                setHistorialReimpresion(prev => {
                                    const updated = prev.map(marcarAnulada);
                                    return updated.sort((a, b) => {
                                        const fA = new Date(a?.fecha_actualizacion || a?.fecha_creacion || a?.fecha || 0).getTime();
                                        const fB = new Date(b?.fecha_actualizacion || b?.fecha_creacion || b?.fecha || 0).getTime();
                                        return fB - fA;
                                    });
                                });
                                setVentasDelDia(prev => prev.map(marcarAnulada));
                                setVentasBackendDia(prev => prev.map(marcarAnulada));

                                // 🆕 Actualizar almacenamiento permanente (AsyncStorage)
                                try {
                                    const ventasGuardadas = await obtenerVentas();
                                    const ventasActualizadas = ventasGuardadas.map(marcarAnulada);
                                    await AsyncStorage.setItem('ventas', JSON.stringify(ventasActualizadas));
                                } catch (err) {
                                    console.error("Error guardando anulación localmente", err);
                                }

                                // 🆕 Restaurar el stock localmente sin necesidad de deslizar hacia abajo
                                 // 🆕 Restaurar el stock localmente (Vendidas + Vencidas)
                                 if ((Array.isArray(venta.detalles) && venta.detalles.length > 0) || (Array.isArray(venta.productos_vencidos) && venta.productos_vencidos.length > 0)) {
                                     setStockCargue(prevStock => {
                                         const nuevoStock = { ...prevStock };
                                         
                                         // 1. Devolver vendidos
                                         if (Array.isArray(venta.detalles)) {
                                             venta.detalles.forEach(item => {
                                                 const nombreProducto = resolverClaveStockEdicion(item.nombre || item.producto || '');
                                                 const cantidadDevuelta = parseInt(item.cantidad) || 0;
                                                 if (nombreProducto && cantidadDevuelta > 0) {
                                                     nuevoStock[nombreProducto] = (nuevoStock[nombreProducto] || 0) + cantidadDevuelta;
                                                     console.log(`♻️ Stock Restituido (Anul): ${nombreProducto} +${cantidadDevuelta}`);
                                                 }
                                             });
                                         }
                                         
                                         // 2. Devolver vencidos
                                         if (Array.isArray(venta.productos_vencidos)) {
                                             venta.productos_vencidos.forEach(item => {
                                                 const nombreProducto = resolverClaveStockEdicion(item.producto || item.nombre || '');
                                                 const cantidadDevuelta = parseInt(item.cantidad) || 0;
                                                 if (nombreProducto && cantidadDevuelta > 0) {
                                                     nuevoStock[nombreProducto] = (nuevoStock[nombreProducto] || 0) + cantidadDevuelta;
                                                     console.log(`♻️ Stock Restituido (Anul Vencida): ${nombreProducto} +${cantidadDevuelta}`);
                                                 }
                                             });
                                         }
                                         
                                         return nuevoStock;
                                     });
                                 }

                                // 🆕 Descontar venta de los contadores rápidos diarios (para UX precisa)
                                setTotalVentasHoy(prev => Math.max(0, prev - 1));
                                setTotalDineroHoy(prev => Math.max(0, prev - parseFloat(venta.total || 0)));

                                // 🆕 Reconciliar con backend para limpiar badges y sincronizar stock
                                try {
                                    await cargarVentasDelDia(fechaSeleccionada);
                                    await refrescarStockSilencioso();
                                } catch (err) {
                                    console.log('⚠️ No se pudo refrescar tras anulación:', err.message);
                                }

                                Alert.alert('✅ Venta Anulada', `La venta fue anulada correctamente.\nLos productos regresaron a tu inventario.`);
                            } else {
                                Alert.alert('Error', data.error || 'No se pudo anular la venta.');
                            }
                        } catch (e) {
                            const esAbort = e.name === 'AbortError';
                            console.error("❌ Error en anulación:", e);
                            
                            // 🛡️ ESTRATEGIA: Si dio timeout (AbortError), es MUY probable que el servidor ya la haya anulado 
                            // pero no alcanzó a avisar. Refrescamos para ver si ya no está.
                            if (esAbort) {
                                try {
                                    console.log('🔄 Intentando verificar anulación tras timeout...');
                                    await cargarVentasDelDia(fechaSeleccionada);
                                    await refrescarStockSilencioso();
                                } catch (_) { /* ignore */ }
                            }

                            Alert.alert(
                                esAbort ? '⏳ Tiempo de Espera Agotado' : '⚠️ Error de conexión', 
                                esAbort 
                                    ? 'La respuesta tardó demasiado, pero es posible que la venta ya esté anulada.\n\nEl listado se actualizará ahora.'
                                    : 'Verifica tu conexión a internet e intenta de nuevo.'
                            );
                        } finally {
                            setCargandoAnulacion(false);
                            // No recargar historial aquí — marcarAnulada ya actualizó el estado local.
                            // Recargar inmediatamente causa race condition: el backend puede no haber
                            // procesado la anulación todavía y la recarga sobreescribe el estado ANULADA.
                        }
                    }
                }
            ]
        );
    };


    const verificarTurnoActivo = async () => {
        const MAX_INTENTOS = 2; // Reducir intentos para no desesperar al usuario
        const TIMEOUT_MS = 3500; // 3.5 segundos por intento

        const restaurarTurnoOfflineGuardado = async () => {
            try {
                const turnoGuardado = await AsyncStorage.getItem(`@turno_activo_${userId}`);
                if (!turnoGuardado) return false;

                const data = JSON.parse(turnoGuardado);

                let esReciente = true;
                if (data.hora_apertura) {
                    const msPasados = new Date() - new Date(data.hora_apertura);
                    const diasPasados = msPasados / (1000 * 60 * 60 * 24);
                    if (diasPasados > 3) esReciente = false;
                }

                if (!esReciente) {
                    console.log(`🗑️ Turno offline muy viejo o inválido descartado (${data.fecha})`);
                    await AsyncStorage.removeItem(`@turno_activo_${userId}`);
                    return false;
                }

                console.log(`✅ Turno activo recuperado OFFLINE para fecha: ${data.fecha}`);

                setDiaSeleccionado(data.dia);
                const fechaTurno = new Date(data.fecha + 'T12:00:00');
                setFechaSeleccionada(fechaTurno);

                verificarPedidosPendientes(data.fecha);
                if (data.hora_apertura) setHoraTurno(new Date(data.hora_apertura));

                setTurnoAbierto(true);
                setMostrarSelectorDia(false);

                await cargarStockCargue(data.dia, fechaTurno);
                cargarDatos(fechaTurno);
                verificarPendientes();
                await cargarVentasDelDia(fechaTurno);

                Alert.alert(
                    '📴 Turno Restaurado Sin Conexión',
                    `Has entrado en modo offline con el turno del ${data.fecha}. Las ventas se conservarán en el celular y se enviarán al reconectar.`,
                    [{ text: 'ENTENDIDO' }]
                );

                return true;
            } catch (e) {
                console.log('⚠️ Error leyendo turno offline:', e);
                return false;
            }
        };

        for (let intento = 1; intento <= MAX_INTENTOS; intento++) {
            try {
                console.log(`🔍 Verificando turno (intento ${intento}/${MAX_INTENTOS})...`);

                // 🛡️ ESTRATEGIA: Si es el primer intento y falla la red, e inmediatamente 
                // intentamos restaurar el offline si el timeout es corto.
                const controller = new AbortController();
                const timeoutId = setTimeout(() => controller.abort(), TIMEOUT_MS);

                const response = await fetch(
                    `${ENDPOINTS.TURNO_VERIFICAR}?vendedor_id=${userId}`,
                    {
                        headers: await obtenerAuthHeaders(),
                        signal: controller.signal
                    }
                );

                clearTimeout(timeoutId);

                if (!response.ok) {
                    throw new Error(`HTTP ${response.status}`);
                }

                const data = await response.json();

                if (data.turno_activo) {
                    console.log('✅ Turno activo encontrado:', data);
                    setDiaSeleccionado(data.dia);

                    const fechaTurno = new Date(data.fecha + 'T12:00:00');
                    setFechaSeleccionada(fechaTurno);

                    verificarPedidosPendientes(data.fecha);

                    if (data.hora_apertura) {
                        setHoraTurno(new Date(data.hora_apertura));
                    }

                    try {
                        await AsyncStorage.setItem(`@turno_activo_${userId}`, JSON.stringify({
                            dia: data.dia,
                            fecha: data.fecha,
                            hora_apertura: data.hora_apertura || new Date().toISOString()
                        }));
                        console.log('💾 Turno sincronizado localmente para offline');
                    } catch (e) {
                        console.log('⚠️ Error guardando turno en offline (sincronizando):', e);
                    }

                    setTurnoAbierto(true);
                    setMostrarSelectorDia(false);

                    await cargarStockCargue(data.dia, fechaTurno);
                    cargarDatos(fechaTurno);
                    verificarPendientes();
                    await cargarVentasDelDia(fechaTurno);

                    return true;
                }
                return false;

            } catch (error) {
                const esTimeout = error.name === 'AbortError';
                const esSinRed = String(error?.message || '').includes('Network request failed');

                console.log(`⚠️ Error verificando turno (intento ${intento}):`, esTimeout ? 'Timeout' : error.message);

                if ((esTimeout || esSinRed) && await restaurarTurnoOfflineGuardado()) {
                    return true;
                }

                if (intento === MAX_INTENTOS) {
                    if (await restaurarTurnoOfflineGuardado()) {
                        return true;
                    }

                    Alert.alert(
                        '⚠️ Sin Conexión',
                        'No se pudo verificar el turno activo.\n\n¿Deseas continuar en modo offline?\n\n(Podrás abrir un turno nuevo, pero no se verificará si ya hay uno abierto)',
                        [
                            {
                                text: 'Volver',
                                style: 'cancel',
                                onPress: () => {
                                    if (navigation) {
                                        navigation.goBack();
                                    }
                                }
                            },
                            {
                                text: 'Continuar Offline',
                                onPress: () => {
                                    console.log('📴 Modo offline activado');
                                    setMostrarSelectorDia(true);
                                }
                            }
                        ]
                    );
                    return false;
                }

                await new Promise(resolve => setTimeout(resolve, 1000 * intento));
            }
        }

        return false;
    };

    // Cargar datos iniciales solo cuando se selecciona un día
    useEffect(() => {
        // 🆕 Verificar primero si hay turno activo
        const inicializar = async () => {
            // Si viene de rutas con cliente preseleccionado
            if (route?.params?.fromRuta && route?.params?.clientePreseleccionado) {
                setClientePreseleccionado(route.params.clientePreseleccionado);
            }

            // Verificar turno activo con tiempo límite estricto para no bloquear UI
            setVerificandoTurno(true);
            try {
                // Si en 10 segundos no ha terminado, forzamos el cierre del modal (fallback offline automático)
                const timeoutCierre = setTimeout(() => {
                    if (verificandoTurno) {
                        console.log('⏰ Forzando cierre de modal verificandoTurno por timeout global');
                        setVerificandoTurno(false);
                    }
                }, 12000);

                const hayTurno = await verificarTurnoActivo();
                clearTimeout(timeoutCierre);
                setVerificandoTurno(false);

                if (!hayTurno) {
                    setMostrarSelectorDia(true);
                }
            } catch (err) {
                console.warn("⚠️ Error en inicialización de turno:", err.message);
                setVerificandoTurno(false);
                setMostrarSelectorDia(true);
            }
        };

        inicializar();
    }, [route.params?.clientePreseleccionado]); // Ejecutar cuando cambie el parámetro de navegación

    // 🆕 Efecto para aplicar precios automáticos si el cliente tiene lista
    useEffect(() => {
        // 🆕 MEJORADO: Aplicar precios de lista SIEMPRE que haya cliente con lista y precios alternos disponibles
        // Esto asegura que cuando cambias de cliente, se apliquen los precios correctos
        if (
            clienteSeleccionado &&
            Object.keys(preciosAlternosCargue).length > 0
        ) {
            const listaCliente = clienteSeleccionado.lista_precio_nombre || clienteSeleccionado.tipo_lista_precio;

            if (listaCliente) {
                const nuevosPrecios = {};

                // Iterar PRODUCTOS (catálogo cargado) y buscar precio en lista
                productos.forEach(prod => {
                    const nombreProd = prod.nombre.toUpperCase();
                    let preciosAlt = preciosAlternosCargue[nombreProd];

                    if (!preciosAlt) {
                        const key = Object.keys(preciosAlternosCargue).find(k => k.includes(nombreProd) || nombreProd.includes(k));
                        if (key) preciosAlt = preciosAlternosCargue[key];
                    }

                    if (preciosAlt && preciosAlt[listaCliente]) {
                        nuevosPrecios[prod.id] = preciosAlt[listaCliente];
                    }
                });

                if (Object.keys(nuevosPrecios).length > 0) {
                    setPreciosPersonalizados(nuevosPrecios);
                } else {
                    // Si no hay precios para esta lista, limpiar precios personalizados
                    setPreciosPersonalizados({});
                }
            } else {
                // Si el cliente no tiene lista, limpiar precios personalizados
                setPreciosPersonalizados({});
            }
        }
    }, [clienteSeleccionado, preciosAlternosCargue, productos]); // Dependencias clave

    // 🆕 Cargar datos iniciales con cliente preseleccionado
    const cargarDatosConClientePreseleccionado = async (clientePre) => {
        // Cargar productos filtrados por disponible_app_ventas
        const productosData = obtenerProductos();
        const productosFiltrados = productosData.filter(p => p.disponible_app_ventas !== false);
        setProductos(productosFiltrados);

        // Cargar clientes
        const clientesData = await obtenerClientes();
        setClientes(clientesData);

        // Buscar si el cliente existe en la lista o crear uno temporal
        const clienteExistente = clientesData.find((cliente) => coincideCliente(cliente, clientePre));

        if (clienteExistente) {
            // Con cliente fresco, confiar en la lista actual del backend/ruta y no arrastrar listas viejas guardadas.
            setClienteSeleccionado({
                ...clienteExistente,
                lista_precio_nombre: clienteExistente.lista_precio_nombre || null,
                tipo_lista_precio: clienteExistente.tipo_lista_precio || clienteExistente.lista_precio_nombre || null
            });
        } else {
            // Si no existe en la lista fresca, restaurar lo mínimo del cliente guardado.
            setClienteSeleccionado({
                id: clientePre.id,
                nombre: clientePre.nombre_contacto || clientePre.nombre_negocio,
                nombre_negocio: clientePre.nombre_negocio,
                direccion: clientePre.direccion,
                telefono: clientePre.telefono,
                lista_precio_nombre: clientePre.lista_precio_nombre || null,
                tipo_lista_precio: clientePre.tipo_lista_precio || clientePre.lista_precio_nombre || null
            });
        }

        verificarPendientes();
    };

    const cargarDatos = async (fechaObjetivo = fechaSeleccionada) => {
        // Cargar productos filtrados por disponible_app_ventas
        const productosData = obtenerProductos();
        const productosFiltrados = productosData.filter(p => p.disponible_app_ventas !== false);
        setProductos(productosFiltrados);

        // Cargar clientes
        const clientesData = await obtenerClientes();
        setClientes(clientesData);

        try {
            const storageKey = obtenerClaveUltimoCliente(fechaObjetivo);
            const ultimoClienteRaw = storageKey ? await AsyncStorage.getItem(storageKey) : null;
            const ultimoCliente = ultimoClienteRaw ? JSON.parse(ultimoClienteRaw) : null;

            if (ultimoCliente) {
                const clienteRestaurado = clientesData.find((cliente) => coincideCliente(cliente, ultimoCliente));

                if (clienteRestaurado) {
                    seleccionarClienteDirecto({
                        ...clienteRestaurado,
                        lista_precio_nombre: clienteRestaurado?.lista_precio_nombre || null,
                        tipo_lista_precio: clienteRestaurado?.tipo_lista_precio || clienteRestaurado?.lista_precio_nombre || null,
                    });
                    return;
                }

                seleccionarClienteDirecto({
                    ...ultimoCliente,
                    lista_precio_nombre: ultimoCliente?.lista_precio_nombre || null,
                    tipo_lista_precio: ultimoCliente?.tipo_lista_precio || ultimoCliente?.lista_precio_nombre || null,
                });
                return;
            }
        } catch (error) {
            console.log('⚠️ No se pudo restaurar el último cliente seleccionado:', error?.message || error);
        }

        // NO seleccionar cliente por defecto - Obligar al usuario a elegir
        setClienteSeleccionado(null);
    };

    const formatearFechaOperativaStock = useCallback((fecha) => {
        if (fecha instanceof Date) {
            const year = fecha.getFullYear();
            const month = String(fecha.getMonth() + 1).padStart(2, '0');
            const day = String(fecha.getDate()).padStart(2, '0');
            return `${year}-${month}-${day}`;
        }

        return String(fecha || '').slice(0, 10);
    }, []);


    const obtenerClaveUltimoCliente = useCallback((fechaObjetivo = fechaSeleccionada) => {
        if (!userId) return '';
        const fechaKey = formatearFechaOperativaStock(fechaObjetivo);
        if (!fechaKey) return '';
        return `@ventas_ultimo_cliente_${userId}_${fechaKey}`;
    }, [userId, fechaSeleccionada, formatearFechaOperativaStock]);

    const guardarUltimoClienteSeleccionado = useCallback(async (cliente, fechaObjetivo = fechaSeleccionada) => {
        try {
            const storageKey = obtenerClaveUltimoCliente(fechaObjetivo);
            if (!storageKey) return;

            if (!cliente || cliente.id === 'general') {
                await AsyncStorage.removeItem(storageKey);
                return;
            }

            await AsyncStorage.setItem(storageKey, JSON.stringify(cliente));
        } catch (error) {
            console.log('⚠️ No se pudo guardar el último cliente seleccionado:', error?.message || error);
        }
    }, [obtenerClaveUltimoCliente, fechaSeleccionada]);

    const limpiarUltimoClienteSeleccionado = useCallback(async (fechaObjetivo = fechaSeleccionada) => {
        try {
            const storageKey = obtenerClaveUltimoCliente(fechaObjetivo);
            if (!storageKey) return;
            await AsyncStorage.removeItem(storageKey);
        } catch (error) {
            console.log('⚠️ No se pudo limpiar el último cliente seleccionado:', error?.message || error);
        }
    }, [obtenerClaveUltimoCliente, fechaSeleccionada]);

    const reconciliarStockConVentasLocales = useCallback(async (stockBase, fechaOperativa) => {
        const stockReconciliado = { ...stockBase };

        const normalizarClave = (valor) => String(valor || '')
            .normalize('NFD')
            .replace(/[̀-ͯ]/g, '')
            .toUpperCase()
            .trim();

        try {
            const [ventasLocales, pendientesSync] = await Promise.all([
                obtenerVentas(),
                obtenerVentasPendientes(),
            ]);

            const idsPendientes = new Set(
                (pendientesSync || [])
                    .map((venta) => String(venta?.id || venta?.data?.id_local || venta?.data?.id || ''))
                    .filter(Boolean)
            );

            const ventasNoSincronizadas = (ventasLocales || []).filter((venta) => {
                const fechaVenta = String(venta?.fecha || '').slice(0, 10);
                if (fechaVenta !== fechaOperativa) return false;
                if (String(venta?.estado || '').toUpperCase() === 'ANULADA') return false;

                const ventaId = String(venta?.id || '');
                return venta?.sincronizada !== true || idsPendientes.has(ventaId);
            });

            ventasNoSincronizadas.forEach((venta) => {
                const detalles = Array.isArray(venta?.detalles)
                    ? venta.detalles
                    : Array.isArray(venta?.productos)
                        ? venta.productos
                        : [];

                detalles.forEach((item) => {
                    const clave = normalizarClave(item?.nombre || item?.producto);
                    const cantidad = parseInt(item?.cantidad, 10) || 0;
                    if (!clave || cantidad <= 0) return;

                    const stockActual = parseInt(stockReconciliado[clave] || 0, 10) || 0;
                    stockReconciliado[clave] = Math.max(0, stockActual - cantidad);
                });

                const vencidas = Array.isArray(venta?.productos_vencidos)
                    ? venta.productos_vencidos
                    : Array.isArray(venta?.vencidas)
                        ? venta.vencidas
                        : [];

                vencidas.forEach((item) => {
                    const clave = normalizarClave(item?.nombre || item?.producto);
                    const cantidad = parseInt(item?.cantidad, 10) || 0;
                    if (!clave || cantidad <= 0) return;

                    const stockActual = parseInt(stockReconciliado[clave] || 0, 10) || 0;
                    stockReconciliado[clave] = Math.max(0, stockActual - cantidad);
                });
            });

            return stockReconciliado;
        } catch (error) {
            console.log('⚠️ No se pudo reconciliar stock con ventas locales:', error?.message || error);
            return stockBase;
        }
    }, []);

    // 🆕 Cargar stock del cargue según el día y fecha
    const cargarStockCargue = async (dia, fecha) => {
        try {
            const fechaFormateada = formatearFechaOperativaStock(fecha);
            const stockPrevio = { ...stockCargue };
            
            // 🆕 Intentar cargar stock desde caché de AsyncStorage
            const cacheKey = `@stock_cargue_${userId}_${fechaFormateada}`;
            let stockCache = null;
            try {
                const stockCacheStr = await AsyncStorage.getItem(cacheKey);
                if (stockCacheStr) {
                    stockCache = JSON.parse(stockCacheStr);
                    console.log('📦 Stock en caché encontrado:', Object.keys(stockCache).length, 'productos');
                }
            } catch (e) {
                console.log('⚠️ No se pudo leer caché de stock:', e?.message);
            }

            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 15000); // 🔧 Reducido de 30s a 15s

            try {
                const response = await fetch(
                    `${ENDPOINTS.OBTENER_CARGUE}?vendedor_id=${userId}&dia=${dia}&fecha=${fechaFormateada}`,
                    { signal: controller.signal }
                );
                clearTimeout(timeoutId);

                const data = await response.json();

                if (data && Object.keys(data).length > 0) {
                    const stockPorProducto = {};
                    const preciosAlternos = {};
                    let totalProductos = 0;
                    let estadoCargue = 'DESCONOCIDO';

                    Object.keys(data).forEach(nombreProducto => {
                        const item = data[nombreProducto];
                        const stockDisponible = parseInt(item.quantity) || 0;
                        stockPorProducto[nombreProducto.toUpperCase()] = stockDisponible;
                        totalProductos++;

                        if (item.estado) {
                            estadoCargue = item.estado;
                        }

                        if (item.precios_alternos) {
                            preciosAlternos[nombreProducto.toUpperCase()] = item.precios_alternos;
                        }
                    });

                    const stockReconciliado = await reconciliarStockConVentasLocales(stockPorProducto, fechaFormateada);

                    // 🆕 Guardar stock en caché para recuperación offline
                    try {
                        await AsyncStorage.setItem(cacheKey, JSON.stringify(stockReconciliado));
                        console.log('💾 Stock guardado en caché');
                    } catch (e) {
                        console.log('⚠️ No se pudo guardar caché de stock:', e?.message);
                    }

                    // Si hay un bloqueo activo (venta recién guardada), no sobreescribir el stock
                    // que ya fue calculado correctamente en confirmarVenta.
                    if (Date.now() < (bloqueoRefreshStockHastaRef.current || 0)) {
                        console.log('⏸️ cargarStockCargue: bloqueo activo, descartando recarga para evitar flash de stock.');
                        return { hayCargue: true, totalProductos, estado: estadoCargue };
                    }

                    setStockCargue(stockReconciliado);
                    setPreciosAlternosCargue(preciosAlternos);
                    console.log('📦 Stock cargado/reconciliado:', Object.keys(stockReconciliado).length, 'productos');

                    return {
                        hayCargue: true,
                        totalProductos,
                        estado: estadoCargue
                    };
                }

                console.log('⚠️ No hay cargue para esta fecha');
                setStockCargue({});
                return {
                    hayCargue: false,
                    totalProductos: 0,
                    estado: null
                };
            } catch (fetchError) {
                clearTimeout(timeoutId);
                const mensaje = String(fetchError?.message || '');
                const isNetworkError = fetchError.name === 'AbortError' || mensaje.includes('Network') || mensaje.includes('fetch');

                if (fetchError.name === 'AbortError') {
                    console.log('⏱️ Timeout cargando stock; intentando recuperar desde caché');
                } else {
                    console.log('⚠️ Error cargando stock; intentando recuperar desde caché:', mensaje);
                }

                // 🆕 RECUPERACIÓN OFFLINE: Usar caché si existe
                const stockAUsar = stockCache || stockPrevio;
                
                if (Object.keys(stockAUsar).length > 0) {
                    // Reconciliar con ventas locales
                    const stockReconciliado = await reconciliarStockConVentasLocales(stockAUsar, fechaFormateada);
                    if (Date.now() < (bloqueoRefreshStockHastaRef.current || 0)) {
                        console.log('⏸️ cargarStockCargue (caché): bloqueo activo, descartando recarga.');
                        return { hayCargue: true, totalProductos: Object.keys(stockReconciliado).length, estado: 'DESPACHO', offline: isNetworkError, stockLocalConservado: true };
                    }
                    setStockCargue(stockReconciliado);
                    console.log('✅ Stock recuperado desde caché:', Object.keys(stockReconciliado).length, 'productos');
                    
                    return {
                        hayCargue: true,
                        totalProductos: Object.keys(stockReconciliado).length,
                        estado: 'DESPACHO', // Asumir DESPACHO si hay stock en caché
                        offline: isNetworkError,
                        stockLocalConservado: true
                    };
                } else {
                    setStockCargue({});
                    console.log('❌ No hay stock en caché ni en memoria');
                    return {
                        hayCargue: false,
                        totalProductos: 0,
                        estado: null,
                        offline: isNetworkError,
                        stockLocalConservado: false
                    };
                }
            }
        } catch (error) {
            console.log('⚠️ Error general cargando stock:', error?.message || error);
            return {
                hayCargue: Object.keys(stockCargue).length > 0,
                totalProductos: Object.keys(stockCargue).length,
                estado: null,
                offline: true,
                stockLocalConservado: Object.keys(stockCargue).length > 0
            };
        }
    };

    // Verificar ventas pendientes de sincronizar
    const verificarPendientes = async () => {
        const pendientes = await obtenerVentasPendientes();
        setVentasPendientes(contarPendientesSincronizables(pendientes));
    };

    const refrescarStockSilencioso = useCallback(async () => {
        if (!turnoAbierto || !diaSeleccionado || !fechaSeleccionada || !userId) return;
        if (Date.now() < (bloqueoRefreshStockHastaRef.current || 0)) return;

        try {
            const netInfo = await NetInfo.fetch();
            if (!netInfo.isConnected) return;

            await cargarStockCargue(diaSeleccionado, fechaSeleccionada);
        } catch (error) {
            console.log('⚠️ Refresh silencioso de stock falló:', error?.message || error);
        }
    }, [turnoAbierto, diaSeleccionado, fechaSeleccionada, userId]);

    // Función para sincronizar al arrastrar hacia abajo (con timeout y manejo de errores)
    const onRefresh = async () => {
        setRefreshing(true);
        const TIMEOUT_MS = 25000; // 10 segundos timeout

        try {
            // Helper para ejecutar con timeout
            const conTimeout = (promesa, nombre) => {
                return Promise.race([
                    promesa,
                    new Promise((_, reject) =>
                        setTimeout(() => reject(new Error(`Timeout: ${nombre}`)), TIMEOUT_MS)
                    )
                ]);
            };

            const resultados = {
                ventas: null,
                productos: false,
                stock: false,
                pedidos: false,
                errores: []
            };

            // 1. Sincronizar ventas pendientes (con timeout)
            try {
                resultados.ventas = await conTimeout(
                    sincronizarVentasPendientes(),
                    'Sincronización de ventas'
                );
            } catch (error) {
                console.log('⚠️ Error sincronizando ventas:', error.message);
                resultados.errores.push('Ventas pendientes');
            }

            // 2. Sincronizar acciones de pedidos (con timeout)
            try {
                await conTimeout(
                    sincronizarPedidosAccionesPendientes(),
                    'Sincronización de pedidos'
                );
            } catch (error) {
                console.log('⚠️ Error sincronizando pedidos:', error.message);
                resultados.errores.push('Pedidos pendientes');
            }

            // 3. Sincronizar productos (con timeout)
            try {
                await conTimeout(
                    sincronizarProductos(),
                    'Sincronización de productos'
                );

                // 3. Recargar productos actualizados filtrados por disponible_app_ventas
                const productosData = obtenerProductos();
                const productosFiltrados = productosData.filter(p => p.disponible_app_ventas !== false);
                setProductos(productosFiltrados);
                resultados.productos = true;
            } catch (error) {
                console.log('⚠️ Error sincronizando productos:', error.message);
                resultados.errores.push('Productos y precios');
            }

            // 4. Recargar stock del cargue (con timeout)
            try {
                await conTimeout(
                    cargarStockCargue(diaSeleccionado, fechaSeleccionada),
                    'Carga de stock'
                );
                resultados.stock = true;
            } catch (error) {
                console.log('⚠️ Error cargando stock:', error.message);
                resultados.errores.push('Stock del cargue');
            }

            // 5. Recargar pedidos pendientes (con timeout)
            try {
                const fechaStr = `${fechaSeleccionada.getFullYear()}-${String(fechaSeleccionada.getMonth() + 1).padStart(2, '0')}-${String(fechaSeleccionada.getDate()).padStart(2, '0')}`;
                await conTimeout(
                    verificarPedidosPendientes(fechaStr),
                    'Verificación de pedidos'
                );
                resultados.pedidos = true;
            } catch (error) {
                console.log('⚠️ Error verificando pedidos:', error.message);
                resultados.errores.push('Pedidos pendientes');
            }

            // 6. Actualizar contador de pendientes (sin timeout crítico)
            try {
                await verificarPendientes();
            } catch (error) {
                console.log('⚠️ Error actualizando contador:', error.message);
            }

            // Construir mensaje de resultado
            let mensaje = '';
            const exitosos = [];

            if (resultados.productos) exitosos.push('✅ Productos y precios');
            if (resultados.stock) exitosos.push('✅ Stock del cargue');
            if (resultados.pedidos) exitosos.push('✅ Pedidos');

            if (resultados.ventas) {
                if (resultados.ventas.sincronizadas > 0) {
                    exitosos.push(`✅ ${resultados.ventas.sincronizadas} ventas sincronizadas`);
                }
                if (resultados.ventas.pendientes > 0) {
                    exitosos.push(`⏳ ${resultados.ventas.pendientes} ventas pendientes`);
                }
            }

            if (exitosos.length > 0) {
                mensaje = exitosos.join('\n');
            }

            if (resultados.errores.length > 0) {
                mensaje += (mensaje ? '\n\n' : '') + '⚠️ No se pudo actualizar:\n' + resultados.errores.join(', ');
            }

            if (!mensaje) {
                mensaje = '⚠️ No se pudo conectar con el servidor';
            }

            Alert.alert(
                resultados.errores.length === 0 ? 'Actualizado' : 'Actualización Parcial',
                mensaje
            );

        } catch (error) {
            console.error('❌ Error general sincronizando:', error);
            Alert.alert(
                '⚠️ Error de Conexión',
                'No se pudo actualizar. Verifica tu conexión a internet.\n\n' +
                'Puedes seguir trabajando offline, las ventas se sincronizarán automáticamente cuando haya conexión.'
            );
        } finally {
            setRefreshing(false);
        }
    };

    useEffect(() => {
        if (!turnoAbierto || !diaSeleccionado || !fechaSeleccionada || !userId) return undefined;

        const appStateSub = AppState.addEventListener('change', (nextState) => {
            if (nextState === 'active') {
                refrescarStockSilencioso();
                // Al volver al frente, intentar sincronizar pendientes (por si volvió internet mientras estaba en background)
                sincronizarPendientesAutomatico({ forzar: false });
            }
        });

        return () => {
            appStateSub?.remove?.();
        };
    }, [turnoAbierto, diaSeleccionado, fechaSeleccionada, userId, refrescarStockSilencioso, sincronizarPendientesAutomatico]);

    useEffect(() => {
        if (!turnoAbierto || !diaSeleccionado || !fechaSeleccionada || !userId) return undefined;

        const intervalId = setInterval(() => {
            refrescarStockSilencioso();
        }, 45000);

        return () => clearInterval(intervalId);
    }, [turnoAbierto, diaSeleccionado, fechaSeleccionada, userId, refrescarStockSilencioso]);

    const normalizarTexto = useCallback((txt) => (
        (txt || '')
            .toString()
            .normalize('NFD')
            .replace(/[\u0300-\u036f]/g, '')
            .toUpperCase()
            .trim()
    ), []);

    const productosPorId = useMemo(() => {
        const mapa = new Map();
        productos.forEach((p) => {
            const idNumerico = Number(p.id);
            mapa.set(idNumerico, p);
        });
        return mapa;
    }, [productos]);

    const productosIndexBusqueda = useMemo(() => (
        productos.map((p) => ({
            producto: p,
            nombreNormalizado: normalizarTexto(p?.nombre),
        }))
    ), [productos, normalizarTexto]);

    const productosSugeridosEdicion = useMemo(() => {
        const query = normalizarTexto(busquedaProductoEdicion);
        if (!query || query.length < 2) return [];

        return productosIndexBusqueda
            .filter((entry) => entry.nombreNormalizado.includes(query))
            .slice(0, 8)
            .map((entry) => entry.producto);
    }, [busquedaProductoEdicion, productosIndexBusqueda, normalizarTexto]);

    // Filtrar productos según búsqueda (usa el estado local para funcionar igual online/offline)
    const productosFiltrados = useMemo(() => {
        const query = normalizarTexto(busquedaProductoDebounced);
        if (!query) return productos;

        return productosIndexBusqueda
            .filter((entry) => entry.nombreNormalizado.includes(query))
            .map((entry) => entry.producto);
    }, [busquedaProductoDebounced, productos, productosIndexBusqueda, normalizarTexto]);

    const preciosPorProductoId = useMemo(() => {
        const mapa = {};
        const listaCliente = clienteSeleccionado?.lista_precio_nombre || clienteSeleccionado?.tipo_lista_precio;
        const keysPreciosAlternos = Object.keys(preciosAlternosCargue || {});

        productos.forEach((producto) => {
            const idNumerico = Number(producto.id);

            if (preciosPersonalizados[idNumerico] !== undefined) {
                mapa[idNumerico] = preciosPersonalizados[idNumerico];
                return;
            }

            let precioFinal = producto.precio;
            if (listaCliente) {
                const nombreProd = (producto.nombre || '').toUpperCase();
                let preciosAlt = preciosAlternosCargue[nombreProd];

                if (!preciosAlt) {
                    const key = keysPreciosAlternos.find((k) => k.includes(nombreProd) || nombreProd.includes(k));
                    if (key) preciosAlt = preciosAlternosCargue[key];
                }

                if (preciosAlt?.[listaCliente] !== undefined) {
                    precioFinal = preciosAlt[listaCliente];
                }
            }

            mapa[idNumerico] = precioFinal;
        });

        return mapa;
    }, [productos, preciosPersonalizados, clienteSeleccionado, preciosAlternosCargue]);

    // Obtener cantidad de un producto en el carrito - 🚀 Optimizado con useCallback
    const getCantidad = useCallback((productoId) => {
        return carrito[productoId] || 0;
    }, [carrito]);

    // Actualizar cantidad de un producto - 🚀 Optimizado con useCallback
    const actualizarCantidad = useCallback((productoId, nuevaCantidad) => {
        if (nuevaCantidad < 0) return;

        const idNumerico = Number(productoId);
        const producto = productosPorId.get(idNumerico);
        const cantidadActual = carritoRef.current[idNumerico] || 0;

        // 🆕 Validación de Stock
        if (producto && !pedidoClienteSeleccionado) {
            const nombreNormalizado = (producto.nombre || '').trim().toUpperCase();
            const stockDisponible = stockCargue[nombreNormalizado] !== undefined ? stockCargue[nombreNormalizado] : 0;

            if (nuevaCantidad > cantidadActual && nuevaCantidad > stockDisponible) {
                Alert.alert(
                    '⚠️ Sin Stock suficiente',
                    `Solo tienes ${stockDisponible} unidades de ${producto.nombre} en tu carga.\n\nNo puedes vender más de lo que llevas físicamente.`
                );
                return; // ⛔ Evitar actualización
            }
        }

        setCarrito((prev) => {
            const nuevoCarrito = { ...prev };
            if (nuevaCantidad === 0) {
                delete nuevoCarrito[idNumerico];
            } else {
                nuevoCarrito[idNumerico] = nuevaCantidad;
            }
            return nuevoCarrito;
        });
    }, [productosPorId, stockCargue, pedidoClienteSeleccionado]);

    // 🆕 Helper para obtener el precio real de un producto - 🚀 Optimizado con useCallback
    const getPrecioProducto = useCallback((producto) => {
        return preciosPorProductoId[Number(producto.id)] ?? producto.precio;
    }, [preciosPorProductoId]);

    const agregarProductoEdicion = useCallback((producto) => {
        if (!producto?.nombre) return;

        const nombreProducto = String(producto.nombre).trim();
        const precioUnitario = Number(preciosPorProductoId[Number(producto.id)] ?? producto.precio ?? 0);
        const maximoPermitido = obtenerMaximoEditableProducto(nombreProducto);

        if (maximoPermitido <= 0) {
            Alert.alert(
                'Sin stock',
                `No tienes unidades disponibles de "${nombreProducto}" para agregar en esta edición.`
            );
            return;
        }

        setCarritoEdicion((prev) => {
            const itemActual = prev[nombreProducto];
            // Si ya está en carrito, sumar 1. Si es nuevo, arrancar en 0 para que vendedor vea stock primero.
            const cantidadNueva = itemActual ? (itemActual.cantidad || 0) + 1 : 0;

            if (cantidadNueva > maximoPermitido) {
                Alert.alert(
                    'Stock insuficiente',
                    `Solo tienes ${maximoPermitido} und disponibles para "${nombreProducto}".`
                );
                return prev;
            }

            return {
                ...prev,
                [nombreProducto]: {
                    cantidad: cantidadNueva,
                    precio: precioUnitario,
                    subtotal: precioUnitario * cantidadNueva,
                },
            };
        });

        setBusquedaProductoEdicion('');

        // Enfocar de inmediato la cantidad del producto agregado para que el vendedor
        // escriba la cantidad sin tener que buscar la fila manualmente.
        setTimeout(() => {
            const nombres = Object.keys(carritoEdicionRef.current || {});
            const index = nombres.findIndex((n) => n === nombreProducto);
            if (index >= 0) {
                asegurarVisibilidadInputEdicion(
                    index + 1,
                    0,
                    tecladoAbierto ? true : null,
                    tecladoAbierto
                );
            }

            const inputRef = inputsCantidadEdicionRef.current[nombreProducto];
            if (inputRef?.focus) {
                inputRef.focus();
            }
        }, tecladoAbierto ? 80 : 150);
    }, [preciosPorProductoId, asegurarVisibilidadInputEdicion, tecladoAbierto, obtenerMaximoEditableProducto]);

    // Calcular totales - 🚀 Optimizado con useMemo
    const { subtotal, total } = useMemo(() => {
        let subtotalVal = 0;

        Object.entries(carrito).forEach(([idStr, cantidad]) => {
            if (!cantidad || cantidad <= 0) return;

            const producto = productosPorId.get(Number(idStr));
            if (!producto) return;

            const precioReal = getPrecioProducto(producto);
            subtotalVal += precioReal * cantidad;
        });

        const totalVal = subtotalVal - descuento;

        return { subtotal: subtotalVal, total: totalVal };
    }, [carrito, productosPorId, getPrecioProducto, descuento]);

    const productosVentaPreview = useMemo(() => (
        Object.entries(carrito)
            .filter(([, cantidad]) => cantidad > 0)
            .map(([idStr, cantidad]) => {
                const id = Number(idStr);
                const producto = productosPorId.get(id);
                if (!producto) return null;

                const precio = preciosPersonalizados[id] !== undefined
                    ? preciosPersonalizados[id]
                    : producto.precio;

                return {
                    id: producto.id,
                    nombre: producto.nombre,
                    precio,
                    cantidad,
                    subtotal: precio * cantidad,
                };
            })
            .filter(Boolean)
    ), [carrito, productosPorId, preciosPersonalizados]);

    const construirAdvertenciasVencidasVenta = useCallback((vencidasObjetivo = []) => {
        if (!vencidasObjetivo || vencidasObjetivo.length === 0) return [];

        return vencidasObjetivo.reduce((acumulado, vencida) => {
            const nombreProducto = String(vencida?.nombre || '').toUpperCase();
            const stockActual = stockCargue[nombreProducto] || 0;
            const cantidadVendida = productosVentaPreview.find(
                (producto) => String(producto?.nombre || '').toUpperCase() === nombreProducto
            )?.cantidad || 0;
            const stockDisponible = stockActual - cantidadVendida;

            if (vencida.cantidad > stockDisponible) {
                if (stockDisponible <= 0) {
                    acumulado.push(`⚠️ ${vencida.nombre}: No tienes stock para cambiar ${vencida.cantidad} vencidas`);
                } else {
                    acumulado.push(`⚠️ ${vencida.nombre}: Solo tienes ${stockDisponible} para cambiar ${vencida.cantidad} vencidas`);
                }
            }

            return acumulado;
        }, []);
    }, [stockCargue, productosVentaPreview]);

    const advertenciasVencidasPreview = useMemo(() => {
        return construirAdvertenciasVencidasVenta(vencidas);
    }, [vencidas, construirAdvertenciasVencidasVenta]);

    const obtenerStockDisponibleVencidaVenta = useCallback((nombreProducto = '') => {
        const nombreNormalizado = normalizarNombreStockEdicion(nombreProducto);
        const claveStock = resolverClaveStockEdicion(nombreProducto);
        const stockActual = parseInt(stockCargue[claveStock] || 0, 10) || 0;
        const cantidadVendida = productosVentaPreview.find((producto) => (
            normalizarNombreStockEdicion(producto?.nombre || producto?.producto || '') === nombreNormalizado
        ))?.cantidad || 0;

        return Math.max(0, stockActual - cantidadVendida);
    }, [normalizarNombreStockEdicion, resolverClaveStockEdicion, stockCargue, productosVentaPreview]);

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

        // 🆕 Validar tope de venta para clientes ocasionales y BLOQUEAR
        if (clienteSeleccionado.esOcasional) {
            let topeVenta = parseFloat(topeVentaRutaOcasional || clienteSeleccionado.tope_venta || 60000);

            try {
                const configRuta = await verificarFlagsRuta();
                if (configRuta?.tope) {
                    topeVenta = parseFloat(configRuta.tope) || topeVenta;
                }
            } catch (e) {
                console.log('⚠️ No se pudo refrescar el tope ocasional antes de vender:', e?.message || e);
            }

            // 🆕 Calcular suma de ventas ocasionales ya hechas hoy
            const totalOcasionalesPrevias = (ventasDelDia || []).reduce((sum, v) => {
                const esOcasional = v.cliente_ocasional ||
                    (v.cliente_negocio && String(v.cliente_negocio).toUpperCase().includes('(OCASIONAL)')) ||
                    (v.nombre_negocio && String(v.nombre_negocio).toUpperCase().includes('(OCASIONAL)'));

                if (esOcasional && String(v.estado || '').toUpperCase() !== 'ANULADA') {
                    return sum + (parseFloat(v.total) || 0);
                }
                return sum;
            }, 0);

            const totalAcumulado = totalOcasionalesPrevias + total;

            if (totalAcumulado > topeVenta) {
                Alert.alert(
                    'Tope Diario Excedido',
                    `Tu límite diario para clientes ocasionales es de $${topeVenta.toLocaleString()}.\n\nYa has vendido $${totalOcasionalesPrevias.toLocaleString()} hoy, y esta venta es de $${total.toLocaleString()} (Acumulado: $${totalAcumulado.toLocaleString()}).\n\nSolicita un aumento de tope desde "Otros -> Gestión de Rutas -> Clientes Ocasionales".`
                );
                return; // ⛔ Bloquear la venta
            }
        }

        // 🆕 Función interna para procesar la venta después de validaciones
        const procesarVenta = () => {
            const productosVenta = productosVentaPreview;

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
                fotoVencidas: fotoVencidas,
                // 🆕 Si es cliente ocasional, incluir su ID real
                ...(clienteSeleccionado.esOcasional && clienteSeleccionado.clienteOcasionalId ? {
                    cliente_ocasional: clienteSeleccionado.clienteOcasionalId
                } : {})
            };

            setVentaTemporal(venta);

            const advertenciasVencidas = advertenciasVencidasPreview;

            // Si hay advertencias, mostrar alerta pero permitir continuar
            // Función auxiliar para abrir el modal correcto
            const abrirModalConfirmacion = () => {
                if (pedidoClienteSeleccionado) {
                    // Si es Edición de Pedido -> Modal Pequeño (ConfirmarEntregaModal)

                    // 🆕 Construir detalles actualizados basados en el carrito para mostrar en el modal
                    const detallesVisuales = productosVenta.map(p => ({
                        producto_nombre: p.nombre,
                        cantidad: p.cantidad,
                        precio_unitario: p.precio,
                        subtotal: p.subtotal
                    }));

                    setPedidoParaEntregar({
                        ...pedidoClienteSeleccionado,
                        total: venta.total, // Usar el NUEVO total calculado
                        numero_pedido: pedidoClienteSeleccionado.numero_pedido,
                        detalles: detallesVisuales // 🆕 Detalles actualizados
                    });
                    requestAnimationFrame(() => setMostrarResumenEntrega(true));
                } else {
                    // Si es Venta Normal -> Modal Grande (ResumenVentaModal)
                    requestAnimationFrame(() => setMostrarResumen(true));
                }
            };

            if (advertenciasVencidas.length > 0) {
                Alert.alert(
                    '⚠️ Advertencia de Stock',
                    advertenciasVencidas.join('\n') + '\n\n¿Deseas continuar de todas formas?',
                    [
                        { text: 'Cancelar', style: 'cancel' },
                        { text: 'Continuar', onPress: abrirModalConfirmacion }
                    ]
                );
            } else {
                abrirModalConfirmacion();
            }
        };

        // DETECCIÓN DE VENTA REPETIDA — permite máximo 2 ventas por cliente por día
        const conteoVentas = contarVentasActivasCliente(clienteSeleccionado);

        if (conteoVentas >= 2 && !pedidoClienteSeleccionado) {
            Alert.alert(
                '🚫 Límite de Ventas',
                `Ya realizaste 2 ventas a ${clienteSeleccionado.negocio || clienteSeleccionado.nombre} hoy.\n\nNo se pueden hacer más ventas a este cliente.`,
                [{ text: 'Entendido', style: 'cancel' }]
            );
            return;
        }

        if (conteoVentas === 1 && !pedidoClienteSeleccionado) {
            Alert.alert(
                '⚠️ Cliente Ya Atendido',
                `Ya realizaste una venta a ${clienteSeleccionado.negocio || clienteSeleccionado.nombre} hoy.\n\n¿Deseas hacer una segunda venta?`,
                [
                    { text: 'Cancelar', style: 'cancel' },
                    { text: 'Continuar', onPress: procesarVenta }
                ]
            );
            return;
        }

        // Si no hay problema, procesar directamente
        procesarVenta();
    };

    // Confirmar y guardar venta
    const confirmarVenta = async (fechaSeleccionada, metodoPago, opcionesEnvio) => {

        if (!ventaTemporal) {
            console.log('❌ No hay ventaTemporal');
            return;
        }

        // 🆕 Evitar duplicación - Si ya está guardando, salir
        if (guardandoVentaRef.current) {
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
            metodo_pago: metodoPago || 'EFECTIVO',
            preciosPersonalizados: preciosPersonalizados // 🆕 Guardar precios especiales para auditoría
        };



        try {
            // 🆕 Marcar que está guardando
            guardandoVentaRef.current = true;
            console.log('💾 Guardando venta...');

            let ventaGuardada;

            if (pedidoClienteSeleccionado) {
                // 📦 LÓGICA DE ACTUALIZACIÓN DE PEDIDO Y NOVEDADES
                const novedades = [];
                // 1. Reconstruir detalles nuevos basados en el carrito (lo que realmente se entrega)
                Object.keys(carrito).forEach(id => {
                    const prod = productos.find(p => p.id == parseInt(id));
                    if (prod && carrito[id] > 0) {
                        detallesNuevos.push({
                            producto: prod.id,
                            cantidad: carrito[id],
                            precio_unitario: prod.precio
                        });
                    }
                });

                // 2. Calcular Novedades (Diferencias vs Original)
                if (pedidoClienteSeleccionado.detalles) {
                    pedidoClienteSeleccionado.detalles.forEach(detalleOriginal => {
                        const id = detalleOriginal.producto;
                        const cantidadNueva = carrito[id] || 0;

                        if (cantidadNueva < detalleOriginal.cantidad) {
                            novedades.push({
                                producto: detalleOriginal.producto_nombre,
                                cantidad: detalleOriginal.cantidad - cantidadNueva,
                                motivo: 'Devolución en entrega'
                            });
                        }
                    });
                }

                // 🆕 2.5 Formatear Vencidas y convertir fotos (si existen)
                const productosVencidosFormateados = (ventaConDatos.vencidas || []).map(item => ({
                    id: item.id,
                    producto: item.nombre,
                    cantidad: item.cantidad,
                    motivo: item.motivo || 'No especificado'
                }));

                let fotosVencidosBase64 = null;
                if (ventaConDatos.fotoVencidas) {
                    fotosVencidosBase64 = await convertirFotosABase64(ventaConDatos.fotoVencidas);
                }

                console.log('⚠️ Novedades detectadas:', novedades);
                if (productosVencidosFormateados.length > 0) {
                    console.log('🗑️ Vencidas detectadas en pedido:', productosVencidosFormateados.length);
                }

                // 3. Actualizar en Backend (NO BLOQUEANTE)
                const payloadPedido = {
                    estado: 'ENTREGADA',
                    total: ventaConDatos.total,
                    metodo_pago: ventaConDatos.metodo_pago,
                    detalles: detallesNuevos,
                    novedades: novedades,
                    productos_vencidos: productosVencidosFormateados,
                    foto_vencidos: fotosVencidosBase64,
                    fecha_entrega: fechaFormateada.split('T')[0],
                    _esPedido: true // 🆕 Flag para el sync loop
                };

                // Estrategia "Danza del Vendedor": Esperar 6s o liberar UI
                console.log('📦 Iniciando sincronización de pedido (Race 6s)...');
                
                // IIFE para sincronizar en background
                const sincronizarPedidoBackground = async () => {
                    try {
                        await actualizarPedido(pedidoClienteSeleccionado.id, payloadPedido);
                        console.log('✅ Pedido sincronizado correctamente en background');
                    } catch (pedErr) {
                        console.warn('⚠️ Falló sincronización inmediata de pedido, a cola de pendientes:', pedErr.message);
                        await agregarAColaPendientes(payloadPedido, pedidoClienteSeleccionado.id);
                        sincronizarPendientesAutomatico({ forzar: true }); // Gatillar reintento manual
                    }
                };

                // Correr la carrera
                await Promise.race([
                    sincronizarPedidoBackground(),
                    new Promise((resolve) => setTimeout(resolve, 6000)) // 6 segundos de cortesía
                ]);

                // 🆕 ACTUALIZAR LISTAS LOCALES INMEDIATAMENTE
                // Mover de Pendientes a Entregados para actualizar la UI (Badge Verde)
                setPedidosPendientes(prev => prev.filter(p => String(p.id) !== String(pedidoClienteSeleccionado.id)));

                // Recargar explícitamente la lista de pendientes para asegurar sincronización
                const fechaStr = fechaSeleccionada.toISOString().split('T')[0];
                verificarPedidosPendientes(fechaStr);

                // 🚀 Generar timestamp respetando el día seleccionado para el historial
                const ahora = new Date();
                const year = fechaSeleccionada.getFullYear();
                const month = String(fechaSeleccionada.getMonth() + 1).padStart(2, '0');
                const day = String(fechaSeleccionada.getDate()).padStart(2, '0');
                const hours = String(ahora.getHours()).padStart(2, '0');
                const minutes = String(ahora.getMinutes()).padStart(2, '0');
                const seconds = String(ahora.getSeconds()).padStart(2, '0');
                const fechaRegistro = `${year}-${month}-${day}T${hours}:${minutes}:${seconds}`;

                setPedidosEntregadosHoy(prev => [...prev, {
                    ...pedidoClienteSeleccionado,
                    destinatario: pedidoClienteSeleccionado.destinatario || clienteSeleccionado?.negocio || clienteSeleccionado?.nombre || 'Cliente', // 🆕 Asegurar destinatario para match visual
                    estado: 'ENTREGADA',
                    total: ventaConDatos.total,
                    detalles: detallesNuevos,
                    novedades: novedades,
                    fecha: fechaRegistro, // 🚀 Guardar respetando el día de la prueba
                    fecha_actualizacion: fechaRegistro
                }]);

                // Mock de respuesta para la UI
                ventaGuardada = {
                    ...ventaConDatos,
                    id: pedidoClienteSeleccionado.numero_pedido,
                    es_pedido: true
                };

            } else {
                // Venta Normal
                ventaGuardada = await guardarVenta(ventaConDatos);
            }

            console.log('✅ Proceso finalizado:', ventaGuardada.id);

            // 🆕 ACTUALIZAR STOCK EN TIEMPO REAL
            // IMPORTANTE: Solo afectar stock si es VENTA DIRECTA.
            // Los pedidos asignados ya tienen su stock reservado/descontado en el cargue inicial.
            if (!pedidoClienteSeleccionado) {
                // Bloquear refrescarStockSilencioso por 30s para evitar doble deducción:
                // el backend ya decrementó el stock, pero la venta local puede tardar unos
                // segundos en marcarse sincronizada=true — si el refresh corre en ese lapso,
                // reconciliarStockConVentasLocales la descuenta de nuevo.
                bloqueoRefreshStockHastaRef.current = Date.now() + 30 * 1000;

                // Ocultar número de stock por 1.5s (evita flash de 0 durante actualización)
                setStockOculto(true);
                setTimeout(() => setStockOculto(false), 1500);

                // Restar las cantidades vendidas del stock local
                const nuevoStock = { ...stockCargue };

                // 1. Restar productos vendidos
                (ventaConDatos.productos || []).forEach(item => {
                    const nombreProducto = (item.nombre || '').toUpperCase();
                    const cantidadVendida = item.cantidad || 0;

                    if (!nombreProducto || cantidadVendida <= 0) return;

                    const stockActual = nuevoStock[nombreProducto] || 0;
                    nuevoStock[nombreProducto] = Math.max(0, stockActual - cantidadVendida);
                    console.log(`📉 Vendido: ${nombreProducto}: ${stockActual} -> ${nuevoStock[nombreProducto]}`);
                });

                // Las vencidas YA fueron descontadas de stockCargue en handleGuardarVencidas
                // cuando el usuario las guardó en el modal. No descontar de nuevo aquí
                // o el stock quedaría con doble deducción offline.

                setStockCargue(nuevoStock);
            }

            // 🆕 Actualizar contador y agregar venta al estado inmediatamente
            // SOLO SI ES VENTA DE RUTA (NO PEDIDO) para evitar doble conteo en cierre
            if (!pedidoClienteSeleccionado) {
                setTotalVentasHoy(prev => prev + 1);
                setTotalDineroHoy(prev => prev + ventaConDatos.total);
            }

            // ✅ Agregar venta recién guardada al estado inmediatamente (sin esperar recarga)
            const ventaHistorialReciente = normalizarItemHistorialLocal({
                ...ventaGuardada,
                origen: 'RUTA',
                cliente_nombre: ventaConDatos.cliente_nombre,
                cliente_negocio: ventaConDatos.cliente_negocio,
                vendedor: vendedorNombre || userId,
                fecha: ventaConDatos.fecha,
                fecha_creacion: ventaConDatos.fecha,
                fecha_actualizacion: ventaConDatos.fecha,
                total: ventaConDatos.total,
                detalles: Array.isArray(ventaConDatos.productos) ? ventaConDatos.productos : [],
                productos: Array.isArray(ventaConDatos.productos) ? ventaConDatos.productos : [],
                subtotal: ventaConDatos.subtotal,
                descuento: ventaConDatos.descuento,
                vencidas: ventaConDatos.vencidas,
                productos_vencidos: ventaConDatos.productos_vencidos || ventaConDatos.vencidas || [],
                metodo_pago: metodoPago,
            });

            ultimaVentaHistorialRef.current = ventaHistorialReciente;
            setVentasDelDia(prev => [...prev, ventaHistorialReciente]);
            setHistorialResumenPreview(prev => fusionarVentaRecienteEnHistorial(prev, ventaHistorialReciente));
            setHistorialReimpresion(prev => prev.length > 0 ? fusionarVentaRecienteEnHistorial(prev, ventaHistorialReciente) : prev);

            // 🆕 UX: El avance de cliente se hará DESPUÉS de que interactúen con el modal de Imprimir.

            // Cerrar modal después de actualizar datos
            setMostrarResumen(false);

            // Actualizar contador de pendientes en segundo plano (no bloquea)
            verificarPendientes();

            // 🆕 LIMPIEZA CRÍTICA: Limpiar estado inmediatamente para evitar duplicados si el usuario tarda en cerrar el Alert
            // Guardamos copia para el ticket/alert
            const ventaParaTicket = {
                ...ventaHistorialReciente,
                id: ventaGuardada?.id ?? ventaHistorialReciente.id,
                consecutivo: ventaGuardada?.consecutivo ?? ventaHistorialReciente?.consecutivo,
                productos: Array.isArray(ventaHistorialReciente?.productos)
                    ? ventaHistorialReciente.productos
                    : (Array.isArray(ventaHistorialReciente?.detalles) ? ventaHistorialReciente.detalles : []),
                fecha: ventaHistorialReciente?.fecha_actualizacion || ventaHistorialReciente?.fecha_creacion || ventaHistorialReciente?.fecha,
            };

            // Limpiar estados reactivos que podrían causar reenvíos
            setVentaTemporal(null);
            // No limpiamos el carrito completamente aún si queremos imprimir, PERO
            // invalidamos la capacidad de reenviar la misma venta.
            // Mejor opción: Marcar como procesado.

            // Preparar opciones del alert
            const alertOptions = [
                {
                    text: 'Cerrar',
                    onPress: () => {
                        limpiarVenta();
                        continuarDespuesDeVentaGuardada({ limpiarAntes: false, mostrarAvisoFin: true });
                    },
                    style: 'cancel'
                }
            ];

            // Agregar opción de imprimir
            alertOptions.unshift({
                text: 'Imprimir',
                onPress: async () => {
                    // Limpiar carrito ANTES de imprimir para que el stock visual
                    // no muestre stockCargue - carrito (lo que causaba el flash de 0).
                    // La venta ya fue guardada — limpiar aquí es seguro.
                    limpiarVenta();
                    try {
                        await imprimirTicket(ventaParaTicket);
                        continuarDespuesDeVentaGuardada({ limpiarAntes: false, mostrarAvisoFin: true });
                    } catch (error) {
                        console.error('❌ Error al imprimir:', error);
                        Alert.alert(
                            '⚠️ Error de Impresión',
                            'No se pudo imprimir el ticket. Verifica que el Bluetooth esté conectado.\n\nLa venta ya fue guardada correctamente.',
                            [{ text: 'OK' }]
                        );
                        continuarDespuesDeVentaGuardada({ limpiarAntes: false, mostrarAvisoFin: true });
                    }
                }
            });

            // Agregar opción de WhatsApp si se proporcionó número
            if (opcionesEnvio?.whatsapp) {
                alertOptions.push({
                    text: 'WhatsApp',
                    onPress: () => {
                        enviarFacturaWhatsApp(ventaGuardada, opcionesEnvio.whatsapp, () => {
                            continuarDespuesDeVentaGuardada({ limpiarAntes: false, mostrarAvisoFin: true });
                        });
                    }
                });
            }

            // Agregar opción de Correo si se proporcionó
            if (opcionesEnvio?.correo || opcionesEnvio?.email) {
                alertOptions.push({
                    text: 'Correo',
                    onPress: () => {
                        enviarFacturaCorreo(ventaGuardada, opcionesEnvio.correo || opcionesEnvio.email, () => {
                            continuarDespuesDeVentaGuardada({ limpiarAntes: false, mostrarAvisoFin: true });
                        });
                    }
                });
            }

            // 🆕 Usar setTimeout para asegurar que el modal se cierre antes de lanzar el Alert
            setTimeout(() => {
                Alert.alert(
                    'Venta Completada',
                    `Venta guardada exitosamente\nTotal: ${formatearMoneda(ventaConDatos.total)}\nMétodo: ${metodoPago}`,
                    alertOptions
                );
            }, 500);
        } catch (error) {
            console.error('❌ Error en confirmarVenta:', error);
            Alert.alert('Error', 'No se pudo guardar la venta');
        } finally {
            // 🆕 Liberar el flag cuando termine (éxito o error)
            guardandoVentaRef.current = false;
            console.log('🔓 Venta procesada, flag liberado');
        }
    };

    // Enviar ticket PDF por WhatsApp (abre directamente al número)
    const enviarFacturaWhatsApp = async (venta, numero, onSuccessCallback = null) => {
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

            limpiarVenta(); // Solo limpiar si todo fue exitoso
            if (onSuccessCallback) onSuccessCallback();
        } catch (error) {
            console.error('Error al enviar por WhatsApp:', error);
            Alert.alert(
                '⚠️ Error al Enviar',
                'No se pudo generar el ticket para WhatsApp.\n\nLa venta ya fue guardada correctamente.',
                [{ text: 'OK' }]
            );
            // NO limpiar venta en caso de error
        }
    };

    // Enviar ticket por correo electrónico
    const enviarFacturaCorreo = async (venta, correo, onSuccessCallback = null) => {
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

            limpiarVenta(); // Solo limpiar si todo fue exitoso
            if (onSuccessCallback) onSuccessCallback();
        } catch (error) {
            console.error('Error al enviar por correo:', error);
            Alert.alert(
                '⚠️ Error al Enviar',
                'No se pudo enviar por correo electrónico.\n\nLa venta ya fue guardada correctamente.',
                [{ text: 'OK' }]
            );
            // NO limpiar venta en caso de error
        }
    };

    // Limpiar venta
    const limpiarVenta = () => {
        setCarrito({});
        setDescuento(0);
        setVencidas([]);
        setFotoVencidas(null);
        setVentaTemporal(null);
        setMostrarResumen(false);
        setNota('');
        setBusquedaProducto('');
        setPedidoClienteSeleccionado(null); // 🆕 Limpiar pedido del cliente
        setPreciosPersonalizados({}); // 🆕 Limpiar precios personalizados
        setModoEdicionPedido(false); // 🆕 Resetear modo edición
    };

    const esClientePedido = (cliente) => {
        if (!cliente) return false;

        const tipoNegocio = (cliente?.tipo_negocio || '').toString().toUpperCase();
        if (tipoNegocio.includes('PEDIDOS')) return true;

        const idCliente = String(cliente?.id || '');
        const norm = (s) => (s || '').toString().trim().toUpperCase();
        const negocio = norm(cliente?.negocio);
        const nombre = norm(cliente?.nombre);

        return (clientesOrdenDia || []).some((c) => {
            const cTipo = (c?.tipo_negocio || '').toString().toUpperCase();
            if (!cTipo.includes('PEDIDOS')) return false;

            if (idCliente && String(c?.id || '') === idCliente) return true;
            return norm(c?.negocio) === negocio || norm(c?.nombre) === nombre;
        });
    };

    const seleccionarClienteDirecto = async (cliente) => {
        if (!cliente) return;
        setClienteSeleccionadoEsPedido(esClientePedido(cliente));
        setClienteSeleccionado(cliente);
        guardarUltimoClienteSeleccionado(cliente);

        // 🆕 Consultar ventas backend del día sin bloquear (Fire-and-forget)
        if (fechaSeleccionada && userId) {
            (async () => {
                try {
                    const fechaStr = fechaSeleccionada.toISOString().split('T')[0];
                    const vendedorIdV = String(userId).toUpperCase().startsWith('ID')
                        ? String(userId).toUpperCase() : `ID${userId}`;
                    const resp = await fetch(`${API_URL}/api/ventas-ruta/?vendedor_id=${vendedorIdV}&fecha=${fechaStr}`);
                    if (resp.ok) {
                        const data = await resp.json();
                        if (Array.isArray(data)) setVentasBackendDia(data);
                    }
                } catch (e) { /* offline: usa solo locales */ }
            })();
        }

        setPreciosPersonalizados({});
        verificarPedidoCliente(cliente);
    };

    // Manejar selección de cliente
    const handleSeleccionarCliente = (cliente) => {
        // ✅ OPTIMIZACIÓN: Cerrar modal INMEDIATAMENTE para mejor UX
        setMostrarSelectorCliente(false);

        // Limpiar datos previos
        setCarrito({});
        setVencidas([]);
        setFotoVencidas(null);
        setNota('');
        setModoEdicionPedido(false); // 🆕 Resetear modo edición al cambiar cliente

        // 🆕 LÓGICA DE PRECIOS AUTOMÁTICA (Estilo "Cargar Pedido")
        const nuevosPrecios = {};
        // Soportar propiedad de ruta o general
        const listaCliente = cliente.lista_precio_nombre || cliente.tipo_lista_precio;

        if (listaCliente) {
            console.log(`🤑 Aplicando lista de precios: ${listaCliente}`);

            // Iterar PRODUCTOS (catálogo cargado) y buscar precio en lista
            productos.forEach(prod => {
                const nombreProd = prod.nombre.toUpperCase();
                let preciosAlt = preciosAlternosCargue[nombreProd];

                // Búsqueda robusta (si no encuentra exacto, busca parcial)
                if (!preciosAlt) {
                    const key = Object.keys(preciosAlternosCargue).find(k => k.includes(nombreProd) || nombreProd.includes(k));
                    if (key) preciosAlt = preciosAlternosCargue[key];
                }

                if (preciosAlt && preciosAlt[listaCliente]) {
                    nuevosPrecios[prod.id] = preciosAlt[listaCliente];
                }
            });

            // Si se encontraron precios, avisar o loguear
            if (Object.keys(nuevosPrecios).length > 0) {
                // Alert.alert("💲 Precios Actualizados", `Se aplicaron precios de lista "${listaCliente}" para ${Object.keys(nuevosPrecios).length} productos.`);
                console.log(`✅ Precios aplicados para ${Object.keys(nuevosPrecios).length} productos`);
            }
        }

        setPreciosPersonalizados(nuevosPrecios); // 🆕 Aplicar precios masivamente



        // Verificar cuántas ventas tiene hoy — máximo 2 por cliente
        const conteoVentasCliente = contarVentasActivasCliente(cliente);

        if (conteoVentasCliente >= 2) {
            Alert.alert(
                '🚫 Límite de Ventas',
                `Ya realizaste 2 ventas a ${cliente.negocio || cliente.nombre} hoy.\n\nNo se pueden hacer más ventas a este cliente.`,
                [{ text: 'Entendido', style: 'cancel' }]
            );
            return;
        }

        if (conteoVentasCliente === 1) {
            Alert.alert(
                '⚠️ Cliente Ya Atendido',
                `Ya realizaste una venta a ${cliente.negocio || cliente.nombre} el día de hoy.\n\n¿Deseas hacer una segunda venta?`,
                [
                    { text: 'Cancelar', style: 'cancel' },
                    { text: 'Continuar', onPress: () => seleccionarClienteDirecto(cliente) }
                ]
            );
            return;
        }

        seleccionarClienteDirecto(cliente);
    };

    const abrirClienteOcasionalRapido = useCallback(async () => {
        if (clienteSeleccionado && !clienteSeleccionado.esOcasional) {
            clienteAntesVentaRapidaRef.current = clienteSeleccionado;
        }

        const totalOcasionalesPrevias = (ventasDelDia || []).reduce((sum, v) => {
            const esOcasional = v.cliente_ocasional ||
                (v.cliente_negocio && String(v.cliente_negocio).toUpperCase().includes('(OCASIONAL)')) ||
                (v.nombre_negocio && String(v.nombre_negocio).toUpperCase().includes('(OCASIONAL)'));

            if (esOcasional && String(v.estado || '').toUpperCase() !== 'ANULADA') {
                return sum + (parseFloat(v.total) || 0);
            }
            return sum;
        }, 0);

        let topeVentaLimit = parseFloat(topeVentaRutaOcasional || 60000) || 60000;
        try {
            // Race: si la red tarda más de 2s, usar valores ya cargados en estado (offline-first)
            const fallbackInmediato = {
                rapida: flagVentaRapida,
                crear: flagCrearCliente,
                tope: topeVentaRutaOcasional,
            };
            const configRuta = await Promise.race([
                verificarFlagsRuta(),
                new Promise(resolve => setTimeout(() => resolve(fallbackInmediato), 2000)),
            ]);
            const ventaRapidaPermitida = configRuta?.rapida !== false;

            if (!ventaRapidaPermitida) {
                Alert.alert(
                    'No disponible',
                    'La venta rápida está deshabilitada para esta ruta.\n\nContacta al administrador.'
                );
                return;
            }

            if (configRuta?.tope) {
                topeVentaLimit = parseFloat(configRuta.tope) || topeVentaLimit;
            }
        } catch (e) {
            console.log('Error obteniendo tope de ruta, usando fallback:', e);
            if (flagVentaRapida === false) {
                Alert.alert(
                    'No disponible',
                    'La venta rápida está deshabilitada para este ID.\n\nContacta al administrador.'
                );
                return;
            }
            const ventaConTope = (ventasDelDia || []).find(v => v.cliente_ocasional && v.tope_venta);
            if (ventaConTope && ventaConTope.tope_venta) {
                topeVentaLimit = parseFloat(ventaConTope.tope_venta);
            }
        }

        if (totalOcasionalesPrevias >= topeVentaLimit) {
            Alert.alert(
                'Tope Diario Excedido ⛔',
                'Has superado el tope de ventas para clientes ocasionales.\n\nPor favor, contacta a un administrador.'
            );
            return;
        }

        setMostrarSelectorCliente(false);
        setMostrarModalOcasional(true);
    }, [ventasDelDia, userId, flagVentaRapida, clienteSeleccionado, topeVentaRutaOcasional, verificarFlagsRuta]);

    const avanzarAlSiguienteCliente = ({ limpiarAntes = false, mostrarAvisoFin = true } = {}) => {
        Keyboard.dismiss(); // 🔧 Fix teclado: cerrar antes de transición para evitar empuje visual (AI-CONTEXT)
        
        const lista = Array.isArray(clientesOrdenDia) ? clientesOrdenDia : [];

        if (lista.length === 0) {
            if (mostrarAvisoFin) {
                Alert.alert('Sin lista del día', 'Abre la lista de clientes para cargar el orden del día.');
            }
            return;
        }

        if (limpiarAntes) {
            limpiarVenta();
        }

        if (!clienteSeleccionado) {
            seleccionarClienteDirecto(lista[0]);
            return;
        }

        const idActual = String(clienteSeleccionado.id);
        let idx = lista.findIndex((c) => String(c.id) === idActual);

        if (idx < 0) {
            idx = lista.findIndex((c) => coincideCliente(c, clienteSeleccionado));
        }

        const siguiente = idx >= 0 ? lista[idx + 1] : lista[0];
        if (siguiente) {
            seleccionarClienteDirecto(siguiente);
            return;
        }

        // 🆕 Es el último cliente — mostrar alerta de ruta completada y ofrecer volver al inicio
        if (mostrarAvisoFin) {
            Alert.alert(
                '🎉 ¡Ruta completada!',
                `Has llegado al final de la lista del día.\n\n¿Deseas volver al primer cliente para un segundo recorrido?`,
                [
                    {
                        text: 'No, quedarme aquí',
                        style: 'cancel',
                    },
                    {
                        text: 'Volver al inicio',
                        onPress: () => {
                            if (limpiarAntes) limpiarVenta();
                            seleccionarClienteDirecto(lista[0]);
                        }
                    }
                ]
            );
        }
    };

    useEffect(() => {
        if (clienteSeleccionado) {
            setClienteSeleccionadoEsPedido(esClientePedido(clienteSeleccionado));
        } else {
            setClienteSeleccionadoEsPedido(false);
        }
    }, [clienteSeleccionado, clientesOrdenDia]);

    const continuarDespuesDeVentaGuardada = ({ limpiarAntes = false, mostrarAvisoFin = true } = {}) => {
        const clientePrevioRuta = clienteAntesVentaRapidaRef.current;
        const clienteActualEsOcasional = !!clienteSeleccionado?.esOcasional;

        if (limpiarAntes) {
            limpiarVenta();
        }

        if (clienteActualEsOcasional && clientePrevioRuta) {
            clienteAntesVentaRapidaRef.current = null;
            seleccionarClienteDirecto(clientePrevioRuta);
            return;
        }

        if (!clienteActualEsOcasional) {
            clienteAntesVentaRapidaRef.current = null;
        }

        avanzarAlSiguienteCliente({ limpiarAntes: false, mostrarAvisoFin });
    };

    useEffect(() => {
        const showSub = Keyboard.addListener('keyboardDidShow', (event) => {
            const focoCantidadPrincipal = tecladoDesdeCantidadPrincipalRef.current || indiceCantidadEnFocoRef.current !== null;
            const focoCantidadEdicion = indiceCantidadEdicionEnFocoRef.current !== null;
            const altura = event?.endCoordinates?.height || 0;

            if (focoCantidadPrincipal && esModoListaScroll) {
                setTecladoAbierto(false);
                setAlturaTeclado(0);
                setCompensacionBloqueSuperior(0);
                return;
            }

            // En pantalla principal NO tocar layout global.
            if (focoCantidadPrincipal || focoCantidadEdicion || modalEdicionVisible) {
                if (focoCantidadPrincipal) tecladoDesdeCantidadPrincipalRef.current = true;
                setTecladoAbierto(true);
                setAlturaTeclado(altura);
                setCompensacionBloqueSuperior(0);
            } else {
                setTecladoAbierto(false);
                setAlturaTeclado(0);
                // 🔧 DESACTIVADO: NO empujar nada en lista principal
                // if (focoCantidadPrincipal) {
                //     empujarSoloListaCantidad(indiceCantidadEnFocoRef.current, altura);
                //     actualizarCompensacionBloqueSuperior();
                //     iniciarCompensacionAnimada(760);
                // }
            }

            if (focoCantidadEdicion) {
                asegurarVisibilidadInputEdicion(
                    indiceCantidadEdicionEnFocoRef.current,
                    0,
                    true,
                    true
                );
            }
        });
        const hideSub = Keyboard.addListener('keyboardDidHide', () => {
            Keyboard.dismiss(); // 🚀 Forzar pérdida de foco de los inputs para que al tocarlos de nuevo se vuelva a abrir el teclado nativo
            cancelarCompensacionAnimada();
            setTecladoAbierto(false);
            setAlturaTeclado(0);
            setForzarMostrarTurno(false); // Resetear vistazo al cerrar teclado
            tecladoDesdeCantidadPrincipalRef.current = false;
            setCompensacionBloqueSuperior(0);
            indiceCantidadEnFocoRef.current = null;
            setIndiceCantidadActivo(null);
            indiceCantidadEdicionEnFocoRef.current = null;
            refrescarBaseBloqueSuperior();
        });
        return () => {
            cancelarCompensacionAnimada();
            showSub.remove();
            hideSub.remove();
        };
    }, [
        asegurarVisibilidadInputEdicion,
        empujarSoloListaCantidad,
        actualizarCompensacionBloqueSuperior,
        iniciarCompensacionAnimada,
        cancelarCompensacionAnimada,
        refrescarBaseBloqueSuperior,
        modalEdicionVisible,
        esModoListaScroll,
        asegurarVisibilidadInputCantidad
    ]);

    // Cargar orden del día en segundo plano para que el auto-siguiente funcione sin abrir selector
    useEffect(() => {
        const cargarOrdenDiaSilencioso = async () => {
            try {
                if (!turnoAbierto || !diaSeleccionado || !userId) return;

                const dia = diaSeleccionado.toUpperCase();
                const response = await fetch(`${API_URL}/api/clientes-ruta/?vendedor_id=${userId}&dia=${dia}`);
                if (!response.ok) return;

                const data = await response.json();
                if (!Array.isArray(data)) return;

                const clientesFormateados = data.map((c) => ({
                    id: c.id?.toString?.() || String(c.id),
                    nombre: c.nombre_contacto || c.nombre_negocio,
                    negocio: c.nombre_negocio,
                    tipo_negocio: c.tipo_negocio || '',
                }));

                setClientesOrdenDia(clientesFormateados);
            } catch (error) {
                // Silencioso: no bloquea venta
            }
        };

        cargarOrdenDiaSilencioso();
    }, [turnoAbierto, diaSeleccionado, userId, esModoListaScroll]);

    // 🆕 Verificar si el cliente tiene pedido pendiente
    const verificarPedidoCliente = (cliente) => {
        const pedidoPreferido = cliente?.__pedidoVista || null;
        let pedidosCliente;
        if (pedidoPreferido) {
            pedidosCliente = [pedidoPreferido];
        } else {
            // Buscar por coincideCliente Y también por nombre/negocio vs destinatario
            // (cubre el caso de la flecha ⏭️ donde coincideCliente puede fallar por IDs no comparables)
            const normT = (s) => (s || '').toString().trim().toUpperCase();
            const negocioCliente = normT(cliente?.negocio);
            const nombreCliente = normT(cliente?.nombre);
            
            // 🔧 Unir arreglos: si el pedido ya fue entregado, debe recuperarse al navegar con flechas
            const todosLosPedidos = [...pedidosPendientes, ...(pedidosEntregadosHoy || [])];
            
            pedidosCliente = todosLosPedidos.filter((pedido) => {
                if (coincideCliente(cliente, pedido)) return true;
                const dest = normT(pedido?.destinatario);
                return dest && (dest === negocioCliente || dest === nombreCliente);
            });
        }

        const obtenerPuntajePedido = (pedido) => {
            const estado = (pedido?.estado || '').toString().toUpperCase();
            const prioridadEstado = estado === 'ANULADA' ? 0 : 1; // Preferir pedidos realmente pendientes
            const numeroPedido = parseInt(String(pedido?.numero_pedido || '').replace(/\D/g, ''), 10);
            const numeroNormalizado = Number.isFinite(numeroPedido) ? numeroPedido : 0;
            const fecha = new Date(pedido?.fecha_actualizacion || pedido?.fecha || 0).getTime() || 0;
            const id = Number(pedido?.id) || 0;
            return { prioridadEstado, numeroNormalizado, fecha, id };
        };

        const pedido = pedidosCliente
            .slice()
            .sort((a, b) => {
                const pa = obtenerPuntajePedido(a);
                const pb = obtenerPuntajePedido(b);

                if (pb.prioridadEstado !== pa.prioridadEstado) return pb.prioridadEstado - pa.prioridadEstado;
                if (pb.numeroNormalizado !== pa.numeroNormalizado) return pb.numeroNormalizado - pa.numeroNormalizado;
                if (pb.fecha !== pa.fecha) return pb.fecha - pa.fecha;
                return pb.id - pa.id;
            })[0] || null;

        setPedidoClienteSeleccionado(pedido);

        // 🆕 Si hay pedido y el cliente no tiene dirección, usar la del pedido
        if (pedido && pedido.direccion_entrega && !cliente.direccion) {
            setClienteSeleccionado({
                ...cliente,
                direccion: pedido.direccion_entrega
            });
        }

        console.log('🔍 Pedido del cliente:', pedido ? `#${pedido.numero_pedido}` : 'Sin pedido');
    };

    useEffect(() => {
        if (!clienteSeleccionado) return;
        verificarPedidoCliente(clienteSeleccionado);
    }, [pedidosPendientes, clienteSeleccionado]);

    // 🆕 Editar pedido del cliente seleccionado (cargar en carrito)
    const editarPedidoClienteSeleccionado = () => {
        if (!pedidoClienteSeleccionado) return;

        // 🛡️ Guard de seguridad: EVITAR editar un pedido ya entregado
        const esEntregado = ['ENTREGADO', 'ENTREGADA'].includes((pedidoClienteSeleccionado.estado || '').toUpperCase());
        if (esEntregado) {
            Alert.alert('📦 Ya Entregado', 'Este pedido ya ha sido entregado y no puede editarse.');
            return;
        }

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

        // 🆕 Cargar precios personalizados del pedido original
        const nuevosPrecios = {};
        pedidoClienteSeleccionado.detalles.forEach(d => {
            // Buscar el producto localmente para obtener SU ID real usado en la App
            const prodReal = productos.find(p => p.id === d.producto || p.nombre === d.producto_nombre);
            const precioUnitario = parseFloat(d.precio_unitario);

            if (prodReal && !isNaN(precioUnitario)) {
                // Usar el ID del producto LOCAL como clave, igual que el carrito
                nuevosPrecios[prodReal.id] = precioUnitario;
                console.log(`💲 Precio personalizado para ${prodReal.nombre}: ${precioUnitario}`);
            }
        });
        setPreciosPersonalizados(nuevosPrecios);

        // 🆕 Activar modo edición para permitir cambiar cantidades
        setModoEdicionPedido(true);

        Alert.alert(
            '✏️ Pedido Cargado',
            `Se cargaron ${encontrados} productos del pedido.\n\nPuedes modificar las cantidades y completar la venta.`
        );
    };

    // 🆕 Marcar pedido del cliente seleccionado como entregado
    const marcarEntregadoClienteSeleccionado = () => {
        if (!pedidoClienteSeleccionado) return;

        // 🛡️ Guard de seguridad: EVITAR re-entregar un pedido ya cerrado
        const esEntregado = ['ENTREGADO', 'ENTREGADA'].includes((pedidoClienteSeleccionado.estado || '').toUpperCase());
        if (esEntregado) {
            Alert.alert('📦 Ya Entregado', 'Este pedido ya fue marcado como entregado hoy.');
            return;
        }

        if (!pedidoClienteSeleccionado) return;
        // 🔧 Normalizar detalles: el backend puede devolver 'detalles' o 'detalles_info'
        const detallesNormalizados = Array.isArray(pedidoClienteSeleccionado.detalles) && pedidoClienteSeleccionado.detalles.length > 0
            ? pedidoClienteSeleccionado.detalles
            : Array.isArray(pedidoClienteSeleccionado.detalles_info) && pedidoClienteSeleccionado.detalles_info.length > 0
                ? pedidoClienteSeleccionado.detalles_info
                : [];
        marcarPedidoEntregado({
            ...pedidoClienteSeleccionado,
            detalles: detallesNormalizados
        });
    };



    // Manejar cliente guardado
    const handleClienteGuardado = async (nuevoCliente) => {
        setClienteSeleccionado(nuevoCliente);
        // 🆕 LIMPIAR precios personalizados al cambiar cliente para que se apliquen los de la lista
        setPreciosPersonalizados({});
        // Recargar lista de clientes
        const clientesData = await obtenerClientes();
        setClientes(clientesData);

        // Invalidar caché de selector para forzar datos frescos al abrir
        try {
            const dia = (diaSeleccionado || '').toUpperCase();
            await AsyncStorage.multiRemove([
                `clientes_cache_${userId}`,
                `clientes_cache_todos_${userId}`,
                `clientes_cache_dia_${userId}_${dia}`
            ]);
        } catch (error) {
            // No crítico
        }

        setRefreshClientesToken((prev) => prev + 1);
    };

    // Manejar vencidas
    const handleGuardarVencidas = (productosVencidos, foto) => {
        // 🆕 Calcular diferencia con vencidas anteriores para ajustar stock correctamente
        const vencidasAnteriores = vencidas || [];
        
        setVencidas(productosVencidos);
        setFotoVencidas(foto);

        // 🆕 Ajustar stock localmente cuando se agregan/modifican productos vencidos
        setStockCargue(prevStock => {
            const nuevoStock = { ...prevStock };
            
            // 1. Restaurar stock de vencidas anteriores (si las había)
            vencidasAnteriores.forEach(item => {
                const nombreProducto = (item.nombre || '').toUpperCase().trim();
                const cantidadAnterior = parseInt(item.cantidad || 0, 10);
                
                if (!nombreProducto || cantidadAnterior <= 0) return;
                
                const stockActual = parseInt(nuevoStock[nombreProducto] || 0, 10);
                nuevoStock[nombreProducto] = stockActual + cantidadAnterior;
                
                console.log(`↩️ Restaurando vencido anterior: ${nombreProducto}: ${stockActual} -> ${nuevoStock[nombreProducto]}`);
            });
            
            // 2. Descontar nuevas vencidas
            (productosVencidos || []).forEach(item => {
                const nombreProducto = (item.nombre || '').toUpperCase().trim();
                const cantidadVencida = parseInt(item.cantidad || 0, 10);
                
                if (!nombreProducto || cantidadVencida <= 0) return;
                
                const stockActual = parseInt(nuevoStock[nombreProducto] || 0, 10);
                nuevoStock[nombreProducto] = Math.max(0, stockActual - cantidadVencida);
                
                console.log(`🗑️ Vencido agregado: ${nombreProducto}: ${stockActual} -> ${nuevoStock[nombreProducto]}`);
            });
            
            return nuevoStock;
        });
    };

    const describirVentaEnRevision = useCallback((ventaRevision) => {
        const data = ventaRevision?.data || {};
        const cliente = data?.cliente_negocio || data?.nombre_negocio || data?.cliente_nombre || 'Cliente sin nombre';
        const total = parseFloat(data?.total || 0) || 0;
        const motivo = String(ventaRevision?.motivo_error || 'Error permanente de sincronización');
        const idLocal = String(ventaRevision?.id || data?.id_local || data?.id || '').trim();

        return {
            idLocal,
            cliente,
            total,
            motivo,
        };
    }, []);

    const abrirRevisionVentasPendientes = useCallback(async () => {
        try {
            const ventasRevision = await obtenerVentasEnRevision();

            if (!ventasRevision.length) {
                Alert.alert('Sin revisión', 'No hay ventas en revisión en este momento.');
                await verificarPendientes();
                return;
            }

            const ventaRevision = ventasRevision[0];
            const { idLocal, cliente, total, motivo } = describirVentaEnRevision(ventaRevision);

            Alert.alert(
                'Venta en revisión',
                `Cliente: ${cliente}
Total: ${formatearMoneda(total)}
ID local: ${idLocal || 'N/D'}

Motivo:
${motivo}

Si fue una prueba, puedes descartarla para desbloquear el cierre del turno.`,
                [
                    { text: 'Cerrar', style: 'cancel' },
                    {
                        text: 'Descartar prueba',
                        style: 'destructive',
                        onPress: async () => {
                            try {
                                await descartarVentaEnRevision(idLocal);
                                await verificarPendientes();
                                await cargarVentasDelDia(fechaSeleccionada);
                                await cargarStockCargue(diaSeleccionado, fechaSeleccionada);
                                Alert.alert('Revisión eliminada', 'La venta de prueba se quitó de la cola local y se recargó el stock.');
                            } catch (error) {
                                console.error('Error descartando venta en revisión:', error);
                                Alert.alert('Error', 'No se pudo descartar la venta en revisión.');
                            }
                        }
                    }
                ]
            );
        } catch (error) {
            console.error('Error consultando ventas en revisión:', error);
            Alert.alert('Error', 'No se pudo consultar la venta en revisión.');
        }
    }, [describirVentaEnRevision, fechaSeleccionada, diaSeleccionado]);

    // 🆕 Manejar cerrar turno
    const handleCerrarTurno = async () => {
        try {
            // 🔒 Seguridad operativa: no cerrar turno con ventas offline pendientes
            const pendientesActuales = await obtenerVentasPendientes();
            const pendientesSync = contarPendientesSincronizables(pendientesActuales);
            const pendientesRevision = contarPendientesEnRevision(pendientesActuales);
            if (pendientesActuales.length > 0) {
                const mensajePendientes = pendientesSync > 0
                    ? `Tienes ${pendientesSync} venta${pendientesSync > 1 ? 's' : ''} sin enviar.`
                    : 'No hay ventas pendientes de reintento automático.';
                const mensajeRevision = pendientesRevision > 0
                    ? `

Ademas, hay ${pendientesRevision} venta${pendientesRevision > 1 ? 's' : ''} en revision por error permanente y debes validarla${pendientesRevision > 1 ? 's' : ''} manualmente.`
                    : '';
                const accionesPendientes = [
                    { text: 'Cancelar', style: 'cancel' },
                ];

                if (pendientesRevision > 0) {
                    accionesPendientes.push({
                        text: 'Ver revisión',
                        onPress: () => abrirRevisionVentasPendientes()
                    });
                }

                accionesPendientes.push({
                    text: 'Sincronizar ahora',
                    onPress: () => onRefresh()
                });

                Alert.alert(
                    'Sincronización pendiente',
                    `${mensajePendientes}${mensajeRevision}

Sincroniza o revisa antes de cerrar turno para no descuadrar inventario y reportes.`,
                    accionesPendientes
                );
                return;
            }

            // Usar métodos locales para evitar que UTC desplace la fecha al día siguiente
            const _y = fechaSeleccionada.getFullYear();
            const _m = String(fechaSeleccionada.getMonth() + 1).padStart(2, '0');
            const _d = String(fechaSeleccionada.getDate()).padStart(2, '0');
            const fechaFormateada = `${_y}-${_m}-${_d}`;

            console.log(`🔒 CERRAR TURNO - Fecha: ${fechaFormateada}, Vendedor: ${userId}`);
            console.log(`   Vencidas a reportar:`, vencidas);

            // Preparar productos vencidos en formato correcto
            const productosVencidosFormateados = vencidas.map(item => ({
                producto: item.nombre,
                cantidad: item.cantidad
            }));

            console.log(`   Productos formateados:`, productosVencidosFormateados);

            // Procesar cierre directamente (el modal ya sirvió como confirmación)
            await procesarCierreTurno(fechaFormateada, productosVencidosFormateados);

        } catch (error) {
            console.error('Error:', error);
            Alert.alert('Error', 'Ocurrió un error inesperado');
        }
    };

    // Función para procesar el cierre de turno
    const procesarCierreTurno = async (fecha, vencidos) => {
        try {
            console.log(`📤 Enviando a ${ENDPOINTS.CERRAR_TURNO}`);

            // 🆕 Timeout de 30 segundos (cierre puede tardar por cálculos)
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 30000);

            const response = await fetch(ENDPOINTS.CERRAR_TURNO, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    id_vendedor: userId,
                    fecha: fecha,
                    productos_vencidos: vencidos,
                    diferencia_precios: diferenciaPrecios
                }),
                signal: controller.signal
            });
            clearTimeout(timeoutId);

            const data = await response.json();
            console.log(`📥 Respuesta:`, data);
            if (data.success) {
                // Mostrar resumen en el mismo orden visual del catalogo de la app.
                const ordenProductosResumen = new Map(
                    productos.map((producto, index) => [normalizarTexto(producto?.nombre), index])
                );

                const resumenOrdenado = [...(data.resumen || [])].sort((a, b) => {
                    const indiceA = ordenProductosResumen.get(normalizarTexto(a?.producto));
                    const indiceB = ordenProductosResumen.get(normalizarTexto(b?.producto));

                    if (indiceA === undefined && indiceB === undefined) {
                        return String(a?.producto || '').localeCompare(String(b?.producto || ''), 'es', { sensitivity: 'base' });
                    }
                    if (indiceA === undefined) return 1;
                    if (indiceB === undefined) return -1;
                    return indiceA - indiceB;
                });

                const resumenTexto = resumenOrdenado.map(item =>
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
                    (data.novedad ? `${data.novedad}\n\n` : '') +
                    `✅ Datos enviados al CRM`,
                    [
                        {
                            text: 'Volver al Menú',
                            onPress: async () => {
                                // 🆕 Guardar novedad en localStorage para que el frontend la muestre
                                if (data.novedad) {
                                    const fechaStr = fecha.split('T')[0];
                                    const novedadKey = `novedad_precios_${userId}_${fechaStr}`;
                                    AsyncStorage.setItem(novedadKey, data.novedad);
                                    console.log(`💾 Novedad guardada: ${novedadKey}`);
                                }

                                // Limpiar todo el estado
                                setTotalVentasHoy(0);
                                setTotalDineroHoy(0);
                                setDiferenciaPrecios(0);
                                setVencidas([]);
                                setMostrarModalCerrarTurno(false);
                                setTurnoAbierto(false);
                                setHoraTurno(null);
                                setStockCargue({});
                                await limpiarVentasLocales();
                                await AsyncStorage.removeItem(`@turno_activo_${userId}`); // 🆕 Limpiar turno offline
                                await limpiarUltimoClienteSeleccionado(fecha);

                                // Redirigir al menú principal
                                navigation.navigate('Options', { userId, vendedorNombre });
                            }
                        }
                    ]
                );
            } else if (data.error === 'TURNO_YA_CERRADO') {
                // 🆕 Turno ya fue cerrado anteriormente
                Alert.alert(
                    '⚠️ Turno Ya Cerrado',
                    'El turno para este día ya fue cerrado anteriormente.\n\nNo se pueden enviar devoluciones duplicadas.',
                    [{
                        text: 'OK',
                        onPress: () => {
                            setMostrarModalCerrarTurno(false);
                            setTurnoAbierto(false);
                            setHoraTurno(null);
                            setStockCargue({});
                            AsyncStorage.removeItem(`@turno_activo_${userId}`); // 🆕 Limpiar turno offline
                            limpiarUltimoClienteSeleccionado(fechaSeleccionada);
                            navigation.navigate('Options', { userId, vendedorNombre });
                        }
                    }]
                );
            } else {
                Alert.alert('Error', data.error || 'No se pudo cerrar el turno');
            }
        } catch (error) {
            console.error('Error cerrando turno:', error);
            Alert.alert('Error', 'No se pudo conectar con el servidor');
        }
    };


    const renderProducto = useCallback(({ item, index }) => {
        const cantidad = getCantidad(item.id);
        const precioReal = getPrecioProducto(item); // 🆕 Usar precio dinámico
        const subtotalProducto = precioReal * cantidad;

        // Stock disponible = stock del cargue - lo que ya está en carrito (actualización inmediata sin red)
        const stockBase = stockCargue[item.nombre.toUpperCase()] || 0;
        const stock = Math.max(0, stockBase - cantidad);

        // Verificar si es un precio especial
        const esPrecioEspecial = precioReal !== item.precio;

        // 🛡️ Deshabilitar si no hay cliente seleccionado
        const sinCliente = !clienteSeleccionado || clienteSeleccionado.id === 'general';

        // 🆕 Deshabilitar si hay pedido pendiente Y NO está en modo edición
        const pedidoBloqueado = pedidoClienteSeleccionado && !modoEdicionPedido;

        // Deshabilitar controles si no hay cliente O si el pedido está bloqueado
        const controlesDeshabilitados = sinCliente || pedidoBloqueado;

        return (
            <View style={styles.productoItem}>
                <View style={styles.productoInfo}>
                    <Text style={styles.productoNombre}>{item.nombre}</Text>
                    <Text style={styles.productoPrecio}>
                        Precio: {formatearMoneda(precioReal)}
                        {esPrecioEspecial && <Text style={{ color: '#ff9800', fontWeight: 'bold' }}> ⭐</Text>}
                        {stockOculto
                            ? <ActivityIndicator size="small" color="#1d4ed8" style={{ marginLeft: 8 }} />
                            : <Text style={[styles.stockTextoInline, stock <= 0 && styles.stockTextoAgotado]}>{`  Stock: ${stock}`}</Text>
                        }
                    </Text>
                </View>

                <View style={styles.cantidadControl}>
                    <Pressable
                        style={({ pressed }) => [
                            styles.btnCantidad,
                            pressed && { opacity: 0.6 }
                        ]}
                        onPress={() => actualizarCantidad(item.id, cantidad - 1)}
                        disabled={cantidad === 0 || controlesDeshabilitados}
                        android_ripple={{ color: 'rgba(255,255,255,0.3)' }}
                    >
                        <Ionicons name="remove" size={20} color="white" />
                    </Pressable>

                    {controlesDeshabilitados ? (
                        <View style={[styles.inputCantidad, { justifyContent: 'center', alignItems: 'center' }]}>
                            <Text style={{ fontSize: 16, fontWeight: 'bold', color: '#333' }}>{cantidad}</Text>
                        </View>
                    ) : (
                        <TextInput
                            style={styles.inputCantidad}
                            value={String(cantidad)}
                            onPressIn={() => {
                                if (!esModoListaScroll) {
                                    preAjusteListaAntesDeTecladoCantidad(index);
                                }
                                tecladoDesdeCantidadPrincipalRef.current = true;
                                indiceCantidadEnFocoRef.current = index;
                                setIndiceCantidadActivo(index);
                                if (!esModoListaScroll) {
                                    setTecladoAbierto(true); // 🚀 Ocultar cabeceras instantáneamente sin esperar al teclado nativo
                                }
                            }}
                            onChangeText={(texto) => {
                                const num = parseInt(texto) || 0;
                                actualizarCantidad(item.id, num);
                            }}
                            keyboardType="numeric"
                            selectTextOnFocus
                            onFocus={() => {
                                indiceCantidadEnFocoRef.current = index;
                                setIndiceCantidadActivo(index);
                                if (!esModoListaScroll) {
                                    setTecladoAbierto(true); // 🚀 Refuerzo visual inmediato
                                }
                                // En modo scroll, dejar el posicionamiento manual del vendedor y solo aplicar un nudge suave al abrir teclado.
                            }}
                            onBlur={() => {
                                tecladoDesdeCantidadPrincipalRef.current = false;
                                indiceCantidadEnFocoRef.current = null;
                            }}
                        />
                    )}

                    <Pressable
                        style={({ pressed }) => [
                            styles.btnCantidad,
                            pressed && { opacity: 0.6 }
                        ]}
                        onPress={() => actualizarCantidad(item.id, cantidad + 1)}
                        disabled={controlesDeshabilitados}
                        android_ripple={{ color: 'rgba(255,255,255,0.3)' }}
                    >
                        <Ionicons name="add" size={20} color="white" />
                    </Pressable>
                </View>
            </View>
        );
    }, [carrito, stockCargue, stockOculto, clienteSeleccionado, pedidoClienteSeleccionado, modoEdicionPedido, tecladoAbierto, productosFiltrados.length, actualizarCantidad, asegurarVisibilidadInputCantidad, preAjusteListaAntesDeTecladoCantidad, esModoListaScroll]);

    // 🆕 Handler para cuando se guarda una nota
    const handleNotaGuardada = async (nota) => {
        // Actualizar cliente seleccionado localmente
        if (clienteSeleccionado) {
            setClienteSeleccionado({
                ...clienteSeleccionado,
                nota: nota
            });
        }

        // Recargar lista completa de clientes para mantener consistencia
        // (Esto asegura que si cambias de cliente y vuelves, la nota persista)
        const clientesData = await obtenerClientes();
        setClientes(clientesData);
    };

    return (
        <View style={styles.container}>
            {/* Modal rápido de confirmación de sincronización offline */}
            <Modal
                visible={mostrarModalSyncRapido}
                transparent={true}
                animationType="fade"
                onRequestClose={() => setMostrarModalSyncRapido(false)}
            >
                <View style={styles.modalSyncOverlay}>
                    <View style={styles.modalSyncCard}>
                        <Ionicons name="cloud-done-outline" size={18} color="#0b8043" />
                        <Text style={styles.modalSyncTexto}>{textoModalSyncRapido}</Text>
                    </View>
                </View>
            </Modal>

            {/* 🆕 Banner de conectividad — mantener visible para evitar desplazamientos del header al abrir teclado */}
            {(!clienteSeleccionado || forzarMostrarTurno) && (
                <>
                    {estadoBanner === 'offline' && (
                        <View style={styles.bannerOffline}>
                            <Ionicons name="cloud-offline-outline" size={16} color="#fff" />
                            <Text style={styles.bannerTexto}>Sin internet — ventas se guardan localmente</Text>
                        </View>
                    )}
                    {estadoBanner === 'sincronizando' && (
                        <View style={styles.bannerSincronizando}>
                            <Ionicons name="sync-outline" size={16} color="#fff" />
                            <Text style={styles.bannerTexto}>Sincronizando ventas pendientes...</Text>
                        </View>
                    )}
                    {estadoBanner === 'exito' && (
                        <View style={styles.bannerExito}>
                            <Ionicons name="checkmark-circle-outline" size={16} color="#fff" />
                            <Text style={styles.bannerTexto}>{ventasSincronizadas} {ventasSincronizadas === 1 ? 'venta enviada' : 'ventas enviadas'} ✅</Text>
                        </View>
                    )}
                </>
            )}

            {clienteSeleccionado && estadoBanner && !(estadoBanner === 'offline' && ventasPendientes > 0) && (
                <View style={[
                    styles.bannerCompacto,
                    estadoBanner === 'offline' && styles.bannerCompactoOffline,
                    estadoBanner === 'sincronizando' && styles.bannerCompactoSincronizando,
                    estadoBanner === 'exito' && styles.bannerCompactoExito,
                ]}>
                    <Ionicons
                        name={
                            estadoBanner === 'offline'
                                ? 'cloud-offline-outline'
                                : estadoBanner === 'sincronizando'
                                    ? 'sync-outline'
                                    : 'checkmark-circle-outline'
                        }
                        size={14}
                        color="#fff"
                    />
                    <Text style={styles.bannerCompactoTexto}>
                        {estadoBanner === 'offline'
                            ? 'Sin internet'
                            : estadoBanner === 'sincronizando'
                                ? 'Sincronizando...'
                                : `${ventasSincronizadas} ${ventasSincronizadas === 1 ? 'venta enviada' : 'ventas enviadas'}`}
                    </Text>
                </View>
            )}

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

            {/* 🆕 Indicador de Turno - Optimizado: Si hay cliente, se oculta tras la manija por defecto para ganar espacio total */}
            {(turnoAbierto && (forzarMostrarTurno || (!clienteSeleccionado && !tecladoAbierto && !inputBuscadorEnFoco))) && (
                <View style={[styles.turnoIndicador, forzarMostrarTurno && styles.turnoIndicadorForzado]}>
                    <View style={styles.turnoIndicadorContent}>
                        <View style={styles.puntoVerde} />
                        <Text style={styles.turnoTexto}>
                            T.A. {horaTurno ? `• ${horaTurno.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' })}` : ''}
                        </Text>
                    </View>
                    <View style={styles.turnoAcciones}>
                        <Text style={styles.turnoDia}>
                            {diaSeleccionado?.substring(0, 3)} • {fechaSeleccionada?.toLocaleDateString('es-ES', { day: 'numeric', month: 'short' })}
                        </Text>
                        <TouchableOpacity
                            onPress={() => {
                                setTurnoAbierto(false);
                                setMostrarSelectorDia(true);
                                setForzarMostrarTurno(false);
                            }}
                            style={styles.turnoAccionBtn}
                            hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
                        >
                            <Ionicons name="calendar-outline" size={16} color="#003d88" />
                        </TouchableOpacity>

                        <TouchableOpacity
                            onPress={abrirHistorialReimpresion}
                            style={styles.turnoAccionBtn}
                            hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
                        >
                            <Ionicons name="receipt-outline" size={16} color="#003d88" />
                        </TouchableOpacity>

                        <TouchableOpacity
                            onPress={abrirClienteOcasionalRapido}
                            style={[
                                styles.turnoAccionBtn,
                                !flagVentaRapida && { opacity: 0.35 }
                            ]}
                            hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
                        >
                            <Ionicons name="flash-outline" size={16} color="#f59e0b" />
                        </TouchableOpacity>

                        {forzarMostrarTurno && (
                            <TouchableOpacity
                                onPress={() => setForzarMostrarTurno(false)}
                                style={[styles.turnoAccionBtn, styles.turnoAccionCerrar]}
                                hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
                            >
                                <Ionicons name="close-circle-outline" size={18} color="#f44336" />
                            </TouchableOpacity>
                        )}
                    </View>
                </View>
            )}

            {/* 🆕 Pestaña (Manija) para revelar turno - Aparece cuando hay cliente y el turno está oculto */}
            {turnoAbierto && clienteSeleccionado && !forzarMostrarTurno && (
                <TouchableOpacity
                    style={styles.manijaRevelarTurno}
                    onPress={() => setForzarMostrarTurno(true)}
                    activeOpacity={0.5}
                >
                    <View style={styles.manijaIndicador} />
                </TouchableOpacity>
            )}

            {!turnoAbierto && !mostrarSelectorDia && !verificandoTurno && !tecladoAbierto && !inputBuscadorEnFoco && (
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

            <View
                ref={bloqueSuperiorRef}
                collapsable={false}
                onLayout={() => {
                    refrescarBaseBloqueSuperior();
                }}
            >
                {/* Header - Cliente - Visible si no hay teclado (salvo si el foco está en la búsqueda o hay filtro activo) */}
                {(!tecladoAbierto || inputBuscadorEnFoco || busquedaProducto.length > 0) && (
                    <View style={styles.headerCliente}>
                        <View
                            style={[
                                styles.clienteSelector,
                                clienteSeleccionado && clienteSeleccionadoConPedidoEntregado ? {
                                    backgroundColor: 'rgba(34, 197, 94, 0.1)',
                                    borderColor: '#22c55e'
                                } : null
                            ]}
                        >
                            {/* 🆕 Badges flotantes en la esquina del header (como en el Selector) */}
                            {clienteSeleccionado && clienteSeleccionadoConPedidoEntregado && (
                                <View style={styles.badgeEntregadoCliente}>
                                    <Text style={styles.badgeEntregadoTexto}>Entregado</Text>
                                </View>
                            )}
                            {clienteSeleccionado && !clienteSeleccionadoConPedidoEntregado && pedidoClienteSeleccionado && (
                                <View style={styles.badgePendienteCliente}>
                                    <Text style={styles.badgePendienteTexto}>Pendiente</Text>
                                </View>
                            )}
                            <TouchableOpacity
                                style={{ flex: 1, flexDirection: 'row', alignItems: 'center' }}
                                onPress={abrirSelectorCliente}
                            >
                                {clienteSeleccionado?.esOcasional ? (
                                    <View style={[styles.badgeTipoHeaderRuta, { backgroundColor: '#fef3c7', borderColor: '#f59e0b' }]}><Text style={[styles.badgeTipoHeaderTexto, { color: '#d97706' }]}>O</Text></View>
                                ) : clienteSeleccionadoEsPedido ? (
                                    <View style={styles.badgeTipoHeaderPedido}><Text style={styles.badgeTipoHeaderTexto}>P</Text></View>
                                ) : (
                                    <View style={styles.badgeTipoHeaderRuta}><Text style={styles.badgeTipoHeaderTexto}>R</Text></View>
                                )}
                                <View style={styles.clienteInfo}>
                                    <Text style={[styles.clienteNombre, (clienteSeleccionado?.negocio || '').length > 34 && styles.clienteNombreMedio]}>
                                        {clienteSeleccionado?.negocio || 'Seleccionar Cliente'}
                                    </Text>
                                    {/* Mostrar detalles siempre */}
                                    {clienteSeleccionado && (
                                        <>
                                            {clienteSeleccionado?.nombre && <Text style={styles.clienteDetalle}>👤 {clienteSeleccionado.nombre}</Text>}
                                            <Text style={styles.clienteDetalle}>
                                                {(() => {
                                                    if (pedidoClienteSeleccionado) {
                                                        const esEntregado = ['ENTREGADO', 'ENTREGADA'].includes((pedidoClienteSeleccionado.estado || '').toUpperCase());
                                                        return esEntregado 
                                                            ? `✅ Pedido #${pedidoClienteSeleccionado.numero_pedido} - ENTREGADO` 
                                                            : `📦 Pedido #${pedidoClienteSeleccionado.numero_pedido}`;
                                                    }
                                                    if (clienteSeleccionadoConPedidoEntregado) {
                                                        const pEntregado = (pedidosEntregadosHoy || []).find(p => {
                                                            const normT = (s) => (s || '').toString().trim().toUpperCase();
                                                            const nC = normT(clienteSeleccionado?.negocio);
                                                            const nM = normT(clienteSeleccionado?.nombre);
                                                            if (coincideCliente(clienteSeleccionado, p)) return true;
                                                            const d = normT(p?.destinatario);
                                                            return d && (d === nC || d === nM);
                                                        });
                                                        return pEntregado ? `✅ Pedido #${pEntregado.numero_pedido} - ENTREGADO` : `✅ ENTREGADO`;
                                                    }
                                                    return `📞 ${clienteSeleccionado?.celular || 'Sin teléfono'}`;
                                                })()}
                                            </Text>
                                            <Text style={styles.clienteDetalle}>📍 {clienteSeleccionado?.direccion || 'Sin dirección'}</Text>
                                        </>
                                    )}
                                </View>
                            </TouchableOpacity>

                            {/* 🆕 Badge Vendido si ya se le vendió hoy */}
                            {clienteSeleccionado && !clienteSeleccionadoConPedidoEntregado && clienteSeleccionadoYaVendido && (
                                <View style={styles.headerCheckVendido}>
                                    <Text style={styles.headerTextoVendido}>VENDIDO</Text>
                                </View>
                            )}

                            {clienteSeleccionado && estadoBanner === 'offline' && ventasPendientes > 0 && (
                                <View style={[styles.bannerCompactoEnCard, styles.bannerCompactoOffline]}>
                                    <Ionicons name="cloud-offline-outline" size={13} color="#fff" />
                                    <Text style={styles.bannerCompactoTexto}>Sin internet</Text>
                                </View>
                            )}

                            {clienteSeleccionado && (
                                <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                                    <TouchableOpacity
                                        style={styles.btnNotaInterno}
                                        onPress={() => setMostrarNotaModal(true)}
                                    >
                                        <Ionicons name={clienteSeleccionado.nota ? "document-text" : "document-text-outline"} size={26} color={clienteSeleccionado.nota ? "#dc3545" : "#A0A0A0"} />
                                    </TouchableOpacity>
                                    <TouchableOpacity
                                        style={{ padding: 5, marginLeft: 2, marginRight: 5, justifyContent: 'center', alignItems: 'center' }}
                                        onPress={() => avanzarAlSiguienteCliente({ limpiarAntes: true, mostrarAvisoFin: true })}
                                    >
                                        <Ionicons name="play-skip-forward" size={26} color="#003d88" />
                                    </TouchableOpacity>
                                </View>
                            )}
                        </View>
                    </View>
                )}

                {/* Botones de acciones: Visibles si no hay teclado (salvo si el foco está en la búsqueda o hay filtro activo) */}
                {(!tecladoAbierto || inputBuscadorEnFoco || busquedaProducto.length > 0) && (
                    <View style={styles.botonesAccionesContainer}>
                        {pedidoClienteSeleccionado ? (() => {
                            const esEntregado = ['ENTREGADO', 'ENTREGADA'].includes((pedidoClienteSeleccionado.estado || '').toUpperCase());
                            return (
                                <>
                                    <TouchableOpacity 
                                        style={[
                                            styles.btnAccion, 
                                            styles.btnEditar, 
                                            esEntregado && { opacity: 0.3 }
                                        ]} 
                                        onPress={editarPedidoClienteSeleccionado}
                                        disabled={esEntregado}
                                    >
                                        <Ionicons name="create" size={18} color="white" /><Text style={styles.btnAccionTexto}>Editar</Text>
                                    </TouchableOpacity>
                                    <TouchableOpacity 
                                        style={[
                                            styles.btnAccion, 
                                            styles.btnEntregado, 
                                            esEntregado && { opacity: 0.3 }
                                        ]} 
                                        onPress={marcarEntregadoClienteSeleccionado}
                                        disabled={esEntregado}
                                    >
                                        <Ionicons name="checkmark-circle" size={18} color="white" /><Text style={styles.btnAccionTexto}>{esEntregado ? 'Entregado' : 'Entregar'}</Text>
                                    </TouchableOpacity>
                                </>
                            );
                        })() : (
                            <>
                                <TouchableOpacity style={[styles.btnAccion, styles.btnVencidas]} onPress={() => setMostrarVencidas(true)}>
                                    <Ionicons name="alert-circle" size={18} color="white" />
                                    <Text style={styles.btnAccionTexto}>Vencidas</Text>
                                    {vencidas.length > 0 && (
                                        <View style={styles.badgeAccion}>
                                            <Text style={styles.badgeTexto}>{vencidas.length}</Text>
                                        </View>
                                    )}
                                </TouchableOpacity>
                                {turnoAbierto && (
                                    <TouchableOpacity style={[styles.btnAccion, styles.btnCerrarPequeño]} onPress={() => {
                                        // Abrir modal inmediatamente, recargar datos en segundo plano
                                        setMostrarModalCerrarTurno(true);
                                        verificarPedidosPendientes();
                                        cargarVentasDelDia(fechaSeleccionada);
                                    }}>
                                        <Ionicons name="lock-closed" size={18} color="white" /><Text style={styles.btnAccionTexto}>Cerrar</Text>
                                    </TouchableOpacity>
                                )}
                            </>
                        )}
                    </View>
                )}

                {/* Buscador: Se oculta cuando el teclado de cantidad de productos está abierto (salvo si hay filtro activo) */}
                {(!tecladoAbierto || inputBuscadorEnFoco || busquedaProducto.length > 0) && (
                    <View style={styles.busquedaContainer}>
                        <TouchableOpacity
                            onPress={abrirOpcionesModoListaProductos}
                            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                            style={styles.botonModoLista}
                        >
                            <Ionicons name="search" size={20} color="#666" style={styles.iconoBusqueda} />
                        </TouchableOpacity>
                        <TextInput
                            ref={buscadorRef}
                            style={styles.inputBusqueda}
                            placeholder="Buscar producto..."
                            value={busquedaProducto}
                            onChangeText={manejarBusquedaProducto}
                            autoCapitalize="characters"
                            onFocus={() => {
                                setInputBuscadorEnFoco(true);
                                setTecladoAbierto(false); // 🚀 Forzar "modo normal" al tocar el buscador, evitando falsos positivos de listado
                            }}
                            onBlur={() => {
                                setInputBuscadorEnFoco(false);
                            }}
                        />
                        {busquedaProducto.length > 0 && (
                            <TouchableOpacity
                                style={{ padding: 6 }}
                                hitSlop={{ top: 15, bottom: 15, left: 15, right: 15 }}
                                onPress={() => {
                                    setTecladoAbierto(false); // 🚀 Evitar que al limpiar se asuma erróneamente que estamos editando cantidades
                                    manejarBusquedaProducto('');
                                    // Enfocamos el buscador inmediatamente para que el usuario pueda seguir escribiendo
                                    buscadorRef.current?.focus();
                                }}
                            >
                                <Ionicons name="close-circle" size={20} color="#666" />
                            </TouchableOpacity>
                        )}
                    </View>
                )}
            </View>

            {/* Lista de productos */}
            <FlatList
                ref={listaProductosRef}
                data={productosFiltrados}
                renderItem={renderProducto}
                keyExtractor={(item, index) => `prod-${item.id}-${index}`}
                style={styles.listaProductos}
                contentContainerStyle={[
                    styles.listaContent,
                    (tecladoAbierto && !esModoListaScroll)
                        ? styles.listaContentConTeclado
                        : styles.listaContentNormal
                ]}
                keyboardShouldPersistTaps="always"
                onScrollToIndexFailed={(info) => {
                    const promedio = info.averageItemLength || 92;
                    const offset = Math.max(0, (info.index * promedio) - (promedio * 2.2));
                    listaProductosRef.current?.scrollToOffset({ offset, animated: true });
                    setTimeout(() => {
                        asegurarVisibilidadInputCantidad(info.index);
                    }, 120);
                }}
                onScroll={(event) => {
                    scrollOffsetProductosRef.current = event.nativeEvent.contentOffset?.y || 0;
                }}
                scrollEventThrottle={16}
                // 🚀 Propiedades de optimización
                initialNumToRender={10}
                maxToRenderPerBatch={10}
                windowSize={5}
                removeClippedSubviews={Platform.OS === 'android'}
                updateCellsBatchingPeriod={50}
                refreshControl={
                    <RefreshControl
                        refreshing={refreshing}
                        onRefresh={onRefresh}
                        colors={['#003d88']}
                        tintColor="#003d88"
                    />
                }
                ListEmptyComponent={
                    <View style={styles.emptyContainer}>
                        <Ionicons name="search-outline" size={48} color="#ccc" />
                        <Text style={styles.emptyText}>No se encontraron productos</Text>
                    </View>
                }
            />

            {/* Resumen y botón */}
            <View style={[styles.footer, { paddingBottom: Math.max(insets.bottom, Platform.OS === 'android' ? 16 : 15) }]}>
                <TouchableOpacity
                    style={[
                        styles.btnCompletar,
                        (Object.keys(carrito).filter(id => carrito[id] > 0).length === 0 && vencidas.length === 0) && styles.btnDeshabilitado
                    ]}
                    onPress={completarVenta}
                    activeOpacity={0.6}
                    delayPressIn={0}
                    disabled={Object.keys(carrito).filter(id => carrito[id] > 0).length === 0 && vencidas.length === 0}
                >
                    <Ionicons name="checkmark-circle" size={24} color="white" style={styles.iconoBoton} />
                    <Text style={styles.btnCompletarTexto}>
                        {pedidoClienteSeleccionado
                            ? `CONFIRMAR PEDIDO ${formatearMoneda(total)}`
                            : (Object.keys(carrito).filter(id => carrito[id] > 0).length === 0 && vencidas.length > 0)
                                ? 'REGISTRAR VENCIDAS'
                                : `COMPLETAR VENTA ${formatearMoneda(total)}`
                        }
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
            {
                mostrarDatePicker && (
                    <DateTimePicker
                        value={fechaSeleccionada}
                        mode="date"
                        display={Platform.OS === 'ios' ? 'spinner' : 'default'}
                        onChange={handleConfirmarFecha}
                        maximumDate={new Date(2030, 11, 31)}
                        minimumDate={new Date(2020, 0, 1)}
                    />
                )
            }

            {/* Modales */}
            <ClienteSelector
                visible={mostrarSelectorCliente}
                onClose={() => setMostrarSelectorCliente(false)}
                onSelectCliente={handleSeleccionarCliente}
                ventasDelDia={ventasDelDia} // 🆕 Pasar ventas del día
                fechaSeleccionada={fechaSeleccionada} // 🆕 Pasar fecha para consulta backend
                pedidosPendientes={pedidosPendientes} // 🆕 Pasar pedidos pendientes
                pedidosEntregadosHoy={pedidosEntregadosHoy} // 🆕 Pasar pedidos entregados
                pedidosNoEntregadosHoy={pedidosNoEntregadosHoy} // 🆕 Pasar pedidos NO entregados
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
                onClienteOcasional={abrirClienteOcasionalRapido}
                onClientesDiaActualizados={setClientesOrdenDia}
                onActualizarPedidos={verificarPedidosPendientes}
                userId={userId}
                diaSeleccionado={diaSeleccionado}
                flagCrearCliente={flagCrearCliente}
                flagVentaRapida={flagVentaRapida}
                refreshClientesToken={refreshClientesToken}
            />

            <ClienteModal
                visible={mostrarModalCliente}
                onClose={() => setMostrarModalCliente(false)}
                onSelect={handleSeleccionarCliente}
                onClienteGuardado={handleClienteGuardado}
                clientes={clientes}
                vendedorId={userId}
            />

            {/* 🆕 Modal Cliente Ocasional (Venta Rápida) */}
            <ClienteOcasionalModal
                visible={mostrarModalOcasional}
                onClose={() => setMostrarModalOcasional(false)}
                topeVentaRutaOcasional={topeVentaRutaOcasional}
                onClienteCreado={(clienteOcasional) => {
                    // Seleccionar el cliente ocasional como si fuera un cliente normal
                    handleSeleccionarCliente(clienteOcasional);
                }}
                userId={userId}
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
                obtenerAdvertenciasStock={construirAdvertenciasVencidasVenta}
                obtenerStockDisponibleProducto={obtenerStockDisponibleVencidaVenta}
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
                            <Text style={[styles.modalCerrarSubtext, { color: '#dc3545', fontWeight: 'bold' }]}>
                                ⚠️ ATENCIÓN: Una vez cerrado, NO podrás volver a abrirlo ni registrar más ventas para este día.
                            </Text>

                            {/* 🆕 Resumen Completo */}
                            {(totalVentasHoy > 0 || pedidosEntregadosHoy.length > 0) && (() => {
                                const totalPedidos = pedidosEntregadosHoy.reduce((sum, p) => sum + (parseFloat(p.total) || 0), 0);
                                const granTotal = totalDineroHoy + totalPedidos;

                                return (
                                    <View style={[styles.modalCerrarResumen, { paddingRight: 25 }]}>
                                        <View style={styles.modalCerrarFila}>
                                            <Text style={[styles.modalCerrarLabel, { flex: 1 }]}>Ventas Ruta ({totalVentasHoy}):</Text>
                                            <Text style={[styles.modalCerrarValor, { textAlign: 'right', marginRight: 10 }]}>{formatearMoneda(totalDineroHoy)}</Text>
                                        </View>

                                        <View style={styles.modalCerrarFila}>
                                            <Text style={[styles.modalCerrarLabel, { flex: 1 }]}>Pedidos ({pedidosEntregadosHoy.length}):</Text>
                                            <Text style={[styles.modalCerrarValor, { textAlign: 'right', marginRight: 10 }]}>{formatearMoneda(totalPedidos)}</Text>
                                        </View>

                                        {/* 🆕 Mostrar diferencia por precios especiales solo si existe */}
                                        {diferenciaPrecios > 0 && (
                                            <View style={[styles.modalCerrarFila, { marginTop: 8, backgroundColor: '#fff3cd', paddingHorizontal: 10, paddingVertical: 8, borderRadius: 6 }]}>
                                                <Text style={[styles.modalCerrarLabel, { color: '#856404', fontSize: 13, flex: 1 }]}>💰 Venta Precios Especiales:</Text>
                                                <Text style={[styles.modalCerrarValor, { color: '#28a745', fontWeight: 'bold', textAlign: 'right', marginRight: 10 }]}>+{formatearMoneda(diferenciaPrecios)}</Text>
                                            </View>
                                        )}

                                        <View style={{ marginTop: 15, borderTopWidth: 2, borderColor: '#003d88', paddingTop: 10 }}>
                                            <Text style={{ fontWeight: 'bold', fontSize: 13, color: '#666' }}>TOTAL A ENTREGAR:</Text>
                                            <Text style={{ fontWeight: 'bold', fontSize: 22, color: '#003d88', textAlign: 'right', marginTop: 2 }}>
                                                {formatearMoneda(granTotal)}
                                            </Text>
                                        </View>
                                    </View>
                                );
                            })()}
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
                animationType="fade"
                transparent={true}
                onRequestClose={() => setModalPedidosVisible(false)}
            >
                <View style={[styles.modalOverlay, { justifyContent: 'flex-end', backgroundColor: 'rgba(0, 0, 0, 0.65)' }]}>
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
                                pedidosPendientes.map((p, idx) => (
                                    <View key={`pedido-pendiente-${p.id}-${idx}`} style={[
                                        styles.pedidoCard,
                                        p.estado === 'ANULADA' && { backgroundColor: '#fff5f5', borderColor: '#dc3545', borderWidth: 2 }
                                    ]}>
                                        {/* Badge "No Entregado" si está anulado */}
                                        {p.estado === 'ANULADA' && (
                                            <View style={{ position: 'absolute', top: 15, left: '50%', transform: [{ translateX: -70 }], backgroundColor: '#dc3545', paddingHorizontal: 10, paddingVertical: 5, borderRadius: 6, zIndex: 5, elevation: 3, shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.25, shadowRadius: 3.84 }}>
                                                <Text style={{ color: 'white', fontSize: 12, fontWeight: 'bold', letterSpacing: 0.5 }}>❌ NO ENTREGADO</Text>
                                            </View>
                                        )}
                                        {/* Botón X solo si NO está anulado */}
                                        {p.estado !== 'ANULADA' && (
                                            <TouchableOpacity
                                                style={styles.btnNovedadX}
                                                onPress={() => {
                                                    setPedidoEnNovedad(p);
                                                    setModalNovedadVisible(true);
                                                }}
                                            >
                                                <Ionicons name="close-circle" size={28} color="#dc3545" />
                                            </TouchableOpacity>
                                        )}

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

                                        {/* Botones solo si NO está anulado */}
                                        {p.estado !== 'ANULADA' && (
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
                                                    onPress={() => {
                                                        setModalPedidosVisible(false);
                                                        setTimeout(() => marcarPedidoEntregado(p), 150);
                                                    }}
                                                >
                                                    <Ionicons name="checkmark-done" size={18} color="#003d88" />
                                                    <Text style={[styles.textoBotonAccion, { color: '#003d88' }]}>Solo Entregar</Text>
                                                </TouchableOpacity>
                                            </View>
                                        )}
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
            {/* 🆕 MODAL NOTAS CLIENTE */}
            <ClienteNotaModal
                visible={mostrarNotaModal}
                onClose={() => setMostrarNotaModal(false)}
                cliente={clienteSeleccionado}
                onGuardar={handleNotaGuardada}
            />
            {/* 🆕 MODAL HISTORIAL VENTAS */}
            <Modal
                visible={mostrarHistorialVentas}
                animationType="fade"
                transparent={true}
                onRequestClose={() => setMostrarHistorialVentas(false)}
                onShow={() => {
                    // 🔧 FIX: Forzar re-render al abrir modal para que las cards se muestren completas
                    setTimeout(() => {
                        setMostrarHistorialVentas(true);
                    }, 50);
                }}
            >
                <View style={[styles.modalOverlay, { justifyContent: 'flex-end' }]}>
                    <View 
                        style={[styles.modalContent, { maxHeight: '80%', width: '100%', borderBottomLeftRadius: 0, borderBottomRightRadius: 0, backgroundColor: 'transparent', borderWidth: 0, shadowOpacity: 0, elevation: 0 }]}
                        onLayout={() => {
                            // 🔧 FIX: Forzar actualización del layout cuando el modal se monta
                        }}
                    >
                        {(() => {
                            const fuenteResumen = (cargandoHistorial && historialReimpresion.length === 0)
                                ? historialResumenPreview
                                : historialReimpresion;
                            // Separamos las listas y calculamos totales y cantidades
                            const ventasRegulares = fuenteResumen.filter(v => v.estado !== 'ANULADA');
                            const totalVentasHistorial = ventasRegulares.reduce((suma, v) => suma + (parseFloat(v.total) || 0), 0);
                            const qtyVentas = ventasRegulares.length;

                            const ventasAnuladas = fuenteResumen.filter(v => v.estado === 'ANULADA');
                            const totalAnuladas = ventasAnuladas.reduce((suma, v) => suma + (parseFloat(v.total) || 0), 0);
                            const qtyAnuladas = ventasAnuladas.length;

                            return (
                                <View style={{ marginBottom: 15 }}>
                                    {/* Contenedor Superior: Botón X a la derecha */}
                                    <View style={{ flexDirection: 'row', justifyContent: 'flex-end', marginBottom: 10 }}>
                                        <TouchableOpacity
                                            onPress={() => setMostrarHistorialVentas(false)}
                                            style={{
                                                backgroundColor: 'rgba(0, 61, 136, 0.15)',
                                                width: 36,
                                                height: 36,
                                                borderRadius: 18,
                                                justifyContent: 'center',
                                                alignItems: 'center',
                                            }}
                                        >
                                            <Ionicons name="close" size={24} color="#ffffff" />
                                        </TouchableOpacity>
                                    </View>

                                    {/* Contenedor de ÚNICA Card Principal */}
                                    <View style={{ flexDirection: 'column' }}>
                                        <View
                                            style={{
                                                backgroundColor: mostrarSoloAnuladas ? '#fff0f0' : '#eefdf5',
                                                borderRadius: 12,
                                                paddingHorizontal: 12,
                                                paddingVertical: 8,
                                                borderWidth: 1,
                                                borderColor: mostrarSoloAnuladas ? '#fce8e8' : '#d1fae5',
                                                flexDirection: 'row',
                                                justifyContent: qtyAnuladas > 0 ? 'space-between' : 'center',
                                                alignItems: 'center',
                                            }}
                                        >
                                            {/* Sección Izquierda: Datos de la Venta Regular en Horizontal */}
                                            <View style={{ flexDirection: 'column', flex: qtyAnuladas > 0 ? 1 : 0, paddingRight: qtyAnuladas > 0 ? 10 : 0, alignItems: qtyAnuladas > 0 ? 'flex-start' : 'center' }}>
                                                {/* Arriba: Círculo y Texto "VENTAS REG" + Monto Grande */}
                                                <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                                                    <View style={{ width: 22, height: 22, borderRadius: 11, backgroundColor: '#fff', justifyContent: 'center', alignItems: 'center', marginRight: 6, elevation: 1, shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.1, shadowRadius: 1 }}>
                                                        <Ionicons name={mostrarSoloAnuladas ? "ban" : "trending-up"} size={12} color={mostrarSoloAnuladas ? "#dc2626" : "#059669"} />
                                                    </View>

                                                    <View style={{ flexDirection: 'column', justifyContent: 'center' }}>
                                                        <Text style={{ color: mostrarSoloAnuladas ? '#dc2626' : '#059669', fontSize: 9, fontWeight: 'bold', letterSpacing: 0.5, marginBottom: 1 }}>
                                                            {mostrarSoloAnuladas ? 'ANULADAS' : 'VENTAS REG.'}
                                                        </Text>
                                                        <Text
                                                            style={{ fontSize: 18, fontWeight: 'bold', color: '#1e293b', lineHeight: 20 }}
                                                            numberOfLines={1}
                                                            adjustsFontSizeToFit={true}
                                                            minimumFontScale={0.6}
                                                        >
                                                            {formatearMoneda(Math.round(mostrarSoloAnuladas ? totalAnuladas : totalVentasHistorial))}
                                                        </Text>
                                                    </View>
                                                </View>

                                                {/* Abajo: Pastillita de transacciones bien achatada */}
                                                <View style={{ alignSelf: qtyAnuladas > 0 ? 'flex-start' : 'center', backgroundColor: mostrarSoloAnuladas ? '#fee2e2' : '#dcfce7', borderRadius: 8, paddingHorizontal: 6, paddingVertical: 2, marginTop: 4, flexDirection: 'row', alignItems: 'center', marginLeft: qtyAnuladas > 0 ? 28 : 0 }}>
                                                    <View style={{ width: 5, height: 5, borderRadius: 2.5, backgroundColor: mostrarSoloAnuladas ? '#dc2626' : '#16a34a', marginRight: 4 }} />
                                                    <Text style={{ color: mostrarSoloAnuladas ? '#991b1b' : '#166534', fontSize: 9, fontWeight: 'bold' }}>
                                                        {mostrarSoloAnuladas ? `${qtyAnuladas} cancelaciones` : `${qtyVentas} transacciones`}
                                                    </Text>
                                                </View>
                                            </View>

                                            {/* Sección Derecha: Badge/Botón para Anuladas (Solo si hay) */}
                                            {qtyAnuladas > 0 && (
                                                <TouchableOpacity
                                                    activeOpacity={0.8}
                                                    onPress={() => setMostrarSoloAnuladas(!mostrarSoloAnuladas)}
                                                    style={{
                                                        backgroundColor: mostrarSoloAnuladas ? '#fff' : '#fee2e2',
                                                        borderRadius: 20,
                                                        paddingHorizontal: 12,
                                                        paddingVertical: 6,
                                                        alignItems: 'center',
                                                        justifyContent: 'center',
                                                        flexDirection: 'row',
                                                        borderWidth: 1,
                                                        borderColor: '#fca5a5',
                                                        elevation: 1,
                                                        flexShrink: 0, // <-- Evita que la pastilla de la derecha se apachurre
                                                    }}
                                                >
                                                    <Ionicons name={mostrarSoloAnuladas ? "return-up-back" : "warning"} size={14} color={mostrarSoloAnuladas ? "#2563eb" : "#dc2626"} style={{ marginRight: 4 }} />
                                                    <Text style={{ color: mostrarSoloAnuladas ? '#2563eb' : '#dc2626', fontSize: 11, fontWeight: 'bold' }}>
                                                        {mostrarSoloAnuladas ? 'Ver Todas' : 'Anuladas'}
                                                    </Text>
                                                </TouchableOpacity>
                                            )}
                                        </View>
                                    </View>
                                </View>
                            );
                        })()}

                        <ScrollView 
                            key={`historial-${historialReimpresion.length}-${mostrarSoloAnuladas}`}
                            contentContainerStyle={{ paddingBottom: 20 }}
                        >
                            {(() => {
                                const usandoVistaPreviaHistorial = cargandoHistorial
                                    && historialReimpresion.length === 0
                                    && historialResumenPreview.length > 0;

                                if (cargandoHistorial) {
                                    return (
                                        <Text style={{ textAlign: 'center', color: '#666', marginBottom: 10 }}>
                                            {usandoVistaPreviaHistorial
                                                ? 'Actualizando historial...'
                                                : 'Cargando historial...'}
                                        </Text>
                                    );
                                }

                                return null;
                            })()}

                            {(() => {
                                const usandoVistaPreviaHistorial = cargandoHistorial
                                    && historialReimpresion.length === 0
                                    && historialResumenPreview.length > 0;
                                const fuenteListado = usandoVistaPreviaHistorial
                                    ? historialResumenPreview
                                    : historialReimpresion;
                                const ventasAMostrar = mostrarSoloAnuladas
                                    ? fuenteListado.filter(v => v.estado === 'ANULADA')
                                    : fuenteListado.filter(v => v.estado !== 'ANULADA'); // <-- Excluir aquí las anuladas de la vista normal

                                // Detectar segunda venta por cliente (para badge "2ª VENTA")
                                const idsSegundaVenta = (() => {
                                    const porCliente = {};
                                    (ventasAMostrar || []).forEach(v => {
                                        const clave = norm(v.cliente_negocio || v.nombre_negocio || v.cliente_nombre || '');
                                        if (!clave) return;
                                        if (!porCliente[clave]) porCliente[clave] = [];
                                        porCliente[clave].push(v);
                                    });
                                    const ids = new Set();
                                    Object.values(porCliente).forEach(grupo => {
                                        if (grupo.length < 2) return;
                                        const sorted = [...grupo].sort((a, b) =>
                                            new Date(a.fecha || a.fecha_creacion || 0).getTime() -
                                            new Date(b.fecha || b.fecha_creacion || 0).getTime()
                                        );
                                        sorted.slice(1).forEach(v => {
                                            ids.add(v._key || v.id_local || String(v.id));
                                        });
                                    });
                                    return ids;
                                })();

                                if (ventasAMostrar.length === 0) {
                                    return (
                                        <Text style={{ textAlign: 'center', color: '#666', marginTop: 20 }}>
                                            {mostrarSoloAnuladas ? 'No hay ventas anuladas que mostrar' : 'No hay ventas registradas hoy'}
                                        </Text>
                                    );
                                }

                                return ventasAMostrar.map((venta) => {
                                    const esAnulada = venta.estado === 'ANULADA';
                                    const esSegundaVenta = !esAnulada && idsSegundaVenta.has(venta._key || venta.id_local || String(venta.id));
                                    const yaModificada = ventaYaFueModificada(venta);
                                    const metodoPagoCard = normalizarMetodoPagoEdicion(venta?.metodo_pago);
                                    const ventaTieneIdBackend = venta?.id !== undefined && venta?.id !== null && !String(venta?.id).includes('-');
                                    const ventaEsLocalPreview = String(venta?._key || '').startsWith('local-') || !ventaTieneIdBackend;
                                    const accionesBloqueadasPorPreview = usandoVistaPreviaHistorial && ventaEsLocalPreview;
                                    const ventaBackendAsociada = resolverVentaBackendAsociada(venta);
                                    const yaCambioMetodo = ventaYaCambioMetodoPago(ventaBackendAsociada || venta);
                                    const puedeCambiarMetodoDesdeCard = !accionesBloqueadasPorPreview && !esAnulada && !yaCambioMetodo && !!ventaBackendAsociada;
                                    const vecesEditada = Number(venta?.veces_editada || 0);
                                    const horaUltimaEdicion = formatearHoraEdicion(venta?.fecha_ultima_edicion);
                                    return (
                                        <View key={venta._key || `${venta.id}-${venta.fecha}`} style={{
                                            backgroundColor: esAnulada ? '#f5f5f5' : (yaModificada ? '#fff5f5' : '#f8f9fa'),
                                            padding: 15,
                                            borderRadius: 10,
                                            marginBottom: 10,
                                            borderWidth: esAnulada ? 1 : (yaModificada ? 2 : 1),
                                            borderColor: esAnulada
                                                ? '#aaa'
                                                : yaModificada
                                                    ? '#e74c3c'
                                                    : venta.origen === 'PEDIDO_FACTURADO' ? '#f59e0b' : '#dee2e6',
                                            flexDirection: 'row',
                                            alignItems: 'center',
                                            justifyContent: 'space-between',
                                            opacity: esAnulada ? 0.65 : 1,
                                        }}>
                                            <View style={{ flex: 1 }}>
                                                {accionesBloqueadasPorPreview && (
                                                    <View style={{ alignSelf: 'flex-start', backgroundColor: '#e0f2fe', borderRadius: 10, paddingHorizontal: 8, paddingVertical: 2, marginBottom: 6 }}>
                                                        <Text style={{ color: '#0369a1', fontSize: 10, fontWeight: 'bold' }}>
                                                            SINCRONIZANDO...
                                                        </Text>
                                                    </View>
                                                )}
                                                {/* Badges */}
                                                <View style={{ flexDirection: 'row', gap: 6, flexWrap: 'wrap', marginBottom: 4 }}>
                                                    {esAnulada && (
                                                        <View style={{ alignSelf: 'flex-start', backgroundColor: '#6c757d', borderRadius: 10, paddingHorizontal: 8, paddingVertical: 2 }}>
                                                            <Text style={{ color: '#fff', fontSize: 11, fontWeight: 'bold' }}>🚫 ANULADA</Text>
                                                        </View>
                                                    )}
                                                    {venta.origen === 'PEDIDO_FACTURADO' && !esAnulada && (
                                                        <View style={{ alignSelf: 'flex-start', backgroundColor: '#f59e0b', borderRadius: 10, paddingHorizontal: 8, paddingVertical: 2 }}>
                                                            <Text style={{ color: '#fff', fontSize: 11, fontWeight: 'bold' }}>PEDIDO</Text>
                                                        </View>
                                                    )}
                                                    {yaModificada && !esAnulada && (
                                                        <View style={{ alignSelf: 'flex-start', backgroundColor: '#e74c3c', borderRadius: 10, paddingHorizontal: 8, paddingVertical: 2 }}>
                                                            <Text style={{ color: '#fff', fontSize: 11, fontWeight: 'bold' }}>
                                                                {vecesEditada > 0 ? `✏️ EDITADA x${vecesEditada}` : '✏️ EDITADA'}
                                                            </Text>
                                                        </View>
                                                    )}
                                                    {esSegundaVenta && (
                                                        <View style={{ alignSelf: 'flex-start', backgroundColor: '#7c3aed', borderRadius: 10, paddingHorizontal: 8, paddingVertical: 2 }}>
                                                            <Text style={{ color: '#fff', fontSize: 11, fontWeight: 'bold' }}>2ª VENTA</Text>
                                                        </View>
                                                    )}
                                                </View>
                                                <Text style={{ fontWeight: 'bold', fontSize: 16, color: esAnulada ? '#888' : '#333' }}>
                                                    {venta.cliente_negocio || venta.cliente_nombre || 'Cliente General'}
                                                </Text>
                                                <View style={{ flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', marginTop: 2 }}>
                                                    <Text style={{ fontSize: 13, color: '#666' }}>
                                                        {(() => {
                                                            const f = venta.fecha || venta.fecha_actualizacion || venta.fecha_creacion;
                                                            if (!f) return 'Hora desconocida';
                                                            const d = new Date(f);
                                                            if (isNaN(d.getTime())) return 'Hora desconocida';
                                                            return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: true });
                                                        })()}
                                                    </Text>
                                                    {metodoPagoCard ? (
                                                        puedeCambiarMetodoDesdeCard ? (
                                                            <TouchableOpacity
                                                                onPress={() => abrirSelectorMetodoPagoDesdeCard(ventaBackendAsociada || venta)}
                                                                activeOpacity={0.7}
                                                                style={{ paddingHorizontal: 2, paddingVertical: 1 }}
                                                            >
                                                                <Text style={{ fontSize: 13, color: '#1d4ed8', fontWeight: '700' }}>
                                                                    {` • ${metodoPagoCard} ▼`}
                                                                </Text>
                                                            </TouchableOpacity>
                                                        ) : (
                                                            <Text style={{ fontSize: 13, color: '#666' }}>
                                                                {` • ${metodoPagoCard}`}
                                                            </Text>
                                                        )
                                                    ) : null}
                                                    {yaModificada && horaUltimaEdicion ? (
                                                        <Text style={{ fontSize: 12, color: '#e74c3c', fontWeight: '700' }}>
                                                            {` • Edit ${horaUltimaEdicion}`}
                                                        </Text>
                                                    ) : null}
                                                </View>
                                                <Text style={{ fontSize: 15, fontWeight: 'bold', color: esAnulada ? '#aaa' : (yaModificada ? '#e74c3c' : '#00ad53'), marginTop: 4, textDecorationLine: esAnulada ? 'line-through' : 'none' }}>
                                                    {formatearMoneda(Math.round(parseFloat(venta.total) || 0))}
                                                </Text>
                                            </View>

                                            {/* Botones: Anular + Editar + Imprimir */}
                                            <View style={{ flexDirection: 'row', gap: 6, marginLeft: 10, alignItems: 'center' }}>
                                                {/* Botón anular — visible para todas las ventas de ruta no anuladas */}
                                                {!accionesBloqueadasPorPreview && venta.origen !== 'PEDIDO_FACTURADO' && !esAnulada && (
                                                    <TouchableOpacity
                                                        style={{ 
                                                            backgroundColor: cargandoAnulacion ? '#ccc' : '#dc3545', 
                                                            padding: 8, 
                                                            borderRadius: 8,
                                                            opacity: cargandoAnulacion ? 0.6 : 1
                                                        }}
                                                        onPress={() => anularVentaRuta(ventaBackendAsociada || venta)}
                                                        disabled={cargandoAnulacion}
                                                    >
                                                        {cargandoAnulacion ? (
                                                            <View style={{ width: 18, height: 18, justifyContent: 'center', alignItems: 'center' }}>
                                                                <Ionicons name="sync" size={16} color="white" />
                                                            </View>
                                                        ) : (
                                                            <Ionicons name="ban-outline" size={18} color="white" />
                                                        )}
                                                    </TouchableOpacity>
                                                )}
                                                {/* Botón editar — solo si tiene detalles, no es pedido y no está anulada */}
                                                {!accionesBloqueadasPorPreview && venta.origen !== 'PEDIDO_FACTURADO' && !esAnulada && !yaModificada && (
                                                    <TouchableOpacity
                                                        style={{ backgroundColor: '#f39c12', padding: 8, borderRadius: 8 }}
                                                        onPress={() => abrirEdicionVenta(venta)}
                                                    >
                                                        <Ionicons name="create-outline" size={18} color="white" />
                                                    </TouchableOpacity>
                                                )}
                                                {/* Botón imprimir — siempre visible */}
                                                <TouchableOpacity
                                                    style={{ backgroundColor: esAnulada ? '#aaa' : '#003d88', padding: 8, borderRadius: 8 }}
                                                    onPress={() => imprimirTicket(venta)}
                                                >
                                                    <Ionicons name="print" size={18} color="white" />
                                                </TouchableOpacity>
                                            </View>
                                        </View>
                                    );
                                });
                            })()}
                        </ScrollView>
                    </View>
                </View>
            </Modal>

            {/* 🆕 MODAL CAMBIAR MÉTODO DE PAGO (CARD HISTORIAL) */}
            <Modal
                visible={modalMetodoPagoCardVisible}
                animationType="fade"
                transparent={true}
                onRequestClose={cerrarSelectorMetodoPagoDesdeCard}
            >
                <View style={styles.modalOverlay}>
                    <View style={styles.modalMetodoPagoCard}>
                        <Text style={styles.modalMetodoPagoTitulo}>Método de pago</Text>
                        <Text style={styles.modalMetodoPagoSubtitulo}>
                            {ventaMetodoPagoCard?.cliente_negocio || ventaMetodoPagoCard?.cliente_nombre || 'Cliente'}
                        </Text>

                        <View style={styles.metodoPagoLista}>
                            {METODOS_PAGO_RAPIDOS.map((metodo) => {
                                const activo = metodoPagoCardSeleccionado === metodo;
                                return (
                                    <TouchableOpacity
                                        key={metodo}
                                        disabled={guardandoMetodoPagoCard}
                                        style={[
                                            styles.metodoPagoOption,
                                            activo && styles.metodoPagoOptionActivo,
                                        ]}
                                        onPress={() => setMetodoPagoCardSeleccionado(metodo)}
                                    >
                                        <View style={[styles.metodoPagoRadio, activo && styles.metodoPagoRadioActivo]} />
                                        <Text style={[styles.metodoPagoOptionTexto, activo && styles.metodoPagoOptionTextoActivo]}>
                                            {metodo}
                                        </Text>
                                    </TouchableOpacity>
                                );
                            })}
                        </View>

                        <View style={styles.modalMetodoPagoBotones}>
                            <TouchableOpacity
                                style={[styles.modalMetodoPagoBtn, styles.modalMetodoPagoBtnCancelar]}
                                onPress={cerrarSelectorMetodoPagoDesdeCard}
                                disabled={guardandoMetodoPagoCard}
                            >
                                <Text style={styles.modalMetodoPagoBtnTextoCancelar}>Cancelar</Text>
                            </TouchableOpacity>
                            <TouchableOpacity
                                style={[styles.modalMetodoPagoBtn, styles.modalMetodoPagoBtnConfirmar]}
                                onPress={confirmarCambioMetodoPagoDesdeCard}
                                disabled={guardandoMetodoPagoCard}
                            >
                                <Text style={styles.modalMetodoPagoBtnTextoConfirmar}>
                                    {guardandoMetodoPagoCard ? 'Guardando...' : 'Confirmar'}
                                </Text>
                            </TouchableOpacity>
                        </View>
                    </View>
                </View>
            </Modal>

            {/* 🆕 MODAL EDICIÓN DE VENTA */}
            <Modal
                visible={modalEdicionVisible}
                animationType="fade"
                transparent={true}
                statusBarTranslucent={true}
                onRequestClose={() => cerrarEdicionVenta()}
            >
                <KeyboardAvoidingView
                    style={[
                        styles.modalOverlay,
                        {
                            // Fijo en zona superior para evitar salto al abrir teclado.
                            justifyContent: 'flex-start',
                            padding: 0,
                            paddingTop: Platform.OS === 'android' ? 23 : 34,
                            paddingHorizontal: Platform.OS === 'android' ? 6 : 8,
                            paddingBottom: Platform.OS === 'android' ? 0 : 20,
                        }
                    ]}
                    // En Android evitamos `height` porque recorta la parte inferior
                    // del modal al abrir teclado (nuevo total + botones).
                    behavior={Platform.OS === 'ios' ? 'padding' : undefined}
                    enabled={Platform.OS === 'ios'}
                >
                    <View style={{
                        backgroundColor: '#fff',
                        borderRadius: 20,
                        width: '100%',
                        padding: 8,
                        marginTop: 0,
                        maxHeight: Platform.OS === 'android' ? '100%' : '88%',
                        minHeight: Platform.OS === 'android' ? '70%' : '70%',
                        flexShrink: 0,
                        overflow: 'hidden',
                    }}>
                        {/* Header */}
                        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 2, paddingTop: Platform.OS === 'android' ? 8 : 0, paddingBottom: Platform.OS === 'android' ? 6 : 0 }}>
                            <View>
                                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                                    <Text style={{ fontSize: 18, fontWeight: 'bold', color: '#333' }}>✏️ Editar Venta</Text>
                                </View>
                                {!modoCantidadConTeclado && (
                                    <Text style={{ fontSize: 13, color: '#666', marginTop: 2 }}>
                                        {ventaEnEdicion?.cliente_negocio || ventaEnEdicion?.cliente_nombre || 'Cliente'}
                                    </Text>
                                )}
                            </View>
                            <TouchableOpacity onPress={() => cerrarEdicionVenta()}>
                                <Ionicons name="close-circle" size={30} color="#999" />
                            </TouchableOpacity>
                        </View>

                        <View style={{ marginBottom: 4 }}>
                            <TextInput
                                style={{
                                    borderWidth: 1,
                                    borderColor: '#ced4da',
                                    borderRadius: 8,
                                    paddingHorizontal: 12,
                                    paddingVertical: 4,
                                    fontSize: 14,
                                    color: '#333',
                                    backgroundColor: '#fff',
                                }}
                                placeholder="Buscar producto para agregar..."
                                value={busquedaProductoEdicion}
                                onChangeText={setBusquedaProductoEdicion}
                                onFocus={() => {
                                    setFocoCampoEdicion('search');
                                    asegurarVisibilidadInputEdicion(0);
                                }}
                                onBlur={() => {
                                    setFocoCampoEdicion((prev) => (prev === 'search' ? null : prev));
                                }}
                                placeholderTextColor="#999"
                            />

                            {busquedaProductoEdicion.trim().length >= 2 && !modoCantidadConTeclado && (
                                <View style={{
                                    marginTop: 8,
                                    borderWidth: 1,
                                    borderColor: '#e1e4e8',
                                    borderRadius: 8,
                                    backgroundColor: '#f8f9fa',
                                    maxHeight: 220,
                                }}>
                                    <ScrollView keyboardShouldPersistTaps="always">
                                        {productosSugeridosEdicion.length === 0 ? (
                                            <Text style={{ padding: 10, fontSize: 12, color: '#666' }}>
                                                Sin coincidencias.
                                            </Text>
                                        ) : (
                                            productosSugeridosEdicion.map((prod, idx) => (
                                                <View
                                                    key={`edit-add-${prod.id}-${idx}`}
                                                    style={{
                                                        flexDirection: 'row',
                                                        alignItems: 'center',
                                                        justifyContent: 'space-between',
                                                        paddingHorizontal: 10,
                                                        paddingVertical: 8,
                                                        borderBottomWidth: 1,
                                                        borderBottomColor: '#e9ecef',
                                                    }}
                                                >
                                                    <View style={{ flex: 1, paddingRight: 8 }}>
                                                        <Text style={{ fontSize: 13, color: '#222', fontWeight: '600' }}>
                                                            {prod.nombre}
                                                        </Text>
                                                        <Text style={{ fontSize: 12, color: '#666' }}>
                                                            {formatearMoneda(preciosPorProductoId[Number(prod.id)] ?? prod.precio ?? 0)}
                                                            {'  '}
                                                            <Text style={{ color: obtenerMaximoEditableProducto(prod.nombre) > 0 ? '#00ad53' : '#e74c3c', fontWeight: '700' }}>
                                                                {`Stock: ${obtenerMaximoEditableProducto(prod.nombre)}`}
                                                            </Text>
                                                        </Text>
                                                    </View>
                                                    <TouchableOpacity
                                                        style={{
                                                            backgroundColor: '#00ad53',
                                                            borderRadius: 7,
                                                            paddingHorizontal: 12,
                                                            paddingVertical: 6,
                                                        }}
                                                        onPress={() => agregarProductoEdicion(prod)}
                                                    >
                                                        <Text style={{ color: '#fff', fontSize: 12, fontWeight: '700' }}>Agregar</Text>
                                                    </TouchableOpacity>
                                                </View>
                                            ))
                                        )}
                                    </ScrollView>
                                </View>
                            )}
                        </View>

                        <ScrollView
                            ref={listaEdicionRef}
                            style={{
                                flexShrink: 1,
                                minHeight: 110,
                                maxHeight: Math.max(140, alturaListaEdicionConTeclado + 40),
                            }}
                            contentContainerStyle={{ paddingBottom: 10 }}
                            keyboardShouldPersistTaps="always"
                            onScroll={(event) => {
                                scrollOffsetEdicionRef.current = event.nativeEvent.contentOffset?.y || 0;
                            }}
                            scrollEventThrottle={16}
                        >
                            {Object.entries(carritoEdicion).map(([nombre, item], idx) => (
                                <View key={nombre} style={{
                                    flexDirection: 'row',
                                    alignItems: 'center',
                                    justifyContent: 'space-between',
                                    padding: 5,
                                    backgroundColor: '#f8f9fa',
                                    borderRadius: 7,
                                    marginBottom: 3,
                                    borderWidth: 1,
                                    borderColor: '#e9ecef',
                                }}>
                                    <View style={{ flex: 1 }}>
                                        <Text style={{ fontSize: 13, fontWeight: '600', color: '#333' }}>{nombre}</Text>
                                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                                            <Text style={{ fontSize: 10, color: '#666' }}>
                                                {formatearMoneda(item.precio)} c/u
                                            </Text>
                                            <Text style={{ fontSize: 11, color: obtenerMaximoEditableProducto(nombre) > 0 ? '#00ad53' : '#e74c3c', fontWeight: '700' }}>
                                                • Stock: {obtenerMaximoEditableProducto(nombre)}
                                            </Text>
                                        </View>
                                    </View>
                                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                                        {/* Decrementar */}
                                        <TouchableOpacity
                                            style={{ backgroundColor: '#e74c3c', borderRadius: 6, width: 26, height: 26, justifyContent: 'center', alignItems: 'center' }}
                                            onPress={() => cambiarCantidadEdicion(nombre, item.cantidad - 1)}
                                        >
                                            <Text style={{ color: '#fff', fontSize: 15, fontWeight: 'bold', lineHeight: 18 }}>−</Text>
                                        </TouchableOpacity>
                                        {/* Input cantidad */}
                                        <TextInput
                                            ref={(ref) => {
                                                if (ref) {
                                                    inputsCantidadEdicionRef.current[nombre] = ref;
                                                } else {
                                                    delete inputsCantidadEdicionRef.current[nombre];
                                                }
                                            }}
                                            style={{
                                                borderWidth: 1, borderColor: '#ced4da', borderRadius: 6,
                                                width: 38, textAlign: 'center', fontSize: 13, fontWeight: 'bold',
                                                paddingVertical: 1, color: '#333'
                                            }}
                                            keyboardType="numeric"
                                            value={cantidadesEdicionInput[nombre] ?? String(item.cantidad)}
                                            onChangeText={(val) => cambiarCantidadEdicion(nombre, val)}
                                            onBlur={() => {
                                                indiceCantidadEdicionEnFocoRef.current = null;
                                                setCantidadesEdicionInput(prev => ({
                                                    ...prev,
                                                    [nombre]: String(carritoEdicion[nombre]?.cantidad ?? 0),
                                                }));
                                            }}
                                            onFocus={() => {
                                                setFocoCampoEdicion('cantidad');
                                                indiceCantidadEdicionEnFocoRef.current = idx + 1;
                                                // Evitar empuje al cambiar entre inputs con teclado ya abierto.
                                                // El ajuste principal queda en keyboardDidShow.
                                            }}
                                            selectTextOnFocus={true} /* 🆕 Auto-selecciona el numero al hacer click */
                                        />
                                        {/* Incrementar */}
                                        <TouchableOpacity
                                            style={{ backgroundColor: '#00ad53', borderRadius: 6, width: 26, height: 26, justifyContent: 'center', alignItems: 'center' }}
                                            onPress={() => cambiarCantidadEdicion(nombre, item.cantidad + 1)}
                                        >
                                            <Text style={{ color: '#fff', fontSize: 15, fontWeight: 'bold', lineHeight: 18 }}>+</Text>
                                        </TouchableOpacity>
                                        {/* Subtotal */}
                                        <Text style={{ fontSize: 12, fontWeight: 'bold', color: '#003d88', minWidth: 62, textAlign: 'right' }}>
                                            {formatearMoneda(item.precio * item.cantidad)}
                                        </Text>
                                    </View>
                                </View>
                            ))}
                        </ScrollView>

                        {/* Total actualizado */}
                        <View style={{
                            flexDirection: 'row',
                            justifyContent: 'space-between',
                            alignItems: 'center',
                            marginTop: 2,
                            paddingTop: 2,
                            borderTopWidth: 1,
                            borderTopColor: '#e9ecef'
                        }}>
                            <Text style={{ fontSize: 14, fontWeight: 'bold', color: '#333' }}>NUEVO TOTAL</Text>
                            <Text style={{ fontSize: 18, fontWeight: 'bold', color: '#e74c3c' }}>
                                {formatearMoneda(Math.round(
                                    Object.values(carritoEdicion).reduce((sum, i) => sum + (i.precio * i.cantidad), 0)
                                ))}
                            </Text>
                        </View>

                        {/* Botones */}
                        <View style={{ flexDirection: 'row', gap: 8, marginTop: 2, paddingBottom: 2 }}>
                            <TouchableOpacity
                                style={{
                                    flex: 1,
                                    backgroundColor: '#6c757d',
                                    padding: 6,
                                    borderRadius: 10,
                                    alignItems: 'center'
                                }}
                                onPress={() => cerrarEdicionVenta()}
                            >
                                <Text style={{ color: '#fff', fontWeight: 'bold', fontSize: 13 }}>Cancelar</Text>
                            </TouchableOpacity>
                            <TouchableOpacity
                                style={{
                                    flex: 2,
                                    backgroundColor: cargandoEdicion ? '#aaa' : '#e74c3c',
                                    padding: 6,
                                    borderRadius: 10,
                                    alignItems: 'center'
                                }}
                                onPress={confirmarEdicionVenta}
                                disabled={cargandoEdicion}
                            >
                                <Text style={{ color: '#fff', fontWeight: 'bold', fontSize: 13 }}>
                                    {cargandoEdicion ? 'Guardando...' : '✅ Guardar Edición'}
                                </Text>
                            </TouchableOpacity>
                        </View>
                    </View>
                </KeyboardAvoidingView>
            </Modal>

            {/* Modal Turno Cerrado */}
            <Modal
                visible={mostrarModalTurnoCerrado}
                transparent={true}
                animationType="fade"
                onRequestClose={() => navigation.navigate('Options', { userId, vendedorNombre })}
            >
                <View style={styles.modalOverlay}>
                    <View style={styles.modalContentCentered}>
                        <View style={{ alignItems: 'center', marginBottom: 20 }}>
                            <Ionicons name="lock-closed" size={60} color="#E74C3C" />
                        </View>

                        <Text style={[styles.modalTitle, { textAlign: 'center', color: '#E74C3C' }]}>
                            🔒 TURNO CERRADO
                        </Text>

                        <Text style={{ fontSize: 16, color: '#555', textAlign: 'center', marginBottom: 24, marginTop: 12 }}>
                            El turno del {fechaTurnoCerrado} ya fue cerrado.{'\n'}No puedes realizar más operaciones.
                        </Text>

                        <TouchableOpacity
                            style={[styles.btnModal, { backgroundColor: '#E74C3C', width: '100%' }]}
                            onPress={() => {
                                setMostrarModalTurnoCerrado(false);
                                navigation.navigate('Options', { userId, vendedorNombre });
                            }}
                        >
                            <Ionicons name="arrow-back" size={20} color="#FFF" />
                            <Text style={{ color: '#FFF', fontSize: 16, fontWeight: '600', marginLeft: 8 }}>
                                Volver al Menú
                            </Text>
                        </TouchableOpacity>
                    </View>
                </View>
            </Modal>
        </View >
    );
};

const styles = StyleSheet.create({
    modalSyncOverlay: {
        flex: 1,
        justifyContent: 'flex-start',
        alignItems: 'center',
        paddingTop: 78,
        backgroundColor: 'rgba(0,0,0,0.12)',
    },
    modalSyncCard: {
        backgroundColor: '#ffffff',
        borderRadius: 12,
        paddingHorizontal: 14,
        paddingVertical: 10,
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
        borderWidth: 1,
        borderColor: '#c8e6c9',
        elevation: 6,
        shadowColor: '#000',
        shadowOpacity: 0.18,
        shadowRadius: 8,
        shadowOffset: { width: 0, height: 3 },
    },
    modalSyncTexto: {
        color: '#155724',
        fontSize: 13,
        fontWeight: '700',
    },
    // 🆕 Estilos Banner Conectividad
    bannerOffline: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 7,
        backgroundColor: '#e65100',
        paddingVertical: 7,
        paddingHorizontal: 14,
    },
    bannerSincronizando: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 7,
        backgroundColor: '#1565c0',
        paddingVertical: 7,
        paddingHorizontal: 14,
    },
    bannerExito: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 7,
        backgroundColor: '#2e7d32',
        paddingVertical: 7,
        paddingHorizontal: 14,
    },
    bannerTexto: {
        color: '#fff',
        fontSize: 12,
        fontWeight: '600',
    },
    bannerCompacto: {
        position: 'absolute',
        top: 118,
        right: 10,
        zIndex: 30,
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
        paddingHorizontal: 10,
        paddingVertical: 6,
        borderRadius: 999,
        elevation: 5,
        shadowColor: '#000',
        shadowOpacity: 0.16,
        shadowRadius: 6,
        shadowOffset: { width: 0, height: 2 },
    },
    bannerCompactoOffline: {
        backgroundColor: '#e65100',
    },
    bannerCompactoEnCard: {
        position: 'absolute',
        right: 58,
        bottom: 10,
        zIndex: 8,
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
        paddingHorizontal: 10,
        paddingVertical: 6,
        borderRadius: 999,
        elevation: 4,
        shadowColor: '#000',
        shadowOpacity: 0.16,
        shadowRadius: 6,
        shadowOffset: { width: 0, height: 2 },
    },
    bannerCompactoSincronizando: {
        backgroundColor: '#1565c0',
    },
    bannerCompactoExito: {
        backgroundColor: '#2e7d32',
    },
    bannerCompactoTexto: {
        color: '#fff',
        fontSize: 11,
        fontWeight: '700',
    },
    // 🆕 Badge "Vendido" en header del cliente — identical al del selector de clientes
    badgeYaVendidoHeader: {
        position: 'absolute',
        top: 4,
        right: 4,
        backgroundColor: '#00ad53',
        paddingHorizontal: 8,
        paddingVertical: 3,
        borderRadius: 12,
    },
    badgeYaVendidoHeaderTexto: {
        color: 'white',
        fontSize: 10,
        fontWeight: 'bold',
    },
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
    headerClienteCompacto: {
        paddingVertical: 4,
        paddingHorizontal: 10,
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
    clienteSelectorCompacto: {
        paddingVertical: 6,
    },
    headerCheckVendido: {
        position: 'absolute',
        top: 4,
        right: 4,
        backgroundColor: '#00ad53',
        paddingHorizontal: 8,
        paddingVertical: 3,
        borderRadius: 12,
    },
    headerTextoVendido: {
        color: 'white',
        fontSize: 10,
        fontWeight: 'bold',
    },
    headerXPedido: {
        position: 'absolute',
        top: 18,
        right: 20,
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
        fontSize: 15,
        fontWeight: 'bold',
        color: '#003d88',
    },
    clienteNombreMedio: {
        fontSize: 14,
    },
    clienteNombreLargo: {
        fontSize: 13,
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
    badgePendienteHeader: {
        position: 'absolute',
        top: 4,
        right: 4,
        backgroundColor: '#ff9800',
        paddingHorizontal: 8,
        paddingVertical: 3,
        borderRadius: 12,
    },
    badgePendienteHeaderTexto: {
        color: 'white',
        fontSize: 10,
        fontWeight: 'bold',
    },
    badgeVendido: {
        position: 'absolute',
        top: 4,
        right: 4,
        backgroundColor: '#00ad53',
        paddingHorizontal: 8,
        paddingVertical: 3,
        borderRadius: 12,
    },
    badgeVendidoTexto: {
        color: 'white',
        fontSize: 10,
        fontWeight: 'bold',
    },
    badgeNoEntregado: {
        position: 'absolute',
        top: 20,
        right: 20,
        backgroundColor: '#dc3545',
        paddingHorizontal: 8,
        paddingVertical: 3,
        borderRadius: 12,
    },
    badgeNoEntregadoTexto: {
        color: 'white',
        fontSize: 10,
        fontWeight: 'bold',
    },
    badgeTipoHeaderPedido: {
        width: 18,
        height: 18,
        borderRadius: 9,
        backgroundColor: '#6f42c1',
        justifyContent: 'center',
        alignItems: 'center',
        borderWidth: 1.5,
        borderColor: 'white',
    },
    badgeTipoHeaderRuta: {
        width: 18,
        height: 18,
        borderRadius: 9,
        backgroundColor: '#003d88',
        justifyContent: 'center',
        alignItems: 'center',
        borderWidth: 1.5,
        borderColor: 'white',
    },
    badgeTipoHeaderTexto: {
        color: 'white',
        fontSize: 10,
        fontWeight: 'bold',
    },
    busquedaContainer: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: 'white',
        paddingVertical: 0,
        paddingHorizontal: 10,
        marginHorizontal: 2, // Reducido al mínimo para quitar gris lateral
        marginTop: 2,
        marginBottom: 2, // Reduzco margen para que se vea menos fondo gris
        borderRadius: 16,
        height: 38,
        borderWidth: 1,
        borderColor: 'white',
        elevation: 0, // Asegurar que no haya sombra
    },
    botonModoLista: {
        padding: 4,
        marginRight: 2,
        justifyContent: 'center',
        alignItems: 'center',
    },
    iconoBusqueda: {
        marginRight: 6,
    },
    inputBusqueda: {
        flex: 1,
        fontSize: 14,
        padding: 0,
        height: '100%',
        color: '#000',
        marginTop: 0, // Reset por seguridad
        paddingVertical: 0, // Reset por seguridad
    },
    listaProductos: {
        flex: 1,
    },
    listaContent: {
        padding: 10,
    },
    listaContentNormal: {
        paddingBottom: 260,
    },
    listaContentConTeclado: {
        paddingBottom: 220,
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
    stockTextoInline: {
        fontSize: 12,
        color: '#1d4ed8',
        fontWeight: '700',
    },
    stockTextoAgotado: {
        color: '#c62828',
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
        position: 'absolute',
        top: 6,
        left: 8,
        zIndex: 100,
        elevation: 10,
        backgroundColor: '#ff9800',
        flexDirection: 'row',
        alignItems: 'center',
        borderRadius: 20,
        paddingVertical: 4,
        paddingHorizontal: 10,
        gap: 5,
    },
    pendientesText: {
        color: 'white',
        fontSize: 11,
        fontWeight: 'bold',
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
        backgroundColor: '#ff6b6b', // Rojo para advertencia
    },
    manijaRevelarTurno: {
        height: 18,
        width: '100%',
        backgroundColor: '#f8f9fa',
        alignItems: 'center',
        justifyContent: 'center',
        borderBottomWidth: 1,
        borderBottomColor: '#eee',
        zIndex: 10,
        elevation: 2,
    },
    manijaIndicador: {
        width: 40,
        height: 4,
        borderRadius: 2,
        backgroundColor: '#dee2e6',
    },
    turnoIndicadorForzado: {
        elevation: 4,
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
    // 🟠 Estilos Badge Pendiente (igual que Selector)
    badgePendienteCliente: {
        position: 'absolute',
        top: 4,
        right: 4,
        backgroundColor: '#ff9800',
        paddingHorizontal: 8,
        paddingVertical: 3,
        borderRadius: 12,
        zIndex: 10,
    },
    badgePendienteTexto: {
        color: 'white',
        fontSize: 10,
        fontWeight: 'bold',
    },
    // 🟢 Estilos Badge Entregado (igual que Selector)
    badgeEntregadoCliente: {
        position: 'absolute',
        top: 4,
        right: 4,
        backgroundColor: '#22c55e',
        paddingHorizontal: 8,
        paddingVertical: 3,
        borderRadius: 12,
        zIndex: 10,
    },
    badgeEntregadoTexto: {
        color: 'white',
        fontSize: 10,
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
    modalMetodoPagoCard: {
        backgroundColor: 'white',
        borderRadius: 14,
        width: '92%',
        maxWidth: 360,
        padding: 16,
    },
    modalMetodoPagoTitulo: {
        fontSize: 17,
        fontWeight: 'bold',
        color: '#333',
    },
    modalMetodoPagoSubtitulo: {
        marginTop: 4,
        marginBottom: 12,
        fontSize: 13,
        color: '#666',
    },
    metodoPagoLista: {
        gap: 8,
    },
    metodoPagoOption: {
        flexDirection: 'row',
        alignItems: 'center',
        borderWidth: 1,
        borderColor: '#d1d5db',
        borderRadius: 10,
        paddingVertical: 10,
        paddingHorizontal: 12,
        backgroundColor: '#f8fafc',
    },
    metodoPagoOptionActivo: {
        borderColor: '#003d88',
        backgroundColor: '#eaf2ff',
    },
    metodoPagoRadio: {
        width: 14,
        height: 14,
        borderRadius: 7,
        borderWidth: 1.5,
        borderColor: '#9ca3af',
        marginRight: 10,
        backgroundColor: '#fff',
    },
    metodoPagoRadioActivo: {
        borderColor: '#003d88',
        backgroundColor: '#003d88',
    },
    metodoPagoOptionTexto: {
        fontSize: 14,
        fontWeight: '600',
        color: '#334155',
    },
    metodoPagoOptionTextoActivo: {
        color: '#003d88',
    },
    modalMetodoPagoBotones: {
        flexDirection: 'row',
        marginTop: 14,
        gap: 8,
    },
    modalMetodoPagoBtn: {
        flex: 1,
        borderRadius: 10,
        paddingVertical: 12,
        alignItems: 'center',
        justifyContent: 'center',
    },
    modalMetodoPagoBtnCancelar: {
        backgroundColor: '#e5e7eb',
    },
    modalMetodoPagoBtnConfirmar: {
        backgroundColor: '#003d88',
    },
    modalMetodoPagoBtnTextoCancelar: {
        color: '#374151',
        fontWeight: '700',
    },
    modalMetodoPagoBtnTextoConfirmar: {
        color: 'white',
        fontWeight: '700',
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
        flex: 1,
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
    },
    puntoVerde: {
        width: 8,
        height: 8,
        borderRadius: 4,
        backgroundColor: '#22c55e',
    },
    puntoGris: {
        width: 10,
        height: 10,
        borderRadius: 5,
        backgroundColor: '#9ca3af',
    },
    turnoTexto: {
        fontSize: 13,
        fontWeight: '700',
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
        flexShrink: 1, // Evitar desbordamiento
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
        borderWidth: 1,
        borderColor: 'transparent',
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
    turnoAcciones: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
    },
    turnoAccionBtn: {
        paddingHorizontal: 8,
        paddingVertical: 7,
        backgroundColor: '#e0f2fe',
        borderRadius: 8,
        borderWidth: 1,
        borderColor: 'transparent',
    },
    turnoAccionCerrar: {
        backgroundColor: '#ffebee',
    },
    btnAbrirTurnoTexto: {
        color: 'white',
        fontSize: 12,
        fontWeight: '600',
    },
    // 🆕 Estilos Botón Nota
    btnNotaCliente: {
        flexDirection: 'row',
        alignItems: 'center',
        padding: 8,
        marginLeft: 8,
        backgroundColor: '#e6f7ff',
        borderRadius: 8,
        borderWidth: 1,
        borderColor: '#91d5ff',
        position: 'relative'
    },
    btnNotaClienteTexto: {
        fontSize: 12,
        color: '#003d88',
        fontWeight: 'bold',
        marginLeft: 4
    },
    puntoNotificacion: {
        position: 'absolute',
        top: -4,
        right: -4,
        width: 10,
        height: 10,
        borderRadius: 5,
        backgroundColor: '#ff4d4f',
        borderWidth: 1,
        borderColor: 'white'
    },
    // 🆕 Estilos Icono Nota
    btnNotaIcono: {
        width: 44,
        height: 44,
        justifyContent: 'center',
        alignItems: 'center',
        marginLeft: 8,
        backgroundColor: '#fffbe6', // Amarillo suave
        borderRadius: 22, // Circular
        borderWidth: 1,
        borderColor: '#ffe58f',
        position: 'relative'
    },
    puntoNotificacionIcono: {
        position: 'absolute',
        top: 0,
        right: 0,
        width: 12,
        height: 12,
        borderRadius: 6,
        backgroundColor: '#ff4d4f',
        borderWidth: 2,
        borderColor: 'white'
    },
    // 🆕 Estilos Botón Interno
    btnNotaInterno: {
        padding: 5,
        marginHorizontal: 5,
        justifyContent: 'center',
        alignItems: 'center',
        position: 'relative'
    },
    puntoNotificacionInterno: {
        position: 'absolute',
        top: 2,
        right: 2,
        width: 10,
        height: 10,
        borderRadius: 5,
        backgroundColor: '#ff4d4f',
        borderWidth: 1.5,
        borderColor: '#f0f8ff' // Mismo que fondo card
    },
    // 🆕 Estilos Modal Turno Cerrado
    modalContent: {
        backgroundColor: '#FFF',
        borderRadius: 16,
        padding: 24,
        width: '85%',
        maxWidth: 400,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.3,
        shadowRadius: 8,
        elevation: 10,
    },
    modalContentCentered: {
        backgroundColor: '#FFF',
        borderRadius: 16,
        padding: 24,
        width: '85%',
        maxWidth: 400,
        alignItems: 'center',
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.3,
        shadowRadius: 8,
        elevation: 10,
    },
    btnModal: {
        flexDirection: 'row',
        paddingVertical: 12,
        paddingHorizontal: 16,
        borderRadius: 8,
        justifyContent: 'center',
        alignItems: 'center',
    }
});

export default VentasScreen;
