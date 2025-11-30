import React, { useState, useEffect } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ScrollView, ActivityIndicator } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { obtenerRutasPorUsuario } from '../../services/rutasApiService';
import { Ionicons } from '@expo/vector-icons';

const SeleccionarRuta = ({ navigation, route, userId: propUserId }) => {
  const [rutas, setRutas] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // Obtener userId de props o de los parámetros de navegación
  const userId = propUserId || route.params?.userId || 'ID1';

  useEffect(() => {
    cargarRutas();
  }, []);

  const cargarRutas = async () => {
    try {
      setLoading(true);
      setError(null);

      // Usar el userId directamente (ya viene como "ID1", "ID2", etc.)
      console.log('SeleccionarRuta - userId recibido:', userId);
      
      // Obtener rutas desde el backend
      const rutasObtenidas = await obtenerRutasPorUsuario(userId);

      setRutas(rutasObtenidas);

      if (rutasObtenidas.length === 0) {
        setError('No tienes rutas asignadas todavía.');
      }
    } catch (err) {
      console.error('Error al cargar rutas:', err);
      setError('Error al cargar las rutas. Intenta de nuevo.');
    } finally {
      setLoading(false);
    }
  };

  const handleSeleccionarRuta = async (ruta) => {
    try {
      await AsyncStorage.setItem('rutaSeleccionada', ruta.id.toString());
      await AsyncStorage.setItem('rutaNombre', ruta.nombre);
      navigation.navigate('SeleccionarDia', {
        ruta: ruta.id,
        rutaNombre: ruta.nombre,
        userId: userId // Pasar el userId completo (ID1, ID2, etc.)
      });
    } catch (error) {
      console.error('Error al guardar la ruta:', error);
    }
  };

  if (loading) {
    return (
      <View style={styles.container}>
        <View style={styles.loadingFullScreen}>
          <View style={styles.loadingCard}>
            <Ionicons name="map-outline" size={70} color="#003d82" style={styles.loadingIcon} />
            <ActivityIndicator size="large" color="#003d82" style={styles.loadingSpinner} />
            <Text style={styles.loadingTitle}>Cargando Rutas</Text>
            <Text style={styles.loadingSubtitle}>Buscando tus rutas disponibles...</Text>
          </View>
        </View>
      </View>
    );
  }

  if (error) {
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
              <Text style={styles.title}>Selecciona una Ruta</Text>
            </View>
          </View>
        </View>
        <View style={styles.emptyContainer}>
          <Text style={styles.emptyText}>{error}</Text>
          <TouchableOpacity style={styles.retryButton} onPress={cargarRutas}>
            <Text style={styles.retryButtonText}>Reintentar</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

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
            <Text style={styles.title}>Selecciona una Ruta</Text>
            <Text style={styles.subtitle}>
              {rutas.length} ruta{rutas.length !== 1 ? 's' : ''} disponible{rutas.length !== 1 ? 's' : ''}
            </Text>
          </View>
        </View>
      </View>

      <ScrollView contentContainerStyle={styles.scrollContent}>
        {rutas.map((ruta) => (
          <TouchableOpacity
            key={ruta.id}
            style={styles.rutaCard}
            onPress={() => handleSeleccionarRuta(ruta)}
          >
            <Text style={styles.rutaNombre}>{ruta.nombre}</Text>
          </TouchableOpacity>
        ))}
      </ScrollView>
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
  scrollContent: {
    padding: 20,
  },
  rutaCard: {
    backgroundColor: 'white',
    padding: 20,
    borderRadius: 10,
    marginBottom: 15,
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
    borderWidth: 1,
    borderColor: '#e0e0e0',
  },
  rutaNombre: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#333',
    textAlign: 'center',
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
    fontSize: 22,
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
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 40,
  },
  emptyText: {
    fontSize: 16,
    color: '#666',
    textAlign: 'center',
    marginBottom: 20,
  },
  retryButton: {
    backgroundColor: '#003d82',
    paddingVertical: 12,
    paddingHorizontal: 30,
    borderRadius: 8,
  },
  retryButtonText: {
    color: 'white',
    fontSize: 16,
    fontWeight: 'bold',
  },
});

export default SeleccionarRuta;
