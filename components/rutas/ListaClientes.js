import React, { useState, useEffect, useRef } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, FlatList, Linking, Alert, ActivityIndicator, Vibration, Modal, Animated } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import NetInfo from '@react-native-community/netinfo';
import { obtenerClientesPorRutaYDia, marcarClienteVisitado, limpiarTodasLasVisitas } from '../../services/sheetsService';
import { Ionicons } from '@expo/vector-icons';

const ListaClientes = ({ route, navigation }) => {
  const { ruta, rutaNombre, dia } = route.params;
  const [clientes, setClientes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [modalVisible, setModalVisible] = useState(false);
  const [clienteSeleccionado, setClienteSeleccionado] = useState(null);
  const [isConnected, setIsConnected] = useState(true);
  const spinValue = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    cargarClientes();
    
    // Monitorear conexión a internet
    const unsubscribe = NetInfo.addEventListener(state => {
      setIsConnected(state.isConnected);
      
      // Si se reconecta, sincronizar pendientes
      if (state.isConnected) {
        sincronizarPendientes();
      }
    });
    
    return () => unsubscribe();
  }, []);

  const cargarClientes = async (forzarRecarga = false) => {
    try {
      const nombreRutaCompleto = rutaNombre || ruta;
      const { userId } = route.params;
      // Incluir userId en la clave de caché para que cada usuario tenga su propio caché
      const cacheKey = `clientes_${userId}_${nombreRutaCompleto}_${dia}`;
      
      // 1. Si no es recarga forzada, intentar cargar desde caché primero (RÁPIDO)
      if (!forzarRecarga) {
        try {
          const clientesCache = await AsyncStorage.getItem(cacheKey);
          if (clientesCache) {
            const clientesCacheados = JSON.parse(clientesCache);
            setClientes(clientesCacheados);
            setLoading(false);
            return;
          }
        } catch (cacheError) {
          // Caché no disponible, continuar con carga desde Sheets
        }
      }

      // 2. Cargar desde Sheets
      const clientesObtenidos = await obtenerClientesPorRutaYDia(nombreRutaCompleto, dia);
      setClientes(clientesObtenidos);
      
      // 3. Guardar en caché para la próxima vez
      await AsyncStorage.setItem(cacheKey, JSON.stringify(clientesObtenidos));
      
    } catch (error) {
      console.error('Error al cargar clientes:', error);
      Alert.alert('Error', 'No se pudieron cargar los clientes');
    } finally {
      setLoading(false);
    }
  };

  const sincronizarPendientes = async () => {
    try {
      const { userId } = route.params;
      const nombreRutaCompleto = rutaNombre || ruta;
      const pendientesKey = `pendientes_${userId}_${nombreRutaCompleto}_${dia}`;
      
      const pendientesStr = await AsyncStorage.getItem(pendientesKey);
      if (!pendientesStr) return;
      
      const pendientes = JSON.parse(pendientesStr);
      
      // Sincronizar cada pendiente
      for (const pendiente of pendientes) {
        await marcarClienteVisitado(nombreRutaCompleto, pendiente.orden, true);
      }
      
      // Limpiar pendientes
      await AsyncStorage.removeItem(pendientesKey);
      console.log('✅ Sincronización completada');
    } catch (error) {
      console.error('Error al sincronizar pendientes:', error);
    }
  };

  const marcarVisitado = async (cliente) => {
    // Si ya está visitado, no hacer nada
    if (cliente.visitado) {
      return;
    }

    // Vibración inmediata para feedback
    Vibration.vibrate(50);

    // Optimistic update - actualizar UI inmediatamente ANTES de cualquier otra cosa
    const clientesActualizados = clientes.map(c => 
      c.orden === cliente.orden ? { ...c, visitado: true } : c
    );
    setClientes([...clientesActualizados]); // Forzar nueva referencia de array

    // Guardar en caché local inmediatamente
    const nombreRutaCompleto = rutaNombre || ruta;
    const { userId } = route.params;
    const cacheKey = `clientes_${userId}_${nombreRutaCompleto}_${dia}`;
    const pendientesKey = `pendientes_${userId}_${nombreRutaCompleto}_${dia}`;
    
    try {
      await AsyncStorage.setItem(cacheKey, JSON.stringify(clientesActualizados));
    } catch (error) {
      console.error('Error al guardar en caché:', error);
    }

    // Si no hay internet, guardar como pendiente
    if (!isConnected) {
      try {
        const pendientesStr = await AsyncStorage.getItem(pendientesKey);
        const pendientes = pendientesStr ? JSON.parse(pendientesStr) : [];
        pendientes.push({ orden: cliente.orden, timestamp: new Date().toISOString() });
        await AsyncStorage.setItem(pendientesKey, JSON.stringify(pendientes));
        // No mostrar error, se sincronizará automáticamente
      } catch (error) {
        console.error('Error al guardar pendiente:', error);
      }
      return;
    }

    // Enviar a Google Sheets en segundo plano
    try {
      const resultado = await marcarClienteVisitado(
        nombreRutaCompleto, 
        cliente.orden, 
        true
      );

      if (!resultado.success) {
        // Si falla, guardar como pendiente
        const pendientesStr = await AsyncStorage.getItem(pendientesKey);
        const pendientes = pendientesStr ? JSON.parse(pendientesStr) : [];
        pendientes.push({ orden: cliente.orden, timestamp: new Date().toISOString() });
        await AsyncStorage.setItem(pendientesKey, JSON.stringify(pendientes));
      }
    } catch (error) {
      console.error('Error al marcar visitado:', error);
      // Guardar como pendiente
      const pendientesStr = await AsyncStorage.getItem(pendientesKey);
      const pendientes = pendientesStr ? JSON.parse(pendientesStr) : [];
      pendientes.push({ orden: cliente.orden, timestamp: new Date().toISOString() });
      await AsyncStorage.setItem(pendientesKey, JSON.stringify(pendientes));
    }
  };

  const navegarDireccion = (cliente) => {
    // Prioridad: DIRECCION, luego COORDENADAS
    let url;
    
    if (cliente.direccion && cliente.direccion.trim() !== '') {
      // Usar dirección
      url = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(cliente.direccion)}`;
    } else if (cliente.coordenadas && cliente.coordenadas.trim() !== '') {
      // Usar coordenadas como fallback
      url = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(cliente.coordenadas)}`;
    } else {
      Alert.alert('Error', 'No hay dirección ni coordenadas disponibles para este cliente');
      return;
    }

    Linking.openURL(url).catch(() => {
      Alert.alert('Error', 'No se pudo abrir Google Maps');
    });
  };

  const limpiarTodo = () => {
    // Verificar conexión primero
    if (!isConnected) {
      Alert.alert('Sin Internet', 'Necesitas conexión a internet para limpiar las visitas.');
      return;
    }
    
    Alert.alert(
      'Limpiar Todas las Visitas',
      '¿Estás seguro? Esto limpiará visitas de esta ruta.',
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Limpiar Todo',
          style: 'destructive',
          onPress: async () => {
            try {
              setRefreshing(true);
              const nombreRutaCompleto = rutaNombre || ruta;
              const resultado = await limpiarTodasLasVisitas(nombreRutaCompleto);
              
              if (resultado.success) {
                // Recargar clientes desde Sheets (forzar recarga)
                await cargarClientes(true);
                Alert.alert('Éxito', 'Todas las visitas han sido limpiadas');
              } else {
                Alert.alert('Sin Internet', 'No se pudieron limpiar las visitas. Verifica tu conexión.');
              }
            } catch (error) {
              console.error('Error al limpiar visitas:', error);
              Alert.alert('Sin Internet', 'No se pudieron limpiar las visitas. Verifica tu conexión.');
            } finally {
              setRefreshing(false);
            }
          },
        },
      ]
    );
  };

  if (loading) {
    return (
      <View style={styles.container}>
        <View style={styles.loadingFullScreen}>
          <View style={styles.loadingCard}>
            <Ionicons name="people" size={70} color="#003d82" style={styles.loadingIcon} />
            <ActivityIndicator size="large" color="#003d82" style={styles.loadingSpinner} />
            <Text style={styles.loadingTitle}>Cargando Clientes</Text>
            <Text style={styles.loadingSubtitle}>Obteniendo información de la ruta...</Text>
          </View>
        </View>
      </View>
    );
  }

  const refrescarClientes = async () => {
    setRefreshing(true);
    
    // Animación de rotación continua más rápida
    Animated.loop(
      Animated.timing(spinValue, {
        toValue: 1,
        duration: 500,
        useNativeDriver: true,
      })
    ).start();
    
    await cargarClientes(true); // Forzar recarga desde Sheets
    
    // Detener animación
    spinValue.setValue(0);
    setRefreshing(false);
  };

  // Interpolación para la rotación
  const spin = spinValue.interpolate({
    inputRange: [0, 1],
    outputRange: ['0deg', '360deg'],
  });

  const abrirModalNotas = (cliente) => {
    setClienteSeleccionado(cliente);
    setModalVisible(true);
  };

  const cerrarModalNotas = () => {
    setModalVisible(false);
    setTimeout(() => setClienteSeleccionado(null), 200); // Delay para animación
  };

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <View style={styles.headerTop}>
          <TouchableOpacity 
            style={styles.backButton}
            onPress={() => navigation.goBack()}
          >
            <Ionicons name="arrow-back" size={24} color="#003d82" />
          </TouchableOpacity>
          <View style={styles.headerTexts}>
            <Text style={styles.title}>Lista de Clientes</Text>
            <Text style={styles.subtitle}>
              {clientes.length} cliente{clientes.length !== 1 ? 's' : ''} para hoy
            </Text>
          </View>
          <TouchableOpacity 
            style={styles.botonRefrescar} 
            onPress={refrescarClientes}
            disabled={refreshing}
          >
            {refreshing ? (
              <Animated.View style={[styles.miniLoader, { transform: [{ rotate: spin }] }]}>
                <View style={styles.miniLoaderSegmentDark} />
                <View style={styles.miniLoaderSegmentLight} />
              </Animated.View>
            ) : (
              <Ionicons name="refresh" size={24} color="#003d82" />
            )}
          </TouchableOpacity>
        </View>
      </View>

      <FlatList
        data={clientes}
        keyExtractor={(item) => item.orden?.toString() || Math.random().toString()}
        contentContainerStyle={styles.scrollContent}
        initialNumToRender={15}
        maxToRenderPerBatch={10}
        windowSize={15}
        removeClippedSubviews={true}
        updateCellsBatchingPeriod={50}
        ListEmptyComponent={
          !loading && (
            <View style={styles.emptyContainer}>
              <Text style={styles.emptyText}>
                No hay clientes para este día
              </Text>
            </View>
          )
        }
        ListFooterComponent={
          clientes.length > 0 && (
            <TouchableOpacity 
              style={[styles.botonLimpiar, refreshing && styles.botonLimpiarDisabled]} 
              onPress={limpiarTodo}
              disabled={refreshing}
            >
              {refreshing ? (
                <ActivityIndicator size="small" color="white" />
              ) : (
                <Text style={styles.botonLimpiarTexto}>Limpiar Todo</Text>
              )}
            </TouchableOpacity>
          )
        }
        ListFooterComponentStyle={styles.listFooter}
        onScrollBeginDrag={() => setRefreshing(false)}
        renderItem={({ item: cliente }) => {
          const estaVisitado = cliente.visitado;
          
          // Skeleton loader mientras se renderiza
          if (!cliente || !cliente.orden) {
            return (
              <View style={[styles.clienteCard, styles.skeletonCard]}>
                <View style={styles.skeletonLine} />
                <View style={styles.skeletonLineShort} />
              </View>
            );
          }
          
          return (
            <View style={styles.clienteCard}>
              <View style={styles.clienteHeader}>
                <View style={styles.clienteInfo}>
                  <View style={styles.estadoContainer}>
                    <View
                      style={[
                        styles.estadoCirculo,
                        estaVisitado && styles.estadoCirculoVisitado,
                      ]}
                    >
                      <Text style={[
                        styles.ordenTexto,
                        estaVisitado && styles.ordenTextoVisitado
                      ]}>
                        {cliente.orden}
                      </Text>
                    </View>
                    <Text style={styles.clienteNombre}>{cliente.cliente}</Text>
                  </View>
                  <Text style={styles.clienteTipo}>{cliente.tipoNegocio}</Text>
                </View>
              </View>

              <View style={styles.clienteDetalles}>
                <Text style={styles.detalle}>📍 {cliente.direccion || cliente.coordenadas || 'Sin dirección'}</Text>
                <Text style={styles.detalle}>📞 {cliente.telefono || 'Sin teléfono'}</Text>
                {cliente.notas && cliente.notas.trim() !== '' && (
                  <TouchableOpacity 
                    style={styles.botonNotas}
                    onPress={() => abrirModalNotas(cliente)}
                  >
                    <Ionicons name="document-text-outline" size={16} color="#003d82" />
                    <Text style={styles.botonNotasTexto}>Ver Notas</Text>
                  </TouchableOpacity>
                )}
              </View>

              <View style={styles.botonesContainer}>
                <TouchableOpacity
                  style={[
                    styles.botonMarcar,
                    estaVisitado && styles.botonVisitado,
                  ]}
                  onPress={() => !estaVisitado && marcarVisitado(cliente)}
                  disabled={estaVisitado}
                >
                  <Text style={styles.botonTexto}>
                    {estaVisitado ? '✓ Visitado' : 'Marcar'}
                  </Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={styles.botonNavegar}
                  onPress={() => navegarDireccion(cliente)}
                >
                  <Text style={styles.botonTexto}>Navegar</Text>
                </TouchableOpacity>
              </View>
            </View>
          );
        }}
      />

      {/* Modal de Notas */}
      <Modal
        animationType="fade"
        transparent={true}
        visible={modalVisible}
        onRequestClose={cerrarModalNotas}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContainer}>
            <View style={styles.modalHeader}>
              <Ionicons name="document-text" size={24} color="#003d82" />
              <Text style={styles.modalTitle}>Notas del Cliente</Text>
              <TouchableOpacity onPress={cerrarModalNotas}>
                <Ionicons name="close-circle" size={28} color="#666" />
              </TouchableOpacity>
            </View>
            
            {clienteSeleccionado && (
              <View style={styles.modalContent}>
                <Text style={styles.modalClienteNombre}>
                  {clienteSeleccionado.cliente}
                </Text>
                <View style={styles.modalNotasContainer}>
                  <Text style={styles.modalNotasTexto}>
                    {clienteSeleccionado.notas || 'Sin notas'}
                  </Text>
                </View>
              </View>
            )}
            
            <TouchableOpacity 
              style={styles.modalBotonCerrar}
              onPress={cerrarModalNotas}
            >
              <Text style={styles.modalBotonCerrarTexto}>Cerrar</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f5f5f5',
  },
  header: {
    backgroundColor: 'white',
    padding: 20,
    marginTop: 25,
    borderBottomWidth: 1,
    borderBottomColor: '#e0e0e0',
  },
  headerTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  backButton: {
    marginRight: 15,
    padding: 5,
  },
  headerTexts: {
    flex: 1,
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#003d82',
    marginBottom: 5,
  },
  subtitle: {
    fontSize: 14,
    color: '#666',
  },
  botonRefrescar: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: 'white',
    justifyContent: 'center',
    alignItems: 'center',
    marginLeft: 10,
  },
  miniLoader: {
    width: 24,
    height: 24,
    borderRadius: 12,
    position: 'relative',
  },
  miniLoaderSegmentDark: {
    position: 'absolute',
    width: 24,
    height: 24,
    borderRadius: 12,
    borderWidth: 3,
    borderColor: 'transparent',
    borderTopColor: '#003d82',
    borderLeftColor: '#003d82',
  },
  miniLoaderSegmentLight: {
    position: 'absolute',
    width: 24,
    height: 24,
    borderRadius: 12,
    borderWidth: 3,
    borderColor: 'transparent',
    borderBottomColor: '#d0d0d0',
    borderRightColor: '#d0d0d0',
  },
  scrollContent: {
    padding: 20,
    paddingBottom: 70,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingFullScreen: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#f5f5f5',
  },
  loadingCard: {
    backgroundColor: 'white',
    borderRadius: 20,
    padding: 40,
    alignItems: 'center',
    elevation: 5,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 4,
    width: '80%',
  },
  loadingIcon: {
    marginBottom: 20,
  },
  loadingSpinner: {
    marginVertical: 15,
  },
  loadingTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#003d82',
    marginTop: 10,
    marginBottom: 5,
  },
  loadingSubtitle: {
    fontSize: 14,
    color: '#666',
    textAlign: 'center',
  },
  clienteCard: {
    backgroundColor: 'white',
    borderRadius: 10,
    padding: 15,
    marginBottom: 15,
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
  },
  clienteHeader: {
    marginBottom: 10,
  },
  clienteInfo: {
    flex: 1,
  },
  estadoContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 5,
  },
  estadoCirculo: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#6c757d',
    marginRight: 10,
    justifyContent: 'center',
    alignItems: 'center',
  },
  estadoCirculoVisitado: {
    backgroundColor: '#28a745',
  },
  ordenTexto: {
    fontSize: 16,
    fontWeight: 'bold',
    color: 'white',
  },
  ordenTextoVisitado: {
    color: 'white',
  },
  clienteNombre: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#333',
    flex: 1,
  },
  botonNotas: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#f0f8ff',
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 8,
    marginTop: 8,
    alignSelf: 'flex-start',
    borderWidth: 1,
    borderColor: '#003d82',
  },
  botonNotasTexto: {
    fontSize: 14,
    color: '#003d82',
    fontWeight: '600',
    marginLeft: 5,
  },
  clienteTipo: {
    fontSize: 14,
    color: '#666',
    marginLeft: 22,
  },
  clienteDetalles: {
    marginBottom: 15,
  },
  detalle: {
    fontSize: 14,
    color: '#555',
    marginBottom: 5,
  },
  botonesContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  botonMarcar: {
    flex: 1,
    backgroundColor: '#003d82',
    padding: 12,
    borderRadius: 8,
    marginRight: 10,
    alignItems: 'center',
  },
  botonVisitado: {
    backgroundColor: '#28a745',
  },
  botonNavegar: {
    flex: 1,
    backgroundColor: '#003d82',
    padding: 12,
    borderRadius: 8,
    alignItems: 'center',
  },
  botonTexto: {
    color: 'white',
    fontWeight: 'bold',
    fontSize: 14,
  },
  botonLimpiar: {
    backgroundColor: '#dc3545',
    padding: 15,
    borderRadius: 10,
    alignItems: 'center',
    marginTop: 10,
    minHeight: 50,
    justifyContent: 'center',
  },
  botonLimpiarDisabled: {
    opacity: 0.6,
  },
  botonLimpiarTexto: {
    color: 'white',
    fontWeight: 'bold',
    fontSize: 16,
  },
  emptyContainer: {
    padding: 40,
    alignItems: 'center',
  },
  emptyText: {
    fontSize: 16,
    color: '#999',
  },
  // Skeleton Loader
  skeletonCard: {
    backgroundColor: '#f0f0f0',
    opacity: 0.6,
  },
  skeletonLine: {
    height: 20,
    backgroundColor: '#e0e0e0',
    borderRadius: 4,
    marginBottom: 10,
    width: '80%',
  },
  skeletonLineShort: {
    height: 15,
    backgroundColor: '#e0e0e0',
    borderRadius: 4,
    width: '60%',
  },
  listFooter: {
    paddingBottom: 20,
  },
  // Estilos del Modal
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalContainer: {
    backgroundColor: 'white',
    borderRadius: 20,
    padding: 20,
    width: '85%',
    maxHeight: '70%',
    elevation: 5,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 4,
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 20,
    paddingBottom: 15,
    borderBottomWidth: 2,
    borderBottomColor: '#003d82',
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#003d82',
    flex: 1,
    marginLeft: 10,
  },
  modalContent: {
    marginBottom: 20,
  },
  modalClienteNombre: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#333',
    marginBottom: 15,
    textAlign: 'center',
  },
  modalNotasContainer: {
    backgroundColor: '#f8f9fa',
    borderRadius: 10,
    padding: 15,
    minHeight: 100,
    borderWidth: 1,
    borderColor: '#e0e0e0',
  },
  modalNotasTexto: {
    fontSize: 16,
    color: '#555',
    lineHeight: 24,
  },
  modalBotonCerrar: {
    backgroundColor: '#003d82',
    paddingVertical: 12,
    borderRadius: 10,
    alignItems: 'center',
  },
  modalBotonCerrarTexto: {
    color: 'white',
    fontSize: 16,
    fontWeight: 'bold',
  },
});

export default ListaClientes;
