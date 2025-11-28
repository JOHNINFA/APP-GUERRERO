import React, { useState, useEffect } from 'react';
import {
    View,
    Text,
    TextInput,
    TouchableOpacity,
    FlatList,
    StyleSheet,
    Modal
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { obtenerClientes, buscarClientes } from '../../services/ventasService';

const ClienteSelector = ({ visible, onClose, onSelectCliente, onNuevoCliente }) => {
    const [clientes, setClientes] = useState([]);
    const [busqueda, setBusqueda] = useState('');
    const [clientesFiltrados, setClientesFiltrados] = useState([]);

    useEffect(() => {
        if (visible) {
            cargarClientes();
        }
    }, [visible]);

    useEffect(() => {
        filtrarClientes();
    }, [busqueda, clientes]);

    const cargarClientes = async () => {
        const data = await obtenerClientes();
        setClientes(data);
        setClientesFiltrados(data);
    };

    const filtrarClientes = async () => {
        if (busqueda.trim() === '') {
            setClientesFiltrados(clientes);
        } else {
            const filtrados = await buscarClientes(busqueda);
            setClientesFiltrados(filtrados);
        }
    };

    const handleSelectCliente = (cliente) => {
        onSelectCliente(cliente);
        setBusqueda('');
        onClose();
    };

    const handleNuevoCliente = () => {
        onNuevoCliente();
        onClose();
    };

    const renderCliente = ({ item }) => (
        <TouchableOpacity
            style={styles.clienteItem}
            onPress={() => handleSelectCliente(item)}
        >
            <View style={styles.clienteIcono}>
                <Ionicons name="person" size={24} color="#003d88" />
            </View>
            <View style={styles.clienteInfo}>
                <Text style={styles.clienteNombre}>{item.negocio}</Text>
                <Text style={styles.clienteNegocio}>{item.nombre}</Text>
                {item.celular && (
                    <Text style={styles.clienteDetalle}>📞 {item.celular}</Text>
                )}
                {item.direccion && (
                    <Text style={styles.clienteDetalle}>📍 {item.direccion}</Text>
                )}
            </View>
            <Ionicons name="chevron-forward" size={20} color="#666" />
        </TouchableOpacity>
    );

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

                {/* Búsqueda */}
                <View style={styles.busquedaContainer}>
                    <Ionicons name="search" size={20} color="#666" style={styles.iconoBusqueda} />
                    <TextInput
                        style={styles.inputBusqueda}
                        placeholder="Buscar por nombre o negocio..."
                        value={busqueda}
                        onChangeText={setBusqueda}
                        autoCapitalize="characters"
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

                {/* Lista de Clientes */}
                <FlatList
                    data={clientesFiltrados}
                    renderItem={renderCliente}
                    keyExtractor={(item) => item.id}
                    style={styles.lista}
                    contentContainerStyle={styles.listaContent}
                    ListEmptyComponent={
                        <View style={styles.emptyContainer}>
                            <Ionicons name="people-outline" size={48} color="#ccc" />
                            <Text style={styles.emptyTexto}>No se encontraron clientes</Text>
                        </View>
                    }
                />
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
        marginBottom: 4,
    },
    clienteNegocio: {
        fontSize: 14,
        color: '#666',
        marginBottom: 4,
    },
    clienteDetalle: {
        fontSize: 12,
        color: '#999',
        marginTop: 2,
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
    },
});

export default ClienteSelector;
