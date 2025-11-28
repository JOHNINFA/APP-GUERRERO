import React, { useState, useEffect } from 'react';
import { View, Text, TextInput, TouchableOpacity, FlatList, StyleSheet, Alert, SafeAreaView, StatusBar, Platform } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
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
    formatearMoneda
} from '../../services/ventasService';
import { imprimirTicket } from '../../services/printerService';

const VentasScreen = ({ route }) => {
    const { userId } = route.params;

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

    // Cargar datos iniciales
    useEffect(() => {
        cargarDatos();
    }, []);

    const cargarDatos = async () => {
        // Cargar productos
        const productosData = obtenerProductos();
        setProductos(productosData);

        // Cargar clientes
        const clientesData = await obtenerClientes();
        setClientes(clientesData);

        // Seleccionar cliente general por defecto
        setClienteSeleccionado(clientesData[0]);
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
        // Validar que haya productos en el carrito
        const productosEnCarrito = Object.keys(carrito).filter(id => carrito[id] > 0);

        if (productosEnCarrito.length === 0) {
            Alert.alert('Error', 'Debe agregar al menos un producto a la venta');
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
            vendedor: userId,
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
    const confirmarVenta = async () => {
        console.log('🔵 confirmarVenta iniciado');
        if (!ventaTemporal) {
            console.log('❌ No hay ventaTemporal');
            return;
        }

        console.log('📝 Venta a guardar:', ventaTemporal);

        try {
            console.log('💾 Llamando a guardarVenta...');
            const ventaGuardada = await guardarVenta(ventaTemporal);
            console.log('✅ Venta guardada:', ventaGuardada);

            setMostrarResumen(false);

            Alert.alert(
                'Venta Completada',
                `Venta ${ventaGuardada.id} guardada exitosamente\nTotal: ${formatearMoneda(ventaTemporal.total)}`,
                [
                    {
                        text: 'Imprimir Ticket',
                        onPress: async () => {
                            await imprimirTicket(ventaGuardada);
                            limpiarVenta();
                        }
                    },
                    {
                        text: 'Cerrar',
                        onPress: () => limpiarVenta(),
                        style: 'cancel'
                    }
                ]
            );
        } catch (error) {
            console.error('❌ Error en confirmarVenta:', error);
            Alert.alert('Error', 'No se pudo guardar la venta');
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

    // Renderizar producto
    const renderProducto = ({ item }) => {
        const cantidad = getCantidad(item.id);
        const subtotalProducto = item.precio * cantidad;

        return (
            <View style={styles.productoItem}>
                <View style={styles.productoInfo}>
                    <Text style={styles.productoNombre}>{item.nombre}</Text>
                    <Text style={styles.productoPrecio}>Precio: {formatearMoneda(item.precio)}</Text>
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

            {/* Botón Vencidas */}
            <View style={styles.botonesAccionesContainer}>
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

            {/* Lista de productos */}
            <FlatList
                data={productosFiltrados}
                renderItem={renderProducto}
                keyExtractor={(item) => String(item.id)}
                style={styles.listaProductos}
                contentContainerStyle={styles.listaContent}
                ListEmptyComponent={
                    <View style={styles.emptyContainer}>
                        <Ionicons name="search-outline" size={48} color="#ccc" />
                        <Text style={styles.emptyText}>No se encontraron productos</Text>
                    </View>
                }
            />

            {/* Resumen y botón */}
            <View style={styles.footer}>
                <TouchableOpacity
                    style={[
                        styles.btnCompletar,
                        Object.keys(carrito).filter(id => carrito[id] > 0).length === 0 && styles.btnDeshabilitado
                    ]}
                    onPress={completarVenta}
                    disabled={Object.keys(carrito).filter(id => carrito[id] > 0).length === 0}
                >
                    <Ionicons name="checkmark-circle" size={24} color="white" style={styles.iconoBoton} />
                    <Text style={styles.btnCompletarTexto}>
                        COMPLETAR VENTA {formatearMoneda(total)}
                    </Text>
                </TouchableOpacity>
            </View>

            {/* Modales */}
            <ClienteSelector
                visible={mostrarSelectorCliente}
                onClose={() => setMostrarSelectorCliente(false)}
                onSelectCliente={handleSeleccionarCliente}
                onNuevoCliente={() => {
                    setMostrarSelectorCliente(false);
                    setMostrarModalCliente(true);
                }}
            />

            <ClienteModal
                visible={mostrarModalCliente}
                onClose={() => setMostrarModalCliente(false)}
                onClienteGuardado={handleClienteGuardado}
            />



            <DevolucionesVencidas
                visible={mostrarVencidas}
                onClose={() => setMostrarVencidas(false)}
                onGuardar={handleGuardarVencidas}
                tipo="vencidas"
                datosGuardados={vencidas}
                fotosGuardadas={fotoVencidas}
            />

            <ResumenVentaModal
                visible={mostrarResumen}
                onClose={() => setMostrarResumen(false)}
                onConfirmar={confirmarVenta}
                venta={ventaTemporal}
            />
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
});

export default VentasScreen;
