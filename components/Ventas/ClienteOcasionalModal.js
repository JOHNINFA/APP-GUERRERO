import React, { useState, useEffect, useRef } from 'react';
import {
    View,
    Text,
    TextInput,
    TouchableOpacity,
    Modal,
    StyleSheet,
    Alert,
    ActivityIndicator,
    KeyboardAvoidingView,
    Platform,
    Keyboard,
    Dimensions
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { API_URL } from '../../config';

const { height: SCREEN_HEIGHT, width: SCREEN_WIDTH } = Dimensions.get('screen');

/**
 * Modal mini para crear un Cliente Ocasional (venta rápida en calle).
 * 3 campos: Nombre, Teléfono, Dirección.
 * Crea el registro en /api/clientes-ocasionales/ y selecciona automáticamente.
 */
const ClienteOcasionalModal = ({ visible, onClose, onClienteCreado, userId }) => {
    const [nombre, setNombre] = useState('');
    const [telefono, setTelefono] = useState('');
    const [direccion, setDireccion] = useState('');
    const [guardando, setGuardando] = useState(false);
    const [tecladoActivo, setTecladoActivo] = useState(false);
    const nombreRef = useRef(null);

    useEffect(() => {
        if (visible) {
            setNombre('');
            setTelefono('');
            setDireccion('');
            // Auto-focus en nombre
            setTimeout(() => nombreRef.current?.focus(), 300);
        }
    }, [visible]);

    useEffect(() => {
        const showSubscription = Keyboard.addListener(Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow', () => setTecladoActivo(true));
        const hideSubscription = Keyboard.addListener(Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide', () => setTecladoActivo(false));

        return () => {
            showSubscription.remove();
            hideSubscription.remove();
        };
    }, []);

    const handleGuardar = async () => {
        if (!nombre.trim()) {
            Alert.alert('Campo requerido', 'El nombre del cliente es obligatorio.');
            return;
        }

        setGuardando(true);
        Keyboard.dismiss();

        try {
            // El PK del vendedor ES el id_vendedor (ej: "ID1")
            const vendedorId = String(userId).toUpperCase().startsWith('ID')
                ? String(userId).toUpperCase()
                : `ID${userId}`;

            console.log('📍 Creando cliente ocasional para vendedor:', vendedorId);

            // Crear cliente ocasional en backend
            const response = await fetch(`${API_URL}/api/clientes-ocasionales/`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    vendedor: vendedorId,
                    nombre: nombre.trim(),
                    telefono: telefono.trim() || '',
                    direccion: direccion.trim() || '',
                })
            });

            if (response.ok) {
                const clienteCreado = await response.json();
                console.log('✅ Cliente ocasional creado:', clienteCreado);

                // Formatear como un "cliente" compatible con VentasScreen
                const clienteFormateado = {
                    id: `ocasional_${clienteCreado.id}`,
                    nombre: clienteCreado.nombre,
                    negocio: `${clienteCreado.nombre} (Ocasional)`,
                    celular: clienteCreado.telefono || '',
                    direccion: clienteCreado.direccion || '',
                    dia_visita: '',
                    nota: '',
                    tipo_negocio: 'OCASIONAL',
                    esDeRuta: false,
                    esOcasional: true,
                    clienteOcasionalId: clienteCreado.id,
                    tope_venta: parseFloat(clienteCreado.tope_venta || 60000)
                };

                onClienteCreado(clienteFormateado);
                onClose();
            } else {
                const errorData = await response.json().catch(() => ({}));
                Alert.alert('Error', errorData.detail || 'No se pudo crear el cliente ocasional.');
            }
        } catch (error) {
            console.error('❌ Error creando cliente ocasional:', error);
            Alert.alert('Error de conexión', 'No se pudo conectar al servidor. Verifica tu conexión.');
        } finally {
            setGuardando(false);
        }
    };

    return (
        <Modal
            visible={visible}
            transparent={true}
            animationType="fade"
            onRequestClose={onClose}
            statusBarTranslucent={true}
        >
            <View style={styles.overlay}>
                <TouchableOpacity 
                    style={StyleSheet.absoluteFill} 
                    activeOpacity={1} 
                    onPress={() => Keyboard.dismiss()} 
                />
                
                <View style={[
                    styles.container,
                    (Platform.OS === 'android' && tecladoActivo) && { transform: [{ translateY: -110 }] }
                ]}>
                    {/* Header */}
                    <View style={styles.header}>
                        <View style={styles.headerLeft}>
                            <View style={styles.iconCircle}>
                                <Ionicons name="flash" size={20} color="#f59e0b" />
                            </View>
                            <View>
                                <Text style={styles.headerTitle}>Venta Rápida</Text>
                                <Text style={styles.headerSubtitle}>Cliente ocasional</Text>
                            </View>
                        </View>
                        <TouchableOpacity onPress={onClose} style={styles.closeBtn}>
                            <Ionicons name="close" size={24} color="#6b7280" />
                        </TouchableOpacity>
                    </View>

                    {/* Campos */}
                    <View style={styles.formContainer}>
                        {/* Nombre */}
                        <View style={styles.inputGroup}>
                            <View style={styles.inputLabel}>
                                <Ionicons name="person" size={16} color="#0f3460" />
                                <Text style={styles.labelText}>Nombre *</Text>
                            </View>
                            <TextInput
                                ref={nombreRef}
                                style={styles.input}
                                placeholder="Nombre del cliente"
                                placeholderTextColor="#9ca3af"
                                value={nombre}
                                onChangeText={(text) => setNombre(text.toUpperCase())}
                                autoCapitalize="characters"
                                returnKeyType="next"
                            />
                        </View>

                        {/* Teléfono */}
                        <View style={styles.inputGroup}>
                            <View style={styles.inputLabel}>
                                <Ionicons name="call" size={16} color="#0f3460" />
                                <Text style={styles.labelText}>Teléfono</Text>
                            </View>
                            <TextInput
                                style={styles.input}
                                placeholder="Número de teléfono"
                                placeholderTextColor="#9ca3af"
                                value={telefono}
                                onChangeText={setTelefono}
                                keyboardType="phone-pad"
                                returnKeyType="next"
                            />
                        </View>

                        {/* Dirección */}
                        <View style={styles.inputGroup}>
                            <View style={styles.inputLabel}>
                                <Ionicons name="location" size={16} color="#0f3460" />
                                <Text style={styles.labelText}>Dirección</Text>
                            </View>
                            <TextInput
                                style={styles.input}
                                placeholder="Ubicación o dirección"
                                placeholderTextColor="#9ca3af"
                                value={direccion}
                                onChangeText={(text) => setDireccion(text.toUpperCase())}
                                autoCapitalize="characters"
                                returnKeyType="done"
                                onSubmitEditing={handleGuardar}
                            />
                        </View>
                    </View>

                    {/* Botón Guardar */}
                    <TouchableOpacity
                        style={[styles.btnGuardar, guardando && styles.btnGuardandoDisabled]}
                        onPress={handleGuardar}
                        disabled={guardando}
                    >
                        {guardando ? (
                            <ActivityIndicator size="small" color="white" />
                        ) : (
                            <>
                                <Ionicons name="flash" size={18} color="white" />
                                <Text style={styles.btnGuardarTexto}>Crear y Vender</Text>
                            </>
                        )}
                    </TouchableOpacity>
                    </View>
            </View>
        </Modal>
    );
};

const styles = StyleSheet.create({
    overlay: {
        width: SCREEN_WIDTH,
        height: SCREEN_HEIGHT + 100, // Margen extra para asegurar cobertura total
        backgroundColor: 'rgba(0, 0, 0, 0.5)',
        justifyContent: 'center',
        alignItems: 'center',
    },
    container: {
        width: '90%',
        backgroundColor: 'white',
        borderRadius: 20,
        padding: 20,
        paddingBottom: 30,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.3,
        shadowRadius: 10,
        elevation: 50, // Elevación super alta exclusiva para aislarlo
    },
    header: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: 20,
    },
    headerLeft: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 12,
    },
    iconCircle: {
        width: 40,
        height: 40,
        borderRadius: 20,
        backgroundColor: '#fef3c7',
        justifyContent: 'center',
        alignItems: 'center',
    },
    headerTitle: {
        fontSize: 18,
        fontWeight: '700',
        color: '#111827',
    },
    headerSubtitle: {
        fontSize: 12,
        color: '#6b7280',
        marginTop: 1,
    },
    closeBtn: {
        padding: 8,
    },
    formContainer: {
        gap: 14,
    },
    inputGroup: {
        gap: 6,
    },
    inputLabel: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
    },
    labelText: {
        fontSize: 13,
        fontWeight: '600',
        color: '#374151',
    },
    input: {
        backgroundColor: '#f9fafb',
        borderWidth: 1.5,
        borderColor: '#e5e7eb',
        borderRadius: 10,
        paddingHorizontal: 14,
        paddingVertical: 12,
        fontSize: 15,
        color: '#111827',
    },
    btnGuardar: {
        backgroundColor: '#f59e0b',
        borderRadius: 12,
        padding: 16,
        flexDirection: 'row',
        justifyContent: 'center',
        alignItems: 'center',
        gap: 8,
        marginTop: 20,
        shadowColor: '#f59e0b',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.3,
        shadowRadius: 8,
        elevation: 5,
    },
    btnGuardandoDisabled: {
        opacity: 0.7,
    },
    btnGuardarTexto: {
        color: 'white',
        fontSize: 16,
        fontWeight: '700',
    },
});

export default ClienteOcasionalModal;
