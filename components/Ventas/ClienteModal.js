import React, { useState, useEffect } from 'react';
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
    Platform,
    ActivityIndicator
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { guardarCliente } from '../../services/ventasService';
import { API_URL } from '../../config';

// Días de la semana
const DIAS_SEMANA = ['LUNES', 'MARTES', 'MIERCOLES', 'JUEVES', 'VIERNES', 'SABADO'];
const CACHE_KEY_RUTAS = 'rutas_cache_';

const ClienteModal = ({ visible, onClose, onClienteGuardado, vendedorId }) => {
    const [formData, setFormData] = useState({
        nombre: '',
        negocio: '',
        celular: '',
        direccion: '',
        tipoNegocio: '',  // 🆕 Tipo de negocio (Supermercado, Carnicería, etc.)
        diasVisita: [],
        rutaId: null
    });

    // Estado para rutas
    const [rutas, setRutas] = useState([]);
    const [cargandoRutas, setCargandoRutas] = useState(false);
    const [mostrarSelectorRuta, setMostrarSelectorRuta] = useState(false);
    const [guardando, setGuardando] = useState(false); // 🆕 Estado para deshabilitar botón
    const [sinConexionRutas, setSinConexionRutas] = useState(false);
    const [usandoRutasCache, setUsandoRutasCache] = useState(false);

    // Cargar rutas al abrir el modal
    useEffect(() => {
        if (visible) {
            cargarRutas();
        }
    }, [visible]);

    const cargarRutas = async () => {
        let cacheRutas = [];
        let timeoutId = null;
        try {
            setCargandoRutas(true);
            setSinConexionRutas(false);
            setUsandoRutasCache(false);

            const cacheKey = `${CACHE_KEY_RUTAS}${vendedorId || 'global'}`;

            // 1) Cargar caché primero para no bloquear UX offline
            const cacheRaw = await AsyncStorage.getItem(cacheKey);
            if (cacheRaw) {
                const parsed = JSON.parse(cacheRaw);
                if (Array.isArray(parsed?.rutas) && parsed.rutas.length > 0) {
                    cacheRutas = parsed.rutas;
                setRutas(parsed.rutas);
                setUsandoRutasCache(true);
            }
            }

            // Filtrar por vendedor si está disponible
            const url = vendedorId
                ? `${API_URL}/api/rutas/?vendedor=${vendedorId}`
                : `${API_URL}/api/rutas/`;

            const controller = new AbortController();
            timeoutId = setTimeout(() => controller.abort(), 10000);
            const response = await fetch(url, { signal: controller.signal });
            clearTimeout(timeoutId);
            timeoutId = null;
            const data = await response.json();
            setRutas(data);
            setUsandoRutasCache(false);

            // Guardar caché actualizado
            await AsyncStorage.setItem(
                cacheKey,
                JSON.stringify({ rutas: data, timestamp: Date.now() })
            );
        } catch (error) {
            // No bloquear la app: usar caché si existe
            if (cacheRutas.length > 0) {
                setSinConexionRutas(true);
                setUsandoRutasCache(true);
                console.log('⚠️ Sin internet para rutas, usando caché local');
            } else {
                setSinConexionRutas(true);
                setUsandoRutasCache(false);
                console.log('⚠️ No se pudieron cargar rutas (sin caché)');
            }
        } finally {
            if (timeoutId) {
                clearTimeout(timeoutId);
            }
            setCargandoRutas(false);
        }
    };

    const handleChange = (campo, valor) => {
        // Convertir a mayúsculas los campos de texto
        if (['nombre', 'negocio', 'direccion', 'tipoNegocio'].includes(campo)) {
            valor = valor.toUpperCase();
        }
        
        setFormData({
            ...formData,
            [campo]: valor
        });
    };

    // Toggle día de visita
    const toggleDia = (dia) => {
        const diasActuales = [...formData.diasVisita];
        const index = diasActuales.indexOf(dia);

        if (index > -1) {
            diasActuales.splice(index, 1);
        } else {
            diasActuales.push(dia);
        }

        // 🆕 Ordenar los días según el orden de la semana
        const diasOrdenados = diasActuales.sort((a, b) => {
            return DIAS_SEMANA.indexOf(a) - DIAS_SEMANA.indexOf(b);
        });

        handleChange('diasVisita', diasOrdenados);
    };

    // Seleccionar ruta
    const seleccionarRuta = (ruta) => {
        handleChange('rutaId', ruta.id);
        setMostrarSelectorRuta(false);
    };

    // Obtener nombre de ruta seleccionada
    const getRutaNombre = () => {
        if (!formData.rutaId) return null;
        const ruta = rutas.find(r => r.id === formData.rutaId);
        return ruta ? ruta.nombre : null;
    };

    const validarFormulario = () => {
        const faltantes = [];

        if (!formData.nombre.trim()) faltantes.push('Nombre del cliente');
        if (!formData.negocio.trim()) faltantes.push('Nombre del negocio');
        if (!formData.rutaId) faltantes.push('Ruta');
        if (!Array.isArray(formData.diasVisita) || formData.diasVisita.length === 0) {
            faltantes.push('Al menos 1 día de visita');
        }

        if (faltantes.length > 0) {
            const extraSinRuta = (!formData.rutaId && rutas.length === 0 && sinConexionRutas)
                ? '\n\nSin internet no se pudieron cargar rutas. Puedes seguir vendiendo normalmente.'
                : '';
            Alert.alert(
                'Campos obligatorios',
                `Faltan estos campos:\n• ${faltantes.join('\n• ')}${extraSinRuta}`
            );
            return false;
        }

        return true;
    };

    const formularioCompleto = (
        formData.nombre.trim().length > 0 &&
        formData.negocio.trim().length > 0 &&
        !!formData.rutaId &&
        Array.isArray(formData.diasVisita) &&
        formData.diasVisita.length > 0
    );

    const handleGuardar = async () => {
        if (!validarFormulario()) return;
        if (guardando) return; // Evitar doble clic

        try {
            setGuardando(true); // Deshabilitar botón
            
            // 🚀 OPTIMISTIC UPDATE - Crear cliente temporal inmediatamente
            const clienteTemporal = {
                id: `TEMP-${Date.now()}`,
                nombre: formData.nombre,
                negocio: formData.negocio,
                celular: formData.celular,
                direccion: formData.direccion,
                tipoNegocio: formData.tipoNegocio,
                diasVisita: formData.diasVisita,
                rutaId: formData.rutaId,
                activo: true,
                guardando: true // Flag para mostrar que está guardando
            };

            // ✅ Mostrar cliente inmediatamente (sin esperar al servidor)
            onClienteGuardado(clienteTemporal);
            limpiarFormulario();
            onClose();

            // 🔄 Guardar en servidor en segundo plano
            guardarCliente(formData)
                .then(nuevoCliente => {
                    console.log('✅ Cliente guardado en servidor:', nuevoCliente.id);
                    // Actualizar con el ID real del servidor
                    onClienteGuardado({ ...nuevoCliente, guardando: false });

                    Alert.alert(
                        'Cliente creado',
                        'Cliente creado y guardado en servidor correctamente.'
                    );
                })
                .catch(async (error) => {
                    console.log('⚠️ No se pudo guardar cliente en servidor (modo offline):', error?.message || error);
                    
                    // 🆕 Guardar en cola de sincronización pendiente
                    try {
                        const pendientes = JSON.parse(await AsyncStorage.getItem('clientes_pendientes') || '[]');
                        pendientes.push({
                            ...formData,
                            timestamp: Date.now(),
                            intentos: 0
                        });
                        await AsyncStorage.setItem('clientes_pendientes', JSON.stringify(pendientes));
                        console.log('📝 Cliente agregado a cola de sincronización');
                    } catch (queueError) {
                        console.log('⚠️ Error guardando cliente en cola local:', queueError?.message || queueError);
                    }
                    
                    // Notificar error pero no bloquear la UI
                    Alert.alert(
                        'Cliente creado (modo local)',
                        'Se guardó localmente y se sincronizará automáticamente cuando vuelva el internet.',
                        [{ text: 'OK' }]
                    );
                });

        } catch (error) {
            Alert.alert('Error', error.message || 'No se pudo guardar el cliente');
            console.error(error);
        } finally {
            setGuardando(false); // Rehabilitar botón
        }
    };

    const limpiarFormulario = () => {
        setFormData({
            nombre: '',
            negocio: '',
            celular: '',
            direccion: '',
            tipoNegocio: '',
            diasVisita: [],
            rutaId: null
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
                                placeholder="Ej: JUAN PÉREZ"
                                value={formData.nombre}
                                onChangeText={(valor) => handleChange('nombre', valor)}
                                autoCapitalize="characters"
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
                                placeholder="Ej: TIENDA EL SOL"
                                value={formData.negocio}
                                onChangeText={(valor) => handleChange('negocio', valor)}
                                autoCapitalize="characters"
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
                                placeholder="Ej: CALLE 123 #45-67"
                                value={formData.direccion}
                                onChangeText={(valor) => handleChange('direccion', valor)}
                                multiline
                                numberOfLines={3}
                                textAlignVertical="top"
                                autoCapitalize="characters"
                            />
                        </View>

                        {/* Tipo de Negocio */}
                        <View style={styles.campo}>
                            <Text style={styles.label}>Tipo de Negocio</Text>
                            <TextInput
                                style={styles.input}
                                placeholder="Ej: SUPERMERCADO, CARNICERÍA, PANADERÍA"
                                value={formData.tipoNegocio}
                                onChangeText={(valor) => handleChange('tipoNegocio', valor)}
                                autoCapitalize="characters"
                            />
                        </View>

                        {/* 🆕 Días de Visita */}
                        <View style={styles.campo}>
                            <Text style={styles.label}>
                                Días de Visita <Text style={styles.obligatorio}>*</Text>
                            </Text>
                            <View style={styles.diasContainer}>
                                {DIAS_SEMANA.map((dia) => (
                                    <TouchableOpacity
                                        key={dia}
                                        style={[
                                            styles.diaChip,
                                            formData.diasVisita.includes(dia) && styles.diaChipActivo
                                        ]}
                                        onPress={() => toggleDia(dia)}
                                    >
                                        <Text style={[
                                            styles.diaChipTexto,
                                            formData.diasVisita.includes(dia) && styles.diaChipTextoActivo
                                        ]}>
                                            {dia.substring(0, 3)}
                                        </Text>
                                    </TouchableOpacity>
                                ))}
                            </View>
                        </View>

                        {/* 🆕 Selector de Ruta */}
                        <View style={styles.campo}>
                            <Text style={styles.label}>
                                Ruta <Text style={styles.obligatorio}>*</Text>
                            </Text>
                            <TouchableOpacity
                                style={styles.selectorRuta}
                                onPress={() => setMostrarSelectorRuta(!mostrarSelectorRuta)}
                            >
                                <Ionicons name="map-outline" size={20} color="#666" />
                                <Text style={[
                                    styles.selectorRutaTexto,
                                    getRutaNombre() && styles.selectorRutaTextoActivo
                                ]}>
                                    {getRutaNombre() || 'Seleccionar ruta...'}
                                </Text>
                                <Ionicons
                                    name={mostrarSelectorRuta ? "chevron-up" : "chevron-down"}
                                    size={20}
                                    color="#666"
                                />
                            </TouchableOpacity>

                            {/* Lista de rutas */}
                            {mostrarSelectorRuta && (
                                <View style={styles.listaRutas}>
                                    {cargandoRutas ? (
                                        <View style={styles.cargandoRutas}>
                                            <ActivityIndicator size="small" color="#003d88" />
                                            <Text style={styles.cargandoRutasTexto}>Cargando rutas...</Text>
                                        </View>
                                    ) : rutas.length === 0 ? (
                                        <Text style={styles.sinRutas}>No hay rutas disponibles</Text>
                                    ) : (
                                        rutas.map((ruta) => (
                                            <TouchableOpacity
                                                key={ruta.id}
                                                style={[
                                                    styles.rutaItem,
                                                    formData.rutaId === ruta.id && styles.rutaItemActivo
                                                ]}
                                                onPress={() => seleccionarRuta(ruta)}
                                            >
                                                <Ionicons
                                                    name={formData.rutaId === ruta.id ? "checkmark-circle" : "ellipse-outline"}
                                                    size={20}
                                                    color={formData.rutaId === ruta.id ? "#003d88" : "#ccc"}
                                                />
                                                <Text style={[
                                                    styles.rutaItemTexto,
                                                    formData.rutaId === ruta.id && styles.rutaItemTextoActivo
                                                ]}>
                                                    {ruta.nombre}
                                                </Text>
                                            </TouchableOpacity>
                                        ))
                                    )}
                                </View>
                            )}

                            {sinConexionRutas && (
                                <View style={styles.avisoOfflineRutas}>
                                    <Ionicons name="cloud-offline-outline" size={16} color="#8a6d3b" />
                                    <Text style={styles.avisoOfflineRutasTexto}>
                                        {usandoRutasCache
                                            ? 'Sin internet: usando rutas locales guardadas.'
                                            : 'Sin internet: no hay rutas locales. Puedes seguir vendiendo.'}
                                    </Text>
                                </View>
                            )}
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
                        style={[
                            styles.btnGuardar,
                            (!formularioCompleto || guardando) && styles.btnGuardarDeshabilitado
                        ]}
                        onPress={handleGuardar}
                        disabled={guardando}
                    >
                        {guardando ? (
                            <ActivityIndicator size="small" color="white" />
                        ) : (
                            <Ionicons name="checkmark-circle" size={20} color="white" />
                        )}
                        <Text style={styles.btnGuardarTexto}>
                            {guardando ? 'Guardando...' : 'Guardar Cliente'}
                        </Text>
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
        paddingTop: Platform.OS === 'android' ? 30 : 36,
        paddingHorizontal: 15,
        paddingBottom: 10,
        borderBottomWidth: 1,
        borderBottomColor: '#e0e0e0',
    },
    btnCerrar: {
        padding: 5,
    },
    titulo: {
        fontSize: 18,
        fontWeight: 'bold',
        color: '#333',
    },
    scrollView: {
        flex: 1,
    },
    scrollContent: {
        padding: 14,
    },
    formulario: {
        backgroundColor: 'white',
        borderRadius: 10,
        padding: 16,
        elevation: 2,
    },
    campo: {
        marginBottom: 16,
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
    btnGuardarDeshabilitado: {
        backgroundColor: '#a5d6a7',
    },
    btnGuardarTexto: {
        fontSize: 16,
        fontWeight: 'bold',
        color: 'white',
        marginLeft: 8,
    },
    // 🆕 Estilos para días de visita
    diasContainer: {
        flexDirection: 'row',
        flexWrap: 'wrap',
        gap: 8,
    },
    diaChip: {
        paddingHorizontal: 14,
        paddingVertical: 8,
        borderRadius: 20,
        backgroundColor: '#f0f0f0',
        borderWidth: 1,
        borderColor: '#ddd',
    },
    diaChipActivo: {
        backgroundColor: '#003d88',
        borderColor: '#003d88',
    },
    diaChipTexto: {
        fontSize: 12,
        fontWeight: '600',
        color: '#666',
    },
    diaChipTextoActivo: {
        color: 'white',
    },
    // 🆕 Estilos para selector de ruta
    selectorRuta: {
        flexDirection: 'row',
        alignItems: 'center',
        borderWidth: 1,
        borderColor: '#ccc',
        borderRadius: 8,
        padding: 12,
        backgroundColor: 'white',
        gap: 10,
    },
    selectorRutaTexto: {
        flex: 1,
        fontSize: 16,
        color: '#999',
    },
    selectorRutaTextoActivo: {
        color: '#333',
    },
    listaRutas: {
        borderWidth: 1,
        borderColor: '#e0e0e0',
        borderRadius: 8,
        marginTop: 8,
        backgroundColor: 'white',
        overflow: 'hidden',
    },
    cargandoRutas: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 15,
        gap: 10,
    },
    cargandoRutasTexto: {
        color: '#666',
        fontSize: 14,
    },
    sinRutas: {
        padding: 15,
        textAlign: 'center',
        color: '#999',
        fontSize: 14,
    },
    rutaItem: {
        flexDirection: 'row',
        alignItems: 'center',
        padding: 12,
        borderBottomWidth: 1,
        borderBottomColor: '#f0f0f0',
        gap: 10,
    },
    rutaItemActivo: {
        backgroundColor: '#e8f4fc',
    },
    rutaItemTexto: {
        fontSize: 15,
        color: '#333',
    },
    rutaItemTextoActivo: {
        fontWeight: '600',
        color: '#003d88',
    },
    avisoOfflineRutas: {
        flexDirection: 'row',
        alignItems: 'center',
        marginTop: 8,
        backgroundColor: '#fff7e6',
        borderWidth: 1,
        borderColor: '#ffe0b2',
        borderRadius: 8,
        paddingHorizontal: 10,
        paddingVertical: 8,
    },
    avisoOfflineRutasTexto: {
        marginLeft: 6,
        color: '#8a6d3b',
        fontSize: 12,
        flex: 1,
    },
});

export default ClienteModal;
