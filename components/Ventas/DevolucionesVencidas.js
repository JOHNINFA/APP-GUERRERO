import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import {
    View,
    Text,
    TextInput,
    TouchableOpacity,
    FlatList,
    StyleSheet,
    Modal,
    Image,
    ScrollView,
    KeyboardAvoidingView,
    Keyboard,
    Platform,
    Alert,
    ActivityIndicator,
    Animated
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import * as ImageManipulator from 'expo-image-manipulator';
import { obtenerProductos, formatearMoneda } from '../../services/ventasService';
import { API_URL } from '../../config'; // 🆕 Import estático en lugar de dinámico
import { obtenerAuthHeaders } from '../../services/rutasApiService';

const DevolucionesVencidas = React.memo(({
    visible,
    onClose,
    onGuardar,
    tipo = 'devoluciones',
    datosGuardados = [],
    fotosGuardadas = {},
    userId,
    fechaSeleccionada,
    fotoOpcional = false, // si true, no fuerza foto al guardar (usado en edición de venta)
    modoSoloRegistro = false, // 🆕 Modo directo sin "completar venta"
    clienteId = null, // 🆕 ID del cliente para modo registro directo
    onVencidasRegistradas = null, // 🆕 Callback cuando se completa registro directo
    obtenerAdvertenciasStock = null,
    obtenerStockDisponibleProducto = null,
}) => {
    const [cantidades, setCantidades] = useState({});
    const [fotos, setFotos] = useState({}); // { productoId: [uri1, uri2, ...] }
    const [busquedaProducto, setBusquedaProducto] = useState('');
    const [tecladoVisible, setTecladoVisible] = useState(false);
    const [guardando, setGuardando] = useState(false);
    const footerAnim = useRef(new Animated.Value(1)).current;
    
    // 🚀 Optimización: Cargar productos solo cuando el modal es visible
    const productos = useMemo(() => {
        if (!visible) return [];
        return obtenerProductos().filter((p) => p?.disponible_app_ventas !== false);
    }, [visible]);

    const productosFiltrados = useMemo(() => {
        const query = (busquedaProducto || '').trim().toUpperCase();
        if (!query) return productos;
        return productos.filter((p) => (p?.nombre || '').toUpperCase().includes(query));
    }, [productos, busquedaProducto]);

    // Cargar datos guardados cuando se abre el modal
    useEffect(() => {
        if (visible) {
            setBusquedaProducto('');
            // Reconstruir cantidades desde datosGuardados
            const cantidadesGuardadas = {};
            datosGuardados.forEach(item => {
                cantidadesGuardadas[item.id] = item.cantidad;
            });
            setCantidades(cantidadesGuardadas);

            // Cargar fotos guardadas
            setFotos(fotosGuardadas || {});

            // No pedir permisos de cámara al abrir el modal.
            // Se solicitan solo cuando el usuario realmente va a tomar la foto,
            // para que la apertura de Vencidas se sienta inmediata.
        }
    }, [visible, datosGuardados, fotosGuardadas]);

    useEffect(() => {
        const showEvent = Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow';
        const hideEvent = Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide';

        const showSub = Keyboard.addListener(showEvent, () => {
            setTecladoVisible(true);
            footerAnim.setValue(0); // ocultar instantáneo al abrir teclado
        });
        const hideSub = Keyboard.addListener(hideEvent, () => {
            setTecladoVisible(false);
            Animated.timing(footerAnim, { toValue: 1, duration: 120, useNativeDriver: false }).start(); // aparecer suave al cerrar
        });

        return () => {
            showSub.remove();
            hideSub.remove();
        };
    }, []);

    const handleCantidadChange = (productoId, cantidad) => {
        const cantidadNormalizada = Math.max(0, parseInt(cantidad, 10) || 0);
        const nuevasCantidades = { ...cantidades };
        if (cantidadNormalizada === 0 || cantidad === '') {
            delete nuevasCantidades[productoId];
        } else {
            nuevasCantidades[productoId] = cantidadNormalizada;
        }
        setCantidades(nuevasCantidades);
    };

    // 🆕 Función para comprimir imagen
    const comprimirImagen = async (uri) => {
        try {
            const resultado = await ImageManipulator.manipulateAsync(
                uri,
                [{ resize: { width: 800 } }], // Redimensionar a 800px de ancho
                { compress: 0.6, format: ImageManipulator.SaveFormat.JPEG } // 60% calidad
            );
            console.log('📦 Imagen comprimida:', resultado.uri);
            return resultado.uri;
        } catch (error) {
            console.warn('⚠️ Error comprimiendo imagen, usando original:', error);
            return uri; // Si falla, usar la original
        }
    };

    const tomarFoto = async (productoId) => {
        // 🆕 Validar límite de 2 fotos
        if (fotos[productoId] && fotos[productoId].length >= 2) {
            Alert.alert('Límite Alcanzado', 'Solo puedes agregar máximo 2 fotos por producto.');
            return;
        }

        try {
            // 🆕 Verificar permisos explícitamente antes de lanzar
            const { status } = await ImagePicker.requestCameraPermissionsAsync();
            if (status !== 'granted') {
                Alert.alert('Permiso denegado', 'Se necesita permiso para usar la cámara');
                return;
            }

            // 🆕 Abrir cámara directamente
            const result = await ImagePicker.launchCameraAsync({
                mediaTypes: ImagePicker.MediaTypeOptions.Images, // 🔙 Revertido para compatibilidad
                allowsEditing: false,
                quality: 0.5, // Calidad media inicial
                base64: false,
                exif: false,
            });

            if (!result.canceled && result.assets && result.assets.length > 0) {
                // 🆕 Comprimir la imagen antes de guardar
                const uriOriginal = result.assets[0].uri;
                const uriComprimida = await comprimirImagen(uriOriginal);

                const nuevasFotos = { ...fotos };
                if (!nuevasFotos[productoId]) {
                    nuevasFotos[productoId] = [];
                }
                nuevasFotos[productoId].push(uriComprimida);
                setFotos(nuevasFotos);
                console.log('📸 Foto tomada y comprimida para producto:', productoId);
            }
        } catch (error) {
            console.error('❌ Error al tomar foto:', error);
            // Si falla por permisos, pedirlos de nuevo
            if (error.message?.includes('permission')) {
                const { status } = await ImagePicker.requestCameraPermissionsAsync();
                if (status !== 'granted') {
                    Alert.alert('Permiso denegado', 'Se necesita permiso para usar la cámara');
                }
            } else {
                Alert.alert('Error', 'No se pudo tomar la foto');
            }
        }
    };

    const eliminarFoto = (productoId, fotoIndex) => {
        const nuevasFotos = { ...fotos };
        nuevasFotos[productoId].splice(fotoIndex, 1);
        if (nuevasFotos[productoId].length === 0) {
            delete nuevasFotos[productoId];
        }
        setFotos(nuevasFotos);
    };

    const tomarFotoDirecta = async () => {
        try {
            const { status } = await ImagePicker.requestCameraPermissionsAsync();
            if (status !== 'granted') {
                Alert.alert('Permiso denegado', 'Se necesita permiso para usar la cámara');
                return null;
            }
            const result = await ImagePicker.launchCameraAsync({
                mediaTypes: ImagePicker.MediaTypeOptions.Images,
                quality: 0.8,
            });
            if (!result.canceled && result.assets && result.assets.length > 0) {
                let uriComprimida = result.assets[0].uri;
                const maxDim = Math.max(result.assets[0].width, result.assets[0].height);
                if (maxDim > 1000) {
                    uriComprimida = await comprimirImagen(result.assets[0].uri);
                }
                return uriComprimida;
            }
            return null;
        } catch (error) {
            return null;
        }
    };

    const confirmarContinuarConAdvertenciasStock = async (productosObjetivo = []) => {
        const advertencias = typeof obtenerAdvertenciasStock === 'function'
            ? (obtenerAdvertenciasStock(productosObjetivo) || [])
            : [];

        if (!advertencias.length) return true;

        return await new Promise((resolve) => {
            Alert.alert(
                '⚠️ Cambio sin stock',
                advertencias.join('\n') + '\n\n¿Deseas continuar de todas formas?',
                [
                    {
                        text: 'Cancelar',
                        style: 'cancel',
                        onPress: () => resolve(false),
                    },
                    {
                        text: 'Continuar',
                        onPress: () => resolve(true),
                    }
                ]
            );
        });
    };

    const handleGuardar = async () => {
        if (guardando) return;
        setGuardando(true);

        try {
            // Filtrar solo productos con cantidad > 0
            const productosConCantidad = Object.keys(cantidades)
                .filter(id => cantidades[id] > 0)
                .map(id => {
                    const producto = productos.find(p => p.id === parseInt(id));
                    return {
                        id: producto.id,
                        nombre: producto.nombre,
                        cantidad: cantidades[id]
                    };
                });

            // Si es vencidas, validar que haya al menos UNA foto en general, no es necesario una por cada producto
            // para agilizar el registro cuando son muchos productos juntos.
            let fotosFinales = { ...fotos };

            if (tipo === 'vencidas' && productosConCantidad.length > 0) {
                const puedeContinuarPorStock = await confirmarContinuarConAdvertenciasStock(productosConCantidad);
                if (!puedeContinuarPorStock) return;

                const tieneAlgunaFoto = Object.values(fotosFinales).some(uris => uris.length > 0);
                if (!tieneAlgunaFoto && !fotoOpcional) {
                    // Abrir cámara y luego proceder a guardar
                    const nuevaUri = await tomarFotoDirecta();
                    if (!nuevaUri) return; // Si el usuario cancela la cámara, detener guardado.

                    fotosFinales['general'] = [nuevaUri];
                    setFotos(fotosFinales); // Actualizar estado visual por si acaso

                    // 🆕 FIX: En vez de dejar que el evento muera aquí, si es modo normal, cerrar y guardar directo (sin alerta que bloquea modales en Android).
                    if (!modoSoloRegistro) {
                        onGuardar(productosConCantidad, fotosFinales);
                        setCantidades({});
                        setFotos({});
                        setBusquedaProducto('');
                        onClose();
                        return; // Terminar aquí para este flujo
                    }
                }

                // 🆕 MODO SOLO REGISTRO: Enviar directamente al backend
                if (modoSoloRegistro) {
                    try {
                        console.log(`📤 Enviando vencidas directamente (${productosConCantidad.length} productos)`);

                        // Format productos vencidos para el backend
                        const productosVencidosFormateados = productosConCantidad.map(item => ({
                            id: item.id,
                            producto: item.nombre,
                            cantidad: item.cantidad,
                            motivo: 'Devolución al entregar pedido'
                        }));

                        // 🆕 Convertir fotos a base64 para el backend
                        const fotosBase64 = {};
                        for (const [prodId, uris] of Object.entries(fotosFinales)) {
                            fotosBase64[prodId] = [];
                            for (const uri of uris) {
                                try {
                                    // Leer archivo y convertir a base64
                                    const response = await fetch(uri);
                                    const blob = await response.blob();
                                    const base64 = await new Promise((resolve, reject) => {
                                        const reader = new FileReader();
                                        reader.onloadend = () => resolve(reader.result);
                                        reader.onerror = reject;
                                        reader.readAsDataURL(blob);
                                    });
                                    fotosBase64[prodId].push(base64);
                                } catch (error) {
                                    console.error('Error convirtiendo foto a base64:', error);
                                }
                            }
                        }

                        // Crear venta ficticia de $0 solo con vencidas
                        const ventaVencidas = {
                            id_local: `VENC-${Date.now()}`, // ID único
                            vendedor: userId,
                            cliente_nombre: clienteId ? `Cliente ID ${clienteId}` : 'Sin cliente',
                            nombre_negocio: '',
                            total: 0, // Sin venta, solo vencidas
                            detalles: [], // Sin productos vendidos
                            metodo_pago: 'N/A',
                            productos_vencidos: productosVencidosFormateados,
                            foto_vencidos: fotosBase64, // 🆕 Fotos en base64
                            fecha: fechaSeleccionada.toISOString()
                        };

                        const headers = await obtenerAuthHeaders({ 'Content-Type': 'application/json' });
                        const response = await fetch(`${API_URL}/api/ventas-ruta/`, {
                            method: 'POST',
                            headers,
                            body: JSON.stringify(ventaVencidas),
                        });

                        console.log('📡 Response status:', response.status);
                        console.log('📡 Response headers:', response.headers);

                        // Leer respuesta como texto primero para ver qué devuelve
                        const responseText = await response.text();
                        console.log('📡 Response text:', responseText.substring(0, 500)); // Primeros 500 caracteres

                        let data;
                        try {
                            data = JSON.parse(responseText);
                        } catch (parseError) {
                            console.error('❌ Error parseando JSON:', parseError);
                            console.error('📄 Respuesta completa:', responseText);
                            throw new Error('El servidor no devolvió JSON válido');
                        }


                        if (response.ok) {
                            Alert.alert(
                                '✅ Vencidas Registradas',
                                `${productosConCantidad.length} producto(s) registrados correctamente.`,
                                [{
                                    text: 'OK', onPress: () => {
                                        setCantidades({});
                                        setFotos({});
                                        setBusquedaProducto('');
                                        onClose();
                                        if (onGuardar) onGuardar([], {}); // Limpiar en padre
                                        // 🆕 Llamar callback para completar flujo (marcar pedido como entregado)
                                        if (onVencidasRegistradas) onVencidasRegistradas();
                                    }
                                }]
                            );
                        } else {
                            throw new Error(data.error || 'Error al registrar vencidas');
                        }
                    } catch (error) {
                        console.error('❌ Error enviando vencidas:', error);
                        Alert.alert('Error', 'No se pudieron registrar las vencidas. Intenta de nuevo.');
                    }
                    return;
                }

                // MODO NORMAL: Solo guardar localmente
                console.log(`📝 Vencidas registradas localmente (${productosConCantidad.length} productos)`);
                onGuardar(productosConCantidad, fotosFinales);
                setCantidades({});
                setFotos({});
                setBusquedaProducto('');
                onClose();
                return; // Termina la función.
            }

            // Si no hay productos (limpiando), mostrar mensaje diferente
            if (productosConCantidad.length === 0 && datosGuardados.length > 0) {
                Alert.alert(
                    'Listo',
                    'Vencidas eliminadas',
                    [{
                        text: 'OK', onPress: () => {
                            onGuardar([], {});
                            setCantidades({});
                            setFotos({});
                            setBusquedaProducto('');
                            onClose();
                        }
                    }]
                );
                return;
            }

            // Caso donde no es vencidas o no hay productos y no había datos
            onGuardar(productosConCantidad, fotosFinales);
            setCantidades({});
            setFotos({});
            setBusquedaProducto('');
            onClose();
        } finally {
            setGuardando(false);
        }
    };

    const handleCancelar = () => {
        setCantidades({});
        setFotos({});
        setBusquedaProducto('');
        onClose();
    };

    const handleLimpiarTodo = () => {
        const hayDatos = Object.keys(cantidades).length > 0 || Object.keys(fotos).length > 0;
        if (!hayDatos) return;

        Alert.alert(
            'Limpiar vencidas',
            'Se pondrán en 0 todas las cantidades y se eliminarán las fotos cargadas. ¿Continuar?',
            [
                { text: 'Cancelar', style: 'cancel' },
                {
                    text: 'Limpiar',
                    style: 'destructive',
                    onPress: () => {
                        setCantidades({});
                        setFotos({});
                    }
                }
            ]
        );
    };

    const totalProductos = Object.values(cantidades).reduce((sum, val) => sum + (val || 0), 0);

    // 🚀 Optimización: Pre-calcular stocks disponibles para todos los productos de una vez
    const stocksDisponibles = useMemo(() => {
        const stocks = {};
        productos.forEach(producto => {
            const cantidad = cantidades[producto.id] || 0;
            const stockDisponibleRaw = typeof obtenerStockDisponibleProducto === 'function'
                ? obtenerStockDisponibleProducto(producto?.nombre || '')
                : null;
            
            const stockDisponibleBase = Number.isFinite(Number(stockDisponibleRaw))
                ? Math.max(0, parseInt(stockDisponibleRaw, 10) || 0)
                : null;
            
            stocks[producto.id] = stockDisponibleBase !== null 
                ? Math.max(0, stockDisponibleBase - cantidad)
                : null;
        });
        return stocks;
    }, [productos, cantidades, obtenerStockDisponibleProducto]);

    const renderProducto = useCallback(({ item }) => {
        const cantidad = cantidades[item.id] || 0;
        const fotosProducto = fotos[item.id] || [];
        const stockDisponible = stocksDisponibles[item.id];

        return (
            <View style={styles.productoItem}>
                <View style={styles.productoHeader}>
                    <View style={styles.productoInfo}>
                        <Text style={styles.productoNombre}>{item.nombre}</Text>
                        {stockDisponible !== null && (
                            <Text style={[
                                styles.productoStockDisponible,
                                stockDisponible <= 0 && styles.productoStockAgotado,
                            ]}>
                                {`Stock disponible: ${stockDisponible}`}
                            </Text>
                        )}
                    </View>

                    <View style={styles.cantidadControl}>
                        <TouchableOpacity
                            style={[styles.btnCantidad, cantidad === 0 && styles.btnDeshabilitado]}
                            onPress={() => handleCantidadChange(item.id, cantidad - 1)}
                            disabled={cantidad === 0}
                        >
                            <Ionicons name="remove" size={18} color={cantidad === 0 ? '#ccc' : 'white'} />
                        </TouchableOpacity>

                        <TextInput
                            style={styles.inputCantidad}
                            value={String(cantidad)}
                            onChangeText={(texto) => {
                                const num = parseInt(texto) || 0;
                                handleCantidadChange(item.id, num);
                            }}
                            keyboardType="numeric"
                            selectTextOnFocus
                        />

                        <TouchableOpacity
                            style={styles.btnCantidad}
                            onPress={() => handleCantidadChange(item.id, cantidad + 1)}
                        >
                            <Ionicons name="add" size={18} color="white" />
                        </TouchableOpacity>
                    </View>
                </View>
            </View>
        );
    }, [cantidades, fotos, stocksDisponibles]);

    // 🆕 Renderizar panel general de fotos para Vencidas
    const renderPanelFotosGenerales = () => {
        if (tipo !== 'vencidas') return null;

        const fotosGenerales = fotos['general'] || [];

        return (
            <View style={styles.panelFotosGenerales}>
                <Text style={styles.textoPanelFotos}>📸 Evidencia General (Opcional por producto, 1 en total obligatoria)</Text>
                <ScrollView
                    horizontal
                    showsHorizontalScrollIndicator={false}
                    keyboardShouldPersistTaps="always"
                    style={{ marginTop: 10 }}
                >
                    {fotosGenerales.map((uri, index) => (
                        <View key={index} style={styles.fotoMiniatura}>
                            <Image source={{ uri }} style={styles.fotoMiniaturaImagen} />
                            <TouchableOpacity
                                style={styles.btnEliminarMiniatura}
                                onPress={() => eliminarFoto('general', index)}
                            >
                                <Ionicons name="close-circle" size={20} color="white" />
                            </TouchableOpacity>
                        </View>
                    ))}
                    <TouchableOpacity
                        style={styles.btnAgregarFoto}
                        onPress={() => tomarFoto('general')}
                    >
                        <Ionicons name="camera" size={24} color="#003d88" />
                        <Text style={styles.btnAgregarFotoTexto}>
                            {fotosGenerales.length > 0 ? '+' : 'Foto'}
                        </Text>
                    </TouchableOpacity>
                </ScrollView>
            </View>
        );
    };

    return (
        <Modal
            visible={visible}
            animationType="fade"
            transparent={true}
            statusBarTranslucent={true}
            onRequestClose={handleCancelar}
        >
            <KeyboardAvoidingView
                style={{
                    flex: 1,
                    backgroundColor: 'rgba(0, 0, 0, 0.5)',
                    justifyContent: 'flex-start',
                    paddingTop: Platform.OS === 'android' ? 0 : 34,
                    paddingHorizontal: Platform.OS === 'android' ? 0 : 8,
                    paddingBottom: Platform.OS === 'android' ? 0 : 20,
                }}
                behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
                enabled={true}
            >
                <View style={{
                    backgroundColor: '#fff',
                    borderTopLeftRadius: 20,
                    borderTopRightRadius: 20,
                    borderBottomLeftRadius: 8,
                    borderBottomRightRadius: 8,
                    width: '100%',
                    flex: 1,
                    overflow: 'hidden',
                }}>
                    {/* Header */}
                    <View style={styles.header}>
                        <TouchableOpacity onPress={handleCancelar} style={styles.btnCerrar}>
                            <Ionicons name="close" size={28} color="#333" />
                        </TouchableOpacity>
                        <Text style={styles.titulo}>
                            {tipo === 'devoluciones' ? 'Devoluciones' : 'Productos Vencidos'}
                        </Text>
                        <TouchableOpacity onPress={handleLimpiarTodo} style={styles.btnLimpiarTodo}>
                            <Ionicons name="trash-outline" size={22} color="#d32f2f" />
                        </TouchableOpacity>
                    </View>

                    {guardando && (
                        <View style={styles.guardandoContainer}>
                            <ActivityIndicator size="small" color="#003d88" />
                            <Text style={styles.guardandoTexto}>
                                {modoSoloRegistro ? 'Registrando vencidas...' : 'Guardando...'}
                            </Text>
                        </View>
                    )}

                    {/* Buscador fijo (sticky) */}
                    <View style={styles.busquedaContainer}>
                        <Ionicons name="search" size={18} color="#666" style={styles.iconoBusqueda} />
                        <TextInput
                            style={styles.inputBusqueda}
                            placeholder="Buscar producto..."
                            value={busquedaProducto}
                            onChangeText={setBusquedaProducto}
                            autoCapitalize="characters"
                        />
                        {busquedaProducto.length > 0 && (
                            <TouchableOpacity onPress={() => setBusquedaProducto('')}>
                                <Ionicons name="close-circle" size={18} color="#666" />
                            </TouchableOpacity>
                        )}
                    </View>

                    {/* Lista de productos */}
                    <FlatList
                        data={productosFiltrados}
                        renderItem={renderProducto}
                        keyExtractor={(item) => String(item.id)}
                        style={styles.lista}
                        contentContainerStyle={styles.listaContent}
                        keyboardShouldPersistTaps="always"
                        ListFooterComponent={renderPanelFotosGenerales}
                        ListEmptyComponent={
                            <View style={styles.emptyContainer}>
                                <Ionicons name="search-outline" size={28} color="#bbb" />
                                <Text style={styles.emptyText}>No hay productos para esa búsqueda</Text>
                            </View>
                        }
                    />

                    {/* Footer con botones — fade out cuando teclado abre, fade in cuando cierra */}
                    <Animated.View style={[styles.footer, {
                        opacity: footerAnim,
                        maxHeight: footerAnim.interpolate({ inputRange: [0, 1], outputRange: [0, 120] }),
                        overflow: 'hidden',
                    }]}>
                        <TouchableOpacity
                            style={[styles.btnCancelar, guardando && styles.btnAccionDeshabilitado]}
                            onPress={handleCancelar}
                            disabled={guardando}
                        >
                            <Text style={styles.btnCancelarTexto}>Cancelar</Text>
                        </TouchableOpacity>

                        <TouchableOpacity
                            style={[styles.btnGuardar, guardando && styles.btnGuardarDeshabilitado]}
                            onPress={handleGuardar}
                            disabled={guardando}
                        >
                            {guardando ? (
                                <ActivityIndicator size="small" color="white" />
                            ) : (
                                <Ionicons name="checkmark-circle" size={20} color="white" />
                            )}
                            <Text style={styles.btnGuardarTexto}>
                                {guardando
                                    ? (modoSoloRegistro ? 'Registrando...' : 'Guardando...')
                                    : (
                                        modoSoloRegistro
                                            ? (totalProductos > 0 ? `Registrar Vencidas (${totalProductos})` : 'Guardar')
                                            : (totalProductos > 0 ? `Guardar (${totalProductos})` : 'Guardar')
                                    )}
                            </Text>
                        </TouchableOpacity>
                    </Animated.View>
                </View>
            </KeyboardAvoidingView>
        </Modal>
    );
});

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
        paddingTop: Platform.OS === 'android' ? 12 : 8,
        paddingHorizontal: 15,
        paddingBottom: Platform.OS === 'android' ? 4 : 6,
        borderBottomWidth: 1,
        borderBottomColor: '#e0e0e0',
    },
    headerCompacto: {
        paddingTop: 10,
        paddingBottom: 6,
    },
    btnCerrar: {
        padding: 5,
    },
    btnLimpiarTodo: {
        width: 28,
        alignItems: 'center',
        justifyContent: 'center',
        paddingVertical: 4,
    },
    titulo: {
        fontSize: 20,
        fontWeight: 'bold',
        color: '#333',
    },
    tituloCompacto: {
        fontSize: 18,
    },
    guardandoContainer: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: '#e8f1ff',
        marginHorizontal: 15,
        marginTop: 8,
        paddingVertical: 10,
        borderRadius: 10,
        borderWidth: 1,
        borderColor: '#cfe0ff',
    },
    guardandoTexto: {
        marginLeft: 8,
        fontSize: 13,
        color: '#003d88',
        fontWeight: '600',
    },
    busquedaContainer: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: '#fff',
        borderWidth: 1,
        borderColor: '#e0e0e0',
        borderRadius: 10,
        paddingHorizontal: 10,
        height: 42,
        marginHorizontal: 15,
        marginTop: 10,
        marginBottom: 8,
    },
    busquedaContainerCompacto: {
        marginTop: 6,
        marginBottom: 4,
        height: 38,
    },
    iconoBusqueda: {
        marginRight: 6,
    },
    inputBusqueda: {
        flex: 1,
        fontSize: 14,
        color: '#333',
    },
    lista: {
        flex: 1,
    },
    listaContent: {
        padding: 15,
    },
    listaContentCompacto: {
        paddingTop: 8,
        paddingBottom: 6,
    },
    productoItem: {
        backgroundColor: 'white',
        padding: 12,
        marginBottom: 8,
        borderRadius: 8,
        borderWidth: 1,
        borderColor: '#e0e0e0',
        elevation: 1,
    },
    productoHeader: {
        flexDirection: 'row',
        alignItems: 'center',
    },
    productoInfo: {
        flex: 1,
    },
    productoNombre: {
        fontSize: 13,
        fontWeight: 'bold',
        color: '#333',
    },
    productoStockDisponible: {
        marginTop: 3,
        fontSize: 13,
        color: '#1d4ed8',
        fontWeight: '700',
    },
    productoStockAgotado: {
        color: '#dc2626',
    },
    cantidadControl: {
        flexDirection: 'row',
        alignItems: 'center',
    },
    btnCantidad: {
        backgroundColor: '#00ad53',
        borderRadius: 6,
        padding: 6,
        width: 32,
        height: 32,
        justifyContent: 'center',
        alignItems: 'center',
    },
    btnDeshabilitado: {
        backgroundColor: '#ccc',
    },
    inputCantidad: {
        width: 45,
        textAlign: 'center',
        fontSize: 16,
        fontWeight: 'bold',
        marginHorizontal: 8,
        borderBottomWidth: 1,
        borderBottomColor: '#66b3ff',
        paddingVertical: 4,
    },
    fotosSection: {
        marginTop: 10,
        paddingTop: 10,
        borderTopWidth: 1,
        borderTopColor: '#f0f0f0',
    },
    fotoMiniatura: {
        width: 80,
        height: 80,
        marginRight: 8,
        borderRadius: 8,
        overflow: 'hidden',
        position: 'relative',
    },
    fotoMiniaturaImagen: {
        width: '100%',
        height: '100%',
        resizeMode: 'cover',
    },
    btnEliminarMiniatura: {
        position: 'absolute',
        top: 2,
        right: 2,
        backgroundColor: 'rgba(255, 0, 0, 0.8)',
        borderRadius: 10,
    },
    btnAgregarFoto: {
        width: 80,
        height: 80,
        borderRadius: 8,
        borderWidth: 2,
        borderColor: '#003d88',
        borderStyle: 'dashed',
        justifyContent: 'center',
        alignItems: 'center',
        backgroundColor: '#f0f8ff',
    },
    btnAgregarFotoTexto: {
        fontSize: 12,
        color: '#003d88',
        fontWeight: 'bold',
        marginTop: 4,
    },
    panelFotosGenerales: {
        backgroundColor: 'white',
        padding: 15,
        marginTop: 10,
        borderRadius: 8,
        borderWidth: 1,
        borderColor: '#e0e0e0',
    },
    textoPanelFotos: {
        fontSize: 14,
        color: '#666',
        fontWeight: 'bold',
    },
    footer: {
        flexDirection: 'row',
        backgroundColor: 'white',
        padding: 10,
        paddingBottom: Platform.OS === 'android' ? 10 : 20,
        borderTopWidth: 1,
        borderTopColor: '#e0e0e0',
        gap: 10,
    },
    footerCompacto: {
        paddingTop: 10,
        paddingBottom: 10,
    },
    btnCancelar: {
        flex: 1,
        padding: 10,
        borderRadius: 8,
        backgroundColor: '#f5f5f5',
        alignItems: 'center',
        justifyContent: 'center',
    },
    btnCancelarTexto: {
        fontSize: 16,
        fontWeight: '600',
        color: '#666',
    },
    btnAccionDeshabilitado: {
        opacity: 0.65,
    },
    btnGuardar: {
        flex: 1,
        flexDirection: 'row',
        padding: 10,
        borderRadius: 8,
        backgroundColor: '#00ad53',
        alignItems: 'center',
        justifyContent: 'center',
    },
    btnGuardarDeshabilitado: {
        backgroundColor: '#7fb892',
    },
    btnGuardarTexto: {
        fontSize: 16,
        fontWeight: 'bold',
        color: 'white',
        marginLeft: 8,
    },
    emptyContainer: {
        alignItems: 'center',
        justifyContent: 'center',
        paddingVertical: 30,
    },
    emptyText: {
        marginTop: 8,
        color: '#888',
        fontSize: 13,
    },
});

export default DevolucionesVencidas;
