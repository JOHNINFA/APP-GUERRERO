import React, { useState, useEffect } from 'react';
import {
    View,
    Text,
    TextInput,
    TouchableOpacity,
    FlatList,
    StyleSheet,
    Modal,
    ActivityIndicator,
    SectionList
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { API_URL } from '../../config';

// Mapeo de días
const DIAS_SEMANA = {
    0: 'DOMINGO',
    1: 'LUNES',
    2: 'MARTES',
    3: 'MIERCOLES',
    4: 'JUEVES',
    5: 'VIERNES',
    6: 'SABADO'
};

// Keys para cache
const CACHE_KEY_CLIENTES = 'clientes_cache_';
const CACHE_EXPIRY = 24 * 60 * 60 * 1000; // 24 horas

const ClienteSelector = ({
    visible,
    onClose,
    onSelectCliente,
    onNuevoCliente,
    userId,
    diaSeleccionado,
    ventasDelDia = [],
    pedidosPendientes = [], // 🆕 Lista de pedidos pendientes
    pedidosEntregadosHoy = [], // 🆕 Lista de pedidos entregados hoy
    onCargarPedido, // 🆕 Función para cargar pedido en carrito
    onMarcarEntregado, // 🆕 Función para marcar pedido como entregado
    onMarcarNoEntregado // 🆕 Función para marcar pedido como no entregado
}) => {
    const [clientesDelDia, setClientesDelDia] = useState([]);
    const [todosLosClientes, setTodosLosClientes] = useState([]);
    const [busqueda, setBusqueda] = useState('');
    const [loading, setLoading] = useState(false);
    const [mostrarTodos, setMostrarTodos] = useState(false);
    const [diaActual, setDiaActual] = useState('');
    const [actualizandoEnFondo, setActualizandoEnFondo] = useState(false);

    useEffect(() => {
        if (visible) {
            // Usar el día seleccionado o el día actual
            const dia = diaSeleccionado || DIAS_SEMANA[new Date().getDay()];
            setDiaActual(dia);
            cargarClientesConCache(dia);
        }
    }, [visible, diaSeleccionado]);

    // 🆕 Cargar clientes primero del cache, luego actualizar desde servidor
    const cargarClientesConCache = async (dia) => {
        setLoading(true);

        try {
            // 1. Intentar cargar del cache primero (INSTANTÁNEO)
            const cacheKey = `${CACHE_KEY_CLIENTES}${userId}`;
            const cachedData = await AsyncStorage.getItem(cacheKey);

            if (cachedData) {
                const { clientes, timestamp } = JSON.parse(cachedData);
                const esValido = (Date.now() - timestamp) < CACHE_EXPIRY;

                if (clientes && clientes.length > 0) {
                    console.log('📦 Clientes cargados del cache:', clientes.length);

                    // Filtrar clientes del día
                    const clientesHoy = clientes.filter(c =>
                        c.dia_visita?.toUpperCase().includes(dia)
                    );

                    setClientesDelDia(clientesHoy);
                    setTodosLosClientes(clientes);
                    setLoading(false);

                    // Si el cache es válido, actualizar en segundo plano
                    if (esValido) {
                        actualizarClientesEnFondo(dia, cacheKey);
                        return;
                    }
                }
            }

            // 2. Si no hay cache o expiró, cargar del servidor
            await cargarClientesDelServidor(dia);

        } catch (error) {
            console.error('Error con cache:', error);
            await cargarClientesDelServidor(dia);
        }
    };

    // 🆕 Actualizar clientes en segundo plano sin bloquear UI
    const actualizarClientesEnFondo = async (dia, cacheKey) => {
        setActualizandoEnFondo(true);
        try {
            const urlTodos = `${API_URL}/api/clientes-ruta/?vendedor_id=${userId}`;
            const response = await fetch(urlTodos);

            if (response.ok) {
                const data = await response.json();
                const clientesFormateados = data.map(c => ({
                    id: c.id.toString(),
                    nombre: c.nombre_contacto || c.nombre_negocio,
                    negocio: c.nombre_negocio,
                    celular: c.telefono || '',
                    direccion: c.direccion || '',
                    dia_visita: c.dia_visita,
                    esDeRuta: true
                }));

                // Guardar en cache
                await AsyncStorage.setItem(cacheKey, JSON.stringify({
                    clientes: clientesFormateados,
                    timestamp: Date.now()
                }));

                // Actualizar estado
                setTodosLosClientes(clientesFormateados);
                const clientesHoy = clientesFormateados.filter(c =>
                    c.dia_visita?.toUpperCase().includes(dia)
                );
                setClientesDelDia(clientesHoy);

                console.log('✅ Clientes actualizados en segundo plano');
            }
        } catch (error) {
            console.log('⚠️ Error actualizando en fondo:', error.message);
        } finally {
            setActualizandoEnFondo(false);
        }
    };

    // 🆕 Cargar clientes del servidor (con timeout largo)
    const cargarClientesDelServidor = async (dia) => {
        try {
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 30000); // 30 segundos

            try {
                // Cargar todos los clientes de una vez
                const urlTodos = `${API_URL}/api/clientes-ruta/?vendedor_id=${userId}`;
                const response = await fetch(urlTodos, { signal: controller.signal });
                clearTimeout(timeoutId);

                if (response.ok) {
                    const data = await response.json();
                    const clientesFormateados = data.map(c => ({
                        id: c.id.toString(),
                        nombre: c.nombre_contacto || c.nombre_negocio,
                        negocio: c.nombre_negocio,
                        celular: c.telefono || '',
                        direccion: c.direccion || '',
                        dia_visita: c.dia_visita,
                        esDeRuta: true
                    }));

                    // Guardar en cache
                    const cacheKey = `${CACHE_KEY_CLIENTES}${userId}`;
                    await AsyncStorage.setItem(cacheKey, JSON.stringify({
                        clientes: clientesFormateados,
                        timestamp: Date.now()
                    }));

                    // Filtrar clientes del día
                    const clientesHoy = clientesFormateados.filter(c =>
                        c.dia_visita?.toUpperCase().includes(dia)
                    );

                    setClientesDelDia(clientesHoy);
                    setTodosLosClientes(clientesFormateados);
                    console.log('📥 Clientes cargados del servidor:', clientesFormateados.length);
                }
            } catch (fetchError) {
                clearTimeout(timeoutId);
                if (fetchError.name === 'AbortError') {
                    console.error('⏱️ Timeout cargando clientes del servidor');
                } else {
                    throw fetchError;
                }
            }
        } catch (error) {
            console.error('❌ Error cargando clientes:', error);
        } finally {
            setLoading(false);
        }
    };

    // Filtrar clientes según búsqueda
    const getClientesFiltrados = () => {
        const listaBase = mostrarTodos ? todosLosClientes : clientesDelDia;

        if (busqueda.trim() === '') {
            return listaBase;
        }

        const queryLower = busqueda.toLowerCase();
        return listaBase.filter(c =>
            c.nombre?.toLowerCase().includes(queryLower) ||
            c.negocio?.toLowerCase().includes(queryLower) ||
            c.direccion?.toLowerCase().includes(queryLower)
        );
    };

    const handleSelectCliente = (cliente) => {
        onSelectCliente(cliente);
        setBusqueda('');
        setMostrarTodos(false);
        onClose();
    };

    const handleNuevoCliente = () => {
        onNuevoCliente();
        setMostrarTodos(false);
        onClose();
    };

    const renderCliente = ({ item }) => {
        // 🆕 Verificar si ya le vendieron hoy
        const norm = (t) => t ? t.toString().toLowerCase().trim() : '';
        let yaVendido = false;

        if (ventasDelDia && Array.isArray(ventasDelDia) && ventasDelDia.length > 0) {
            yaVendido = ventasDelDia.some(venta => {
                const vNegocio = norm(venta.cliente_negocio);
                const vNombre = norm(venta.cliente_nombre);
                const cNegocio = norm(item.negocio);
                const cNombre = norm(item.nombre);

                return (vNegocio && vNegocio === cNegocio) || (vNombre && vNombre === cNombre);
            });
        }

        // 🆕 Verificar si tiene pedidos pendientes
        const pedidosCliente = pedidosPendientes.filter(p => {
            const pDestinatario = norm(p.destinatario);
            const cNegocio = norm(item.negocio);
            const cNombre = norm(item.nombre);
            return (pDestinatario === cNegocio) || (pDestinatario === cNombre);
        });

        const tienePedidos = pedidosCliente.length > 0;
        const pedido = tienePedidos ? pedidosCliente[0] : null; // Por ahora tomar el primero

        // 🆕 Verificar si tiene pedidos entregados
        const pedidoEntregado = pedidosEntregadosHoy.find(p => {
            const pDestinatario = norm(p.destinatario);
            const cNegocio = norm(item.negocio);
            const cNombre = norm(item.nombre);
            return (pDestinatario === cNegocio) || (pDestinatario === cNombre);
        });

        // Si tiene pedidos entregados, mostrar card verde
        if (pedidoEntregado) {
            return (
                <TouchableOpacity
                    style={[
                        styles.clienteItem,
                        styles.clienteItemEntregado, // 🆕 Fondo verde transparente
                    ]}
                    onPress={() => handleSelectCliente(item)}
                    activeOpacity={0.9}
                >
                    {/* Icono del cliente */}
                    <View style={styles.clienteIcono}>
                        <Ionicons name="cube" size={24} color="#22c55e" />
                    </View>

                    {/* Información del cliente */}
                    <View style={styles.clienteInfo}>
                        <Text style={styles.clienteNombre}>{item.negocio}</Text>
                        {item.nombre && item.nombre !== item.negocio && (
                            <Text style={styles.clienteContacto}>👤 {item.nombre}</Text>
                        )}
                        <Text style={styles.clienteDetalle}>
                            📦 Pedido #{pedidoEntregado.numero_pedido}
                        </Text>
                        {item.direccion && (
                            <Text style={styles.clienteDetalle}>📍 {item.direccion}</Text>
                        )}
                    </View>

                    {/* Flecha indicadora */}
                    <Ionicons name="chevron-forward" size={20} color="#22c55e" />

                    {/* 🆕 Badge "Entregado" en esquina superior derecha */}
                    <View style={styles.badgeEntregadoCliente}>
                        <Text style={styles.badgeEntregadoTexto}>Entregado</Text>
                    </View>
                </TouchableOpacity>
            );
        }

        // Si tiene pedidos, mostrar card especial
        if (tienePedidos && pedido) {
            return (
                <TouchableOpacity
                    style={[
                        styles.clienteItem,
                        styles.clienteItemConPedido, // Fondo rojo transparente
                    ]}
                    onPress={() => handleSelectCliente(item)}
                    activeOpacity={0.9}
                >
                    {/* Icono del cliente */}
                    <View style={styles.clienteIcono}>
                        <Ionicons name="cube" size={24} color="#dc3545" />
                    </View>

                    {/* Información del cliente */}
                    <View style={styles.clienteInfo}>
                        <Text style={styles.clienteNombre}>{item.negocio}</Text>
                        {item.nombre && item.nombre !== item.negocio && (
                            <Text style={styles.clienteContacto}>👤 {item.nombre}</Text>
                        )}
                        <Text style={styles.clienteDetalle}>
                            📦 Pedido #{pedido.numero_pedido} • ${parseFloat(pedido.total).toLocaleString()}
                        </Text>
                        {item.direccion && (
                            <Text style={styles.clienteDetalle}>📍 {item.direccion}</Text>
                        )}
                    </View>

                    {/* Flecha indicadora */}
                    <Ionicons name="chevron-forward" size={20} color="#dc3545" />
                </TouchableOpacity>
            );
        }

        // Cliente normal (sin pedidos)
        return (
            <TouchableOpacity
                style={[
                    styles.clienteItem,
                    yaVendido && styles.clienteItemVendido,
                    yaVendido && { borderColor: '#00ad53' }
                ]}
                onPress={() => handleSelectCliente(item)}
            >
                <View style={styles.clienteIcono}>
                    {yaVendido ? (
                        <Ionicons name="checkmark-circle" size={24} color="#00ad53" />
                    ) : (
                        <Ionicons name="storefront" size={24} color="#003d88" />
                    )}
                </View>
                <View style={styles.clienteInfo}>
                    <Text style={styles.clienteNombre}>{item.negocio}</Text>
                    {item.nombre && item.nombre !== item.negocio && (
                        <Text style={styles.clienteContacto}>👤 {item.nombre}</Text>
                    )}
                    {item.celular && (
                        <Text style={styles.clienteDetalle}>📞 {item.celular}</Text>
                    )}
                    {item.direccion && (
                        <Text style={styles.clienteDetalle}>📍 {item.direccion}</Text>
                    )}
                </View>
                <Ionicons name="chevron-forward" size={20} color={yaVendido ? "#00ad53" : "#666"} />
            </TouchableOpacity>
        );
    };

    const clientesFiltrados = getClientesFiltrados();

    return (
        <Modal
            visible={visible}
            animationType="slide"
            transparent={false}
            onRequestClose={onClose}
        >
            <View style={styles.container}>
                {/* Header */}
                <View style={styles.header}>
                    <TouchableOpacity onPress={onClose} style={styles.btnCerrar}>
                        <Ionicons name="close" size={28} color="#333" />
                    </TouchableOpacity>
                    <Text style={styles.titulo}>Seleccionar Cliente</Text>
                    <View style={{ width: 28 }} />
                </View>

                {/* Tabs: Hoy / Todos */}
                <View style={styles.tabsContainer}>
                    <TouchableOpacity
                        style={[styles.tab, !mostrarTodos && styles.tabActivo]}
                        onPress={() => setMostrarTodos(false)}
                    >
                        <Ionicons name="today" size={18} color={!mostrarTodos ? 'white' : '#003d88'} />
                        <Text style={[styles.tabTexto, !mostrarTodos && styles.tabTextoActivo]}>
                            Hoy ({diaActual})
                        </Text>
                        <View style={[styles.badge, !mostrarTodos && styles.badgeActivo]}>
                            <Text style={[styles.badgeTexto, !mostrarTodos && styles.badgeTextoActivo]}>
                                {clientesDelDia.length}
                            </Text>
                        </View>
                    </TouchableOpacity>

                    <TouchableOpacity
                        style={[styles.tab, mostrarTodos && styles.tabActivo]}
                        onPress={() => setMostrarTodos(true)}
                    >
                        <Ionicons name="people" size={18} color={mostrarTodos ? 'white' : '#003d88'} />
                        <Text style={[styles.tabTexto, mostrarTodos && styles.tabTextoActivo]}>
                            Todos
                        </Text>
                        <View style={[styles.badge, mostrarTodos && styles.badgeActivo]}>
                            <Text style={[styles.badgeTexto, mostrarTodos && styles.badgeTextoActivo]}>
                                {todosLosClientes.length}
                            </Text>
                        </View>
                    </TouchableOpacity>
                </View>

                {/* Búsqueda */}
                <View style={styles.busquedaContainer}>
                    <Ionicons name="search" size={20} color="#666" style={styles.iconoBusqueda} />
                    <TextInput
                        style={styles.inputBusqueda}
                        placeholder="Buscar por nombre, negocio o dirección..."
                        value={busqueda}
                        onChangeText={setBusqueda}
                        autoCapitalize="none"
                    />
                    {busqueda.length > 0 && (
                        <TouchableOpacity onPress={() => setBusqueda('')}>
                            <Ionicons name="close-circle" size={20} color="#666" />
                        </TouchableOpacity>
                    )}
                </View>

                {/* Botón Nuevo Cliente */}
                <TouchableOpacity
                    style={styles.btnNuevoCliente}
                    onPress={handleNuevoCliente}
                >
                    <Ionicons name="add-circle" size={24} color="white" />
                    <Text style={styles.btnNuevoClienteTexto}>Nuevo Cliente</Text>
                </TouchableOpacity>

                {/* Loading */}
                {loading && (
                    <View style={styles.loadingContainer}>
                        <ActivityIndicator size="large" color="#003d88" />
                        <Text style={styles.loadingText}>Cargando clientes...</Text>
                    </View>
                )}

                {/* Lista de Clientes */}
                {!loading && (
                    <FlatList
                        data={clientesFiltrados}
                        renderItem={renderCliente}
                        keyExtractor={(item) => item.id}
                        style={styles.lista}
                        contentContainerStyle={styles.listaContent}
                        ListEmptyComponent={
                            <View style={styles.emptyContainer}>
                                <Ionicons name="people-outline" size={48} color="#ccc" />
                                <Text style={styles.emptyTexto}>
                                    {mostrarTodos
                                        ? 'No hay clientes en tu ruta'
                                        : `No hay clientes para ${diaActual}`}
                                </Text>
                                {!mostrarTodos && (
                                    <TouchableOpacity
                                        style={styles.btnVerTodos}
                                        onPress={() => setMostrarTodos(true)}
                                    >
                                        <Text style={styles.btnVerTodosTexto}>Ver todos los clientes</Text>
                                    </TouchableOpacity>
                                )}
                            </View>
                        }
                    />
                )}
            </View>
        </Modal>
    );
};

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: '#f5f5f5',
    },
    header: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        backgroundColor: 'white',
        paddingTop: 50,
        paddingHorizontal: 15,
        paddingBottom: 15,
        borderBottomWidth: 1,
        borderBottomColor: '#e0e0e0',
    },
    btnCerrar: {
        padding: 5,
    },
    titulo: {
        fontSize: 20,
        fontWeight: 'bold',
        color: '#333',
    },
    tabsContainer: {
        flexDirection: 'row',
        backgroundColor: 'white',
        padding: 10,
        gap: 10,
        borderBottomWidth: 1,
        borderBottomColor: '#e0e0e0',
    },
    tab: {
        flex: 1,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 12,
        borderRadius: 8,
        backgroundColor: '#f0f8ff',
        borderWidth: 1,
        borderColor: '#003d88',
        gap: 6,
    },
    tabActivo: {
        backgroundColor: '#003d88',
    },
    tabTexto: {
        fontSize: 14,
        fontWeight: 'bold',
        color: '#003d88',
    },
    tabTextoActivo: {
        color: 'white',
    },
    badge: {
        backgroundColor: '#003d88',
        borderRadius: 10,
        paddingHorizontal: 8,
        paddingVertical: 2,
    },
    badgeActivo: {
        backgroundColor: 'rgba(255,255,255,0.3)',
    },
    badgeTexto: {
        color: 'white',
        fontSize: 12,
        fontWeight: 'bold',
    },
    badgeTextoActivo: {
        color: 'white',
    },
    busquedaContainer: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: 'white',
        padding: 12,
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
    btnNuevoCliente: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: '#00ad53',
        margin: 15,
        padding: 15,
        borderRadius: 10,
    },
    btnNuevoClienteTexto: {
        color: 'white',
        fontSize: 16,
        fontWeight: 'bold',
        marginLeft: 8,
    },
    loadingContainer: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
    },
    loadingText: {
        marginTop: 10,
        color: '#666',
    },
    lista: {
        flex: 1,
    },
    listaContent: {
        padding: 15,
    },
    clienteItem: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: 'white',
        padding: 15,
        marginBottom: 10,
        borderRadius: 10,
        borderWidth: 1,
        borderColor: '#e0e0e0',
        elevation: 1,
        minHeight: 100, // Altura mínima para mantener consistencia
    },
    clienteIcono: {
        width: 50,
        height: 50,
        borderRadius: 25,
        backgroundColor: '#f0f8ff',
        justifyContent: 'center',
        alignItems: 'center',
        marginRight: 12,
    },
    clienteInfo: {
        flex: 1,
    },
    clienteNombre: {
        fontSize: 16,
        fontWeight: 'bold',
        color: '#333',
        marginBottom: 2,
    },
    clienteContacto: {
        fontSize: 14,
        color: '#666',
        marginBottom: 2,
    },
    clienteDetalle: {
        fontSize: 12,
        color: '#999',
        marginTop: 2,
    },
    clienteDia: {
        fontSize: 11,
        color: '#003d88',
        marginTop: 4,
        fontWeight: '600',
    },
    emptyContainer: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
        paddingVertical: 60,
    },
    emptyTexto: {
        fontSize: 16,
        color: '#999',
        marginTop: 10,
        textAlign: 'center',
    },
    btnVerTodos: {
        marginTop: 15,
        padding: 12,
        backgroundColor: '#003d88',
        borderRadius: 8,
    },
    btnVerTodosTexto: {
        color: 'white',
        fontWeight: 'bold',
    },
    // 🆕 Estilos Ya Vendido
    clienteItemVendido: {
        borderWidth: 2,
    },
    // 🆕 Estilos Clientes con Pedido
    clienteItemConPedido: {
        backgroundColor: 'rgba(220, 53, 69, 0.02)', // Fondo rojo super transparente
        borderColor: '#dc3545', // Borde rojo
        borderWidth: 1,
        elevation: 0, // Sin sombra
    },
    clienteItemEntregado: {
        backgroundColor: 'rgba(34, 197, 94, 0.1)', // Fondo verde transparente
        borderColor: '#22c55e', // Borde verde
        borderWidth: 1,
        elevation: 0, // Sin sombra
    },
    badgeEntregadoCliente: {
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
    botonesAccionPedido: {
        flexDirection: 'column',
        gap: 8,
        marginLeft: 8,
    },
    btnAccionPedido: {
        width: 40,
        height: 40,
        borderRadius: 20,
        justifyContent: 'center',
        alignItems: 'center',
        backgroundColor: 'white',
        borderWidth: 2,
    },
    btnNoEntregado: {
        borderColor: '#dc3545',
    },
    btnEntregar: {
        borderColor: '#28a745',
    },
    btnEditar: {
        borderColor: '#007bff',
    },
});

export default ClienteSelector;
