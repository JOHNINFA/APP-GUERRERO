import React, { useState } from 'react';
import {
    View,
    Text,
    TextInput,
    TouchableOpacity,
    StyleSheet,
    Modal,
    ScrollView,
    Alert,
    KeyboardAvoidingView,
    Platform
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { guardarCliente } from '../../services/ventasService';

const ClienteModal = ({ visible, onClose, onClienteGuardado }) => {
    const [formData, setFormData] = useState({
        nombre: '',
        negocio: '',
        celular: '',
        direccion: ''
    });

    const handleChange = (campo, valor) => {
        setFormData({
            ...formData,
            [campo]: valor
        });
    };

    const validarFormulario = () => {
        if (!formData.nombre.trim()) {
            Alert.alert('Error', 'El nombre del cliente es obligatorio');
            return false;
        }

        if (!formData.negocio.trim()) {
            Alert.alert('Error', 'El nombre del negocio es obligatorio');
            return false;
        }

        return true;
    };

    const handleGuardar = async () => {
        if (!validarFormulario()) return;

        try {
            const nuevoCliente = await guardarCliente(formData);

            Alert.alert(
                'Cliente Guardado',
                `${nuevoCliente.nombre} ha sido registrado exitosamente`,
                [
                    {
                        text: 'OK',
                        onPress: () => {
                            onClienteGuardado(nuevoCliente);
                            limpiarFormulario();
                            onClose();
                        }
                    }
                ]
            );
        } catch (error) {
            Alert.alert('Error', 'No se pudo guardar el cliente');
            console.error(error);
        }
    };

    const limpiarFormulario = () => {
        setFormData({
            nombre: '',
            negocio: '',
            celular: '',
            direccion: ''
        });
    };

    const handleCancelar = () => {
        limpiarFormulario();
        onClose();
    };

    return (
        <Modal
            visible={visible}
            animationType="slide"
            transparent={false}
            onRequestClose={handleCancelar}
        >
            <KeyboardAvoidingView
                behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
                style={styles.container}
            >
                {/* Header */}
                <View style={styles.header}>
                    <TouchableOpacity onPress={handleCancelar} style={styles.btnCerrar}>
                        <Ionicons name="close" size={28} color="#333" />
                    </TouchableOpacity>
                    <Text style={styles.titulo}>Nuevo Cliente</Text>
                    <View style={{ width: 28 }} />
                </View>

                <ScrollView
                    style={styles.scrollView}
                    contentContainerStyle={styles.scrollContent}
                    keyboardShouldPersistTaps="handled"
                >
                    {/* Formulario */}
                    <View style={styles.formulario}>
                        {/* Nombre */}
                        <View style={styles.campo}>
                            <Text style={styles.label}>
                                Nombre del Cliente <Text style={styles.obligatorio}>*</Text>
                            </Text>
                            <TextInput
                                style={styles.input}
                                placeholder="Ej: Juan Pérez"
                                value={formData.nombre}
                                onChangeText={(valor) => handleChange('nombre', valor)}
                                autoCapitalize="words"
                                autoFocus
                            />
                        </View>

                        {/* Negocio */}
                        <View style={styles.campo}>
                            <Text style={styles.label}>
                                Nombre del Negocio <Text style={styles.obligatorio}>*</Text>
                            </Text>
                            <TextInput
                                style={styles.input}
                                placeholder="Ej: Tienda El Sol"
                                value={formData.negocio}
                                onChangeText={(valor) => handleChange('negocio', valor)}
                                autoCapitalize="words"
                            />
                        </View>

                        {/* Celular */}
                        <View style={styles.campo}>
                            <Text style={styles.label}>Celular</Text>
                            <TextInput
                                style={styles.input}
                                placeholder="Ej: 3001234567"
                                value={formData.celular}
                                onChangeText={(valor) => handleChange('celular', valor)}
                                keyboardType="phone-pad"
                                maxLength={10}
                            />
                        </View>

                        {/* Dirección */}
                        <View style={styles.campo}>
                            <Text style={styles.label}>Dirección</Text>
                            <TextInput
                                style={[styles.input, styles.inputTextarea]}
                                placeholder="Ej: Calle 123 #45-67"
                                value={formData.direccion}
                                onChangeText={(valor) => handleChange('direccion', valor)}
                                multiline
                                numberOfLines={3}
                                textAlignVertical="top"
                            />
                        </View>

                        {/* Nota informativa */}
                        <View style={styles.notaContainer}>
                            <Ionicons name="information-circle" size={20} color="#666" />
                            <Text style={styles.notaTexto}>
                                Los campos marcados con * son obligatorios
                            </Text>
                        </View>
                    </View>
                </ScrollView>

                {/* Footer - Botones */}
                <View style={styles.footer}>
                    <TouchableOpacity
                        style={styles.btnCancelar}
                        onPress={handleCancelar}
                    >
                        <Text style={styles.btnCancelarTexto}>Cancelar</Text>
                    </TouchableOpacity>

                    <TouchableOpacity
                        style={styles.btnGuardar}
                        onPress={handleGuardar}
                    >
                        <Ionicons name="checkmark-circle" size={20} color="white" />
                        <Text style={styles.btnGuardarTexto}>Guardar Cliente</Text>
                    </TouchableOpacity>
                </View>
            </KeyboardAvoidingView>
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
    scrollView: {
        flex: 1,
    },
    scrollContent: {
        padding: 20,
    },
    formulario: {
        backgroundColor: 'white',
        borderRadius: 10,
        padding: 20,
        elevation: 2,
    },
    campo: {
        marginBottom: 20,
    },
    label: {
        fontSize: 14,
        fontWeight: '600',
        color: '#333',
        marginBottom: 8,
    },
    obligatorio: {
        color: '#ff4444',
    },
    input: {
        borderWidth: 1,
        borderColor: '#ccc',
        borderRadius: 8,
        padding: 12,
        fontSize: 16,
        backgroundColor: 'white',
    },
    inputTextarea: {
        minHeight: 80,
        paddingTop: 12,
    },
    notaContainer: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: '#f0f8ff',
        padding: 12,
        borderRadius: 8,
        marginTop: 10,
    },
    notaTexto: {
        fontSize: 12,
        color: '#666',
        marginLeft: 8,
        flex: 1,
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

export default ClienteModal;
