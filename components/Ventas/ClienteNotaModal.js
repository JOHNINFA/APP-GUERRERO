import React, { useState, useEffect } from 'react';
import { View, Text, Modal, TextInput, TouchableOpacity, StyleSheet, ActivityIndicator, Alert, KeyboardAvoidingView, Platform } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { API_URL } from '../../config';

// Componente Modal para Editar Nota de Cliente
const ClienteNotaModal = ({ visible, onClose, cliente, onGuardar }) => {
    const [nota, setNota] = useState('');
    const [loading, setLoading] = useState(false);

    useEffect(() => {
        if (cliente) {
            setNota(cliente.nota || '');
        }
    }, [cliente]);

    const handleGuardar = async () => {
        if (!cliente || !cliente.id) return;
        setLoading(true);
        try {
            // Usar fetch directo porque no se si axios está configurado
            // 🆕 CORRECCIÓN: Actualizar ClienteRuta, no Cliente general (el ID viene de ruta)
            const response = await fetch(`${API_URL}/api/clientes-ruta/${cliente.id}/`, {
                method: 'PATCH', // o PUT, pero PATCH es mejor para actualización parcial
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({ nota: nota })
            });

            if (response.ok) {
                Alert.alert('✅ Nota Guardada', 'La nota ha sido actualizada correctamente.');

                // Actualizar objeto cliente localmente si se pasa callback
                if (onGuardar) {
                    onGuardar(nota);
                }

                onClose();
            } else {
                throw new Error('Error en respuesta');
            }
        } catch (error) {
            console.error('Error guardando nota:', error);
            Alert.alert('Error', 'No se pudo guardar la nota. Verifique su conexión.');
        } finally {
            setLoading(false);
        }
    };

    return (
        <Modal
            visible={visible}
            animationType="slide"
            transparent={true}
            onRequestClose={onClose}
        >
            <KeyboardAvoidingView
                behavior={Platform.OS === "ios" ? "padding" : "height"}
                style={styles.modalOverlay}
            >
                <View style={styles.modalContent}>
                    {/* Header */}
                    <View style={styles.header}>
                        <View>
                            <Text style={styles.titulo}>📝 Nota del Cliente</Text>
                            <Text style={styles.subtitulo} numberOfLines={1}>
                                {cliente?.negocio || cliente?.nombre}
                            </Text>
                        </View>
                        <TouchableOpacity onPress={onClose} style={styles.btnCerrar}>
                            <Ionicons name="close" size={24} color="#666" />
                        </TouchableOpacity>
                    </View>

                    {/* Body */}
                    <View style={styles.body}>
                        <Text style={styles.label}>
                            Preferencias / Bitácora:
                        </Text>
                        <TextInput
                            style={styles.inputNota}
                            value={nota}
                            onChangeText={setNota}
                            placeholder="Ej: Dejar mercancía con el vecino, Pide solo los lunes..."
                            multiline
                            textAlignVertical="top"
                        />
                    </View>

                    {/* Footer */}
                    <View style={styles.footer}>
                        <TouchableOpacity style={styles.btnCancelar} onPress={onClose}>
                            <Text style={styles.txtBtnCancelar}>Cancelar</Text>
                        </TouchableOpacity>

                        <TouchableOpacity
                            style={styles.btnGuardar}
                            onPress={handleGuardar}
                            disabled={loading}
                        >
                            {loading ? (
                                <ActivityIndicator color="white" size="small" />
                            ) : (
                                <>
                                    <Ionicons name="save" size={18} color="white" style={{ marginRight: 5 }} />
                                    <Text style={styles.txtBtnGuardar}>Guardar Nota</Text>
                                </>
                            )}
                        </TouchableOpacity>
                    </View>
                </View>
            </KeyboardAvoidingView>
        </Modal>
    );
};

const styles = StyleSheet.create({
    modalOverlay: {
        flex: 1,
        backgroundColor: 'rgba(0,0,0,0.5)',
        justifyContent: 'center',
        padding: 20
    },
    modalContent: {
        backgroundColor: 'white',
        borderRadius: 15,
        elevation: 5,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.25,
        shadowRadius: 3.84,
        maxHeight: '80%'
    },
    header: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        padding: 15,
        borderBottomWidth: 1,
        borderBottomColor: '#eee'
    },
    titulo: {
        fontSize: 18,
        fontWeight: 'bold',
        color: '#003d88'
    },
    subtitulo: {
        fontSize: 12,
        color: '#666',
        maxWidth: 250
    },
    btnCerrar: {
        padding: 5
    },
    body: {
        padding: 15
    },
    label: {
        fontSize: 14,
        fontWeight: '600',
        marginBottom: 8,
        color: '#333'
    },
    inputNota: {
        borderWidth: 1,
        borderColor: '#ddd',
        borderRadius: 8,
        padding: 10,
        height: 150,
        backgroundColor: '#fffbe6', // Amarillo post-it
        fontSize: 16,
        color: '#333'
    },
    footer: {
        flexDirection: 'row',
        padding: 15,
        borderTopWidth: 1,
        borderTopColor: '#eee',
        justifyContent: 'flex-end',
        gap: 10
    },
    btnCancelar: {
        paddingVertical: 10,
        paddingHorizontal: 15,
        borderRadius: 8,
        borderWidth: 1,
        borderColor: '#ccc',
        backgroundColor: '#f5f5f5'
    },
    txtBtnCancelar: {
        color: '#666',
        fontWeight: '600'
    },
    btnGuardar: {
        paddingVertical: 10,
        paddingHorizontal: 20,
        borderRadius: 8,
        backgroundColor: '#003d88',
        flexDirection: 'row',
        alignItems: 'center'
    },
    txtBtnGuardar: {
        color: 'white',
        fontWeight: 'bold'
    }
});

export default ClienteNotaModal;
