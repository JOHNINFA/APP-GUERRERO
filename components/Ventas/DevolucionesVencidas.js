import React, { useState } from 'react';
import {
    View,
    Text,
    TextInput,
    TouchableOpacity,
    FlatList,
    StyleSheet,
    Modal,
    Image,
    Alert
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import { obtenerProductos, formatearMoneda } from '../../services/ventasService';

const DevolucionesVencidas = ({ visible, onClose, onGuardar, tipo = 'devoluciones' }) => {
    const [cantidades, setCantidades] = useState({});
    const [foto, setFoto] = useState(null);
    const productos = obtenerProductos();

    const handleCantidadChange = (productoId, cantidad) => {
        const nuevasCantidades = { ...cantidades };
        if (cantidad === 0 || cantidad === '') {
            delete nuevasCantidades[productoId];
        } else {
            nuevasCantidades[productoId] = parseInt(cantidad) || 0;
        }
        setCantidades(nuevasCantidades);
    };

    const tomarFoto = async () => {
        try {
            const { status } = await ImagePicker.requestCameraPermissionsAsync();

            if (status !== 'granted') {
                Alert.alert('Permiso denegado', 'Se necesita permiso para usar la cámara');
                return;
            }

            const result = await ImagePicker.launchCameraAsync({
                mediaTypes: ImagePicker.MediaTypeOptions.Images,
                allowsEditing: false,
                quality: 0.5,
            });

            if (!result.canceled) {
                setFoto(result.assets[0].uri);
            }
        } catch (error) {
            console.error('Error al tomar foto:', error);
            Alert.alert('Error', 'No se pudo tomar la foto');
        }
    };

    const eliminarFoto = () => {
        setFoto(null);
    };

    const handleGuardar = () => {
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

        // Si es vencidas, validar que haya foto si hay productos
        if (tipo === 'vencidas' && productosConCantidad.length > 0 && !foto) {
            Alert.alert('Foto requerida', 'Debe tomar una foto de los productos vencidos');
            return;
        }

        onGuardar(productosConCantidad, foto);
        setCantidades({});
        setFoto(null);
        onClose();
    };

    const handleCancelar = () => {
        setCantidades({});
        setFoto(null);
        onClose();
    };

    const totalProductos = Object.values(cantidades).reduce((sum, val) => sum + (val || 0), 0);

    const renderProducto = ({ item }) => {
        const cantidad = cantidades[item.id] || 0;

        return (
            <View style={styles.productoItem}>
                <View style={styles.productoInfo}>
                    <Text style={styles.productoNombre}>{item.nombre}</Text>
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
        );
    };

    return (
        <Modal
            visible={visible}
            animationType="slide"
            transparent={false}
            onRequestClose={handleCancelar}
        >
            <View style={styles.container}>
                {/* Header */}
                <View style={styles.header}>
                    <TouchableOpacity onPress={handleCancelar} style={styles.btnCerrar}>
                        <Ionicons name="close" size={28} color="#333" />
                    </TouchableOpacity>
                    <Text style={styles.titulo}>
                        {tipo === 'devoluciones' ? 'Devoluciones' : 'Productos Vencidos'}
                    </Text>
                    <View style={{ width: 28 }} />
                </View>

                {/* Sección de Cámara (Solo para Vencidas) */}
                {tipo === 'vencidas' && (
                    <View style={styles.cameraSection}>
                        {foto ? (
                            <View style={styles.fotoContainer}>
                                <Image source={{ uri: foto }} style={styles.fotoPreview} />
                                <TouchableOpacity style={styles.btnEliminarFoto} onPress={eliminarFoto}>
                                    <Ionicons name="trash" size={20} color="white" />
                                </TouchableOpacity>
                            </View>
                        ) : (
                            <TouchableOpacity style={styles.btnCamara} onPress={tomarFoto}>
                                <Ionicons name="camera" size={24} color="#003d88" />
                                <Text style={styles.btnCamaraTexto}>Tomar Foto Evidencia</Text>
                            </TouchableOpacity>
                        )}
                    </View>
                )}

                {/* Resumen */}
                <View style={styles.resumenContainer}>
                    <Ionicons
                        name={tipo === 'devoluciones' ? 'return-down-back' : 'alert-circle'}
                        size={24}
                        color={tipo === 'devoluciones' ? '#ff6b6b' : '#f59e0b'}
                    />
                    <Text style={styles.resumenTexto}>
                        Total productos: <Text style={styles.resumenNumero}>{totalProductos}</Text>
                    </Text>
                </View>

                {/* Lista de productos */}
                <FlatList
                    data={productos}
                    renderItem={renderProducto}
                    keyExtractor={(item) => String(item.id)}
                    style={styles.lista}
                    contentContainerStyle={styles.listaContent}
                />

                {/* Footer con botones */}
                <View style={styles.footer}>
                    <TouchableOpacity
                        style={styles.btnCancelar}
                        onPress={handleCancelar}
                    >
                        <Text style={styles.btnCancelarTexto}>Cancelar</Text>
                    </TouchableOpacity>

                    <TouchableOpacity
                        style={[
                            styles.btnGuardar,
                            totalProductos === 0 && styles.btnDeshabilitado
                        ]}
                        onPress={handleGuardar}
                        disabled={totalProductos === 0}
                    >
                        <Ionicons name="checkmark-circle" size={20} color="white" />
                        <Text style={styles.btnGuardarTexto}>
                            Guardar ({totalProductos})
                        </Text>
                    </TouchableOpacity>
                </View>
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
    cameraSection: {
        backgroundColor: 'white',
        padding: 15,
        borderBottomWidth: 1,
        borderBottomColor: '#e0e0e0',
        alignItems: 'center',
    },
    btnCamara: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: '#f0f8ff',
        padding: 12,
        borderRadius: 8,
        borderWidth: 1,
        borderColor: '#003d88',
        borderStyle: 'dashed',
        width: '100%',
        justifyContent: 'center',
    },
    btnCamaraTexto: {
        color: '#003d88',
        fontWeight: 'bold',
        marginLeft: 8,
    },
    fotoContainer: {
        width: '100%',
        height: 150,
        borderRadius: 8,
        overflow: 'hidden',
        position: 'relative',
    },
    fotoPreview: {
        width: '100%',
        height: '100%',
        resizeMode: 'cover',
    },
    btnEliminarFoto: {
        position: 'absolute',
        top: 10,
        right: 10,
        backgroundColor: 'rgba(255, 0, 0, 0.7)',
        padding: 8,
        borderRadius: 20,
    },
    resumenContainer: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: 'white',
        padding: 15,
        marginBottom: 1,
        borderBottomWidth: 1,
        borderBottomColor: '#e0e0e0',
    },
    resumenTexto: {
        fontSize: 16,
        color: '#666',
        marginLeft: 10,
    },
    resumenNumero: {
        fontWeight: 'bold',
        color: '#333',
        fontSize: 18,
    },
    lista: {
        flex: 1,
    },
    listaContent: {
        padding: 15,
    },
    productoItem: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: 'white',
        padding: 12,
        marginBottom: 8,
        borderRadius: 8,
        borderWidth: 1,
        borderColor: '#e0e0e0',
        elevation: 1,
    },
    productoInfo: {
        flex: 1,
    },
    productoNombre: {
        fontSize: 13,
        fontWeight: 'bold',
        color: '#333',
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
    footer: {
        flexDirection: 'row',
        backgroundColor: 'white',
        padding: 15,
        borderTopWidth: 1,
        borderTopColor: '#e0e0e0',
        gap: 10,
    },
    btnCancelar: {
        flex: 1,
        padding: 15,
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
    btnGuardar: {
        flex: 1,
        flexDirection: 'row',
        padding: 15,
        borderRadius: 8,
        backgroundColor: '#00ad53',
        alignItems: 'center',
        justifyContent: 'center',
    },
    btnGuardarTexto: {
        fontSize: 16,
        fontWeight: 'bold',
        color: 'white',
        marginLeft: 8,
    },
});

export default DevolucionesVencidas;
