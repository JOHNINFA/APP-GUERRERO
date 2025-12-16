import React, { useEffect, useState } from 'react';
import { FlatList, Text, TouchableOpacity, View, StyleSheet, ActivityIndicator, Alert } from 'react-native';
import DateTimePicker from '@react-native-community/datetimepicker';
import Navbar from './Navbar';
import { API_URL } from '../config';
import { obtenerProductos, sincronizarProductos } from '../services/ventasService';

// Mapeo de días en español
const diasSemana = {
  0: 'Domingo',
  1: 'Lunes',
  2: 'Martes',
  3: 'Miércoles',
  4: 'Jueves',
  5: 'Viernes',
  6: 'Sábado'
};

const Vencidas = ({ userId }) => {
  const [selectedDay, setSelectedDay] = useState(null);
  const [selectedDate, setSelectedDate] = useState(new Date());
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [quantities, setQuantities] = useState({});
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  
  // 🆕 Estado para productos dinámicos desde el servidor
  const [orderOfProducts, setOrderOfProducts] = useState([]);

  // 🆕 Cargar productos al montar el componente (con sincronización automática)
  useEffect(() => {
    const inicializar = async () => {
      // Primero cargar desde caché
      await cargarProductos();
      // Luego sincronizar en segundo plano
      sincronizarProductosAutomatico();
    };
    inicializar();
  }, []);

  // 🆕 Sincronizar productos automáticamente (sin bloquear UI)
  const sincronizarProductosAutomatico = async () => {
    try {
      console.log('🔄 Sincronizando productos en segundo plano...');
      await sincronizarProductos();
      await cargarProductos();
      console.log('✅ Productos sincronizados automáticamente');
    } catch (error) {
      console.warn('⚠️ No se pudo sincronizar (modo offline):', error.message);
    }
  };

  // 🆕 Cargar productos desde el servicio
  const cargarProductos = async () => {
    try {
      console.log('📦 Cargando productos para Rendimiento...');
      const productosData = obtenerProductos();
      
      // Filtrar y extraer solo los nombres
      const nombresProductos = productosData
        .filter(p => p.nombre && p.disponible_app_rendimiento !== false) // Filtrar por disponible_app_rendimiento
        .map(p => p.nombre);
      
      console.log(`✅ ${nombresProductos.length} productos cargados para Rendimiento (filtrados por disponible_app_rendimiento)`);
      setOrderOfProducts(nombresProductos);
    } catch (error) {
      console.error('❌ Error cargando productos:', error);
      Alert.alert('Error', 'No se pudieron cargar los productos');
    }
  };



  // Formatear fecha para mostrar
  const formatDateDisplay = (date) => {
    const day = date.getDate().toString().padStart(2, '0');
    const month = (date.getMonth() + 1).toString().padStart(2, '0');
    const year = date.getFullYear();
    return `${day}/${month}/${year}`;
  };

  // Formatear fecha para API (YYYY-MM-DD)
  const formatDateAPI = (date) => {
    const day = date.getDate().toString().padStart(2, '0');
    const month = (date.getMonth() + 1).toString().padStart(2, '0');
    const year = date.getFullYear();
    return `${year}-${month}-${day}`;
  };

  // Obtener datos del servidor Django
  useEffect(() => {
    if (selectedDay) {
      setLoading(true);
      setError(null);
      
      const fechaFormateada = formatDateAPI(selectedDate);
      // Normalizar día: convertir a mayúsculas y quitar tildes
      const diaNormalizado = selectedDay
        .toUpperCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '');
      const url = `${API_URL}/api/rendimiento-cargue/?dia=${encodeURIComponent(diaNormalizado)}&fecha=${fechaFormateada}`;
      

      
      fetch(url)
        .then(response => {
          if (!response.ok) {
            throw new Error('Error en la red');
          }
          return response.json();
        })
        .then(data => {
          if (data.success) {
            // Convertir array a objeto indexado por nombre de producto
            const quantitiesObj = {};
            data.data.forEach(item => {
              quantitiesObj[item.producto] = {
                vencidas: item.vencidas || 0,
                devoluciones: item.devoluciones || 0,
                total: item.total || 0
              };
            });
            setQuantities(quantitiesObj);
          } else {
            setError(data.error || 'Error al cargar datos');
          }
          setLoading(false);
        })
        .catch(error => {
          console.error('Error al obtener datos:', error);
          setError('Error de conexión con el servidor');
          setLoading(false);
        });
    }
  }, [selectedDay, selectedDate]);

  // Manejar cambio de fecha
  const onDateChange = (event, date) => {
    setShowDatePicker(false);
    if (date) {
      setSelectedDate(date);
      // Actualizar el día seleccionado basado en la fecha
      const diaSemana = diasSemana[date.getDay()];
      setSelectedDay(diaSemana);
    }
  };

  // Manejar selección de día desde Navbar
  const handleDaySelected = (day) => {
    setSelectedDay(day);
  };

  const renderItem = ({ item }) => {
    const vencidas = quantities[item]?.vencidas || 0;
    const devoluciones = quantities[item]?.devoluciones || 0;
    const total = quantities[item]?.total || 0;

    return (
      <View style={styles.productContainer}>
        <TouchableOpacity style={styles.productButton}>
          <Text style={styles.productName}>{item}</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.quantityButton}>
          <Text style={styles.quantityText}>{vencidas}</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.quantityButton}>
          <Text style={styles.quantityText}>{devoluciones}</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.quantityButton}>
          <Text style={styles.quantityText}>{total}</Text>
        </TouchableOpacity>
      </View>
    );
  };

  return (
    <View style={styles.container}>
      {/* Navbar con selección de días */}
      <View style={styles.navbarWrapper}>
        <Navbar selectedDay={selectedDay} onDaySelected={handleDaySelected} />
      </View>

      {/* Selector de fecha */}
      <TouchableOpacity 
        style={styles.dateSelector}
        onPress={() => setShowDatePicker(true)}
      >
        <Text style={styles.dateSelectorText}>
          📅 Fecha: {formatDateDisplay(selectedDate)}
        </Text>
      </TouchableOpacity>

      {showDatePicker && (
        <DateTimePicker
          value={selectedDate}
          mode="date"
          display="default"
          onChange={onDateChange}
        />
      )}

      <View style={styles.contentContainer}>
        {/* Títulos de columnas fijos */}
        <View style={styles.headerRow}>
          <Text style={[styles.headerText, styles.productHeader]}>PRODUCTO</Text>
          <Text style={[styles.headerText, styles.vencidasHeader]}>VENCIDAS</Text>
          <Text style={[styles.headerText, styles.devolucionHeader]}>DEVOLUC.</Text>
          <Text style={[styles.headerText, styles.totalHeader]}>TOTAL</Text>
        </View>

        {orderOfProducts.length === 0 && (
          <View style={styles.loadingContainer}>
            <ActivityIndicator size="large" color="green" />
            <Text style={styles.loadingText}>Cargando productos...</Text>
          </View>
        )}

        {!selectedDay && orderOfProducts.length > 0 && (
          <Text style={styles.alertText}>Por favor, seleccione un día para ver el rendimiento.</Text>
        )}

        {loading && (
          <View style={styles.loadingContainer}>
            <ActivityIndicator size="large" color="green" />
            <Text style={styles.loadingText}>Cargando datos...</Text>
          </View>
        )}

        {error && (
          <Text style={styles.errorText}>{error}</Text>
        )}

        {selectedDay && !loading && !error && orderOfProducts.length > 0 && (
          <FlatList
            data={orderOfProducts}
            renderItem={renderItem}
            keyExtractor={(item) => item}
            contentContainerStyle={styles.scrollViewContent}
          />
        )}
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f5f5f5',
  },
  navbarWrapper: {
    marginTop: 0,
    zIndex: 10,
  },
  dateSelector: {
    backgroundColor: 'white',
    padding: 12,
    marginHorizontal: 20,
    marginVertical: 10,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: 'green',
    alignItems: 'center',
  },
  dateSelectorText: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#333',
  },
  contentContainer: {
    flex: 1,
  },
  scrollViewContent: {
    padding: 20,
  },
  alertText: {
    color: 'red',
    textAlign: 'center',
    marginBottom: 20,
    marginTop: 20,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 50,
  },
  loadingText: {
    marginTop: 10,
    color: '#666',
  },
  errorText: {
    color: 'red',
    textAlign: 'center',
    marginTop: 20,
    fontSize: 14,
  },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderBottomWidth: 1,
    borderBottomColor: '#ddd',
    paddingBottom: 5,
    marginBottom: 3,
    backgroundColor: '#f5f5f5',
    paddingHorizontal: 20,
  },
  headerText: {
    fontSize: 11,
    fontWeight: 'bold',
    textAlign: 'center',
    color: '#696969',
  },
  productHeader: {
    width: '40%',
    textAlign: 'center',
  },
  vencidasHeader: {
    width: '19%',
    textAlign: 'center',
  },
  devolucionHeader: {
    width: '19%',
    textAlign: 'center',
  },
  totalHeader: {
    width: '19%',
    textAlign: 'center',
  },
  quantityHeader: {
    width: '20%',
  },
  productContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 15,
    justifyContent: 'space-between',
  },
  productButton: {
    backgroundColor: 'white',
    borderRadius: 8,
    padding: 9,
    borderWidth: 1,
    borderColor: 'green',
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
    width: '40%',
    minHeight: 47,
    justifyContent: 'center',
    alignItems: 'center',
  },
  productName: {
    fontSize: 11,
    fontWeight: '900',
    color: 'black',
    textAlign: 'center',
  },
  quantityButton: {
    backgroundColor: 'white',
    borderRadius: 8,
    padding: 10,
    borderWidth: 1,
    borderColor: 'green',
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
    width: '19%',
    minHeight: 47,
    justifyContent: 'center',
    alignItems: 'center',
  },
  quantityText: {
    fontSize: 12,
    fontWeight: '900',
    textAlign: 'center',
    color: '#808080',
  },
});

export default Vencidas;
