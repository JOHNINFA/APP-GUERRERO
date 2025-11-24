import React, { useState, useMemo } from 'react';
import { ScrollView, TouchableOpacity, Text, StyleSheet, Alert, ActivityIndicator, View, FlatList } from 'react-native';
import DateTimePicker from '@react-native-community/datetimepicker';
import Product from './Product';
import productos from './Productos'; // Importar productos con imágenes


// ⚠️ AJUSTAR ESTA URL SEGÚN EL ENTORNO
// Emulador Android: 'http://10.0.2.2:8000/api/guardar-sugerido/'
// Dispositivo Físico: 'http://192.168.1.19:8000/api/guardar-sugerido/' (IP de tu PC)
const API_URL = 'http://192.168.1.19:8000/api/guardar-sugerido/';

const ProductList = ({ selectedDay, userId }) => {
  const [quantities, setQuantities] = useState({});
  const [loading, setLoading] = useState(false);
  const [date, setDate] = useState(new Date());
  const [showDatePicker, setShowDatePicker] = useState(false);

  // Crear un mapa de productos por nombre para búsqueda rápida
  const productMap = useMemo(() => {
    const map = {};
    productos.forEach(p => {
      map[p.name] = p;
    });
    return map;
  }, []);

  const handleQuantityChange = (productName, quantity) => {
    setQuantities((prevQuantities) => ({
      ...prevQuantities,
      [productName]: quantity,
    }));
  };

  const handleSendPress = () => {
    if (!loading && selectedDay) {
      setShowDatePicker(true); // Abre el DatePicker para seleccionar fecha
    }
  };

  const handleDateChange = async (event, selectedDate) => {
    setShowDatePicker(false); // Cierra el DatePicker

    // Detectar si el usuario seleccionó "Cancelar" en lugar de confirmar la fecha
    if (event.type === 'dismissed') {
      setLoading(false); // No enviar si se canceló
      return;
    }

    const currentDate = selectedDate || date;
    setDate(currentDate); // Actualiza la fecha seleccionada
    setLoading(true); // Activa el estado de carga

    // ✅ CORREGIDO: Formatear fecha usando hora local (no UTC) para evitar cambio de día
    const year = currentDate.getFullYear();
    const month = String(currentDate.getMonth() + 1).padStart(2, '0');
    const day = String(currentDate.getDate()).padStart(2, '0');
    const formattedDate = `${year}-${month}-${day}`;

    console.log('📅 Fecha seleccionada:', currentDate);
    console.log('📅 Fecha formateada:', formattedDate);
    console.log('📅 Día de la semana:', currentDate.getDay());

    // ✅ VALIDACIÓN: Verificar que el día seleccionado coincida con la fecha
    const diasSemana = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];
    const diaDeLaFecha = diasSemana[currentDate.getDay()];
    
    console.log('📅 Día calculado:', diaDeLaFecha);
    console.log('📅 Día seleccionado:', selectedDay);
    
    if (diaDeLaFecha.toUpperCase() !== selectedDay.toUpperCase()) {
      Alert.alert(
        'Error de Fecha',
        `La fecha seleccionada (${formattedDate}) es ${diaDeLaFecha}, pero seleccionaste ${selectedDay}. Por favor elige una fecha que corresponda a ${selectedDay}.`
      );
      setLoading(false);
      return;
    }

    try {
      // Filtrar productos con cantidad > 0
      const productosAEnviar = productos.map(p => ({
        nombre: p.name,
        cantidad: parseInt(quantities[p.name] || 0)
      })).filter(p => p.cantidad > 0);

      if (productosAEnviar.length === 0) {
        Alert.alert('Aviso', 'No hay productos con cantidades para enviar');
        setLoading(false);
        return;
      }

      const payload = {
        vendedor_id: userId,
        dia: selectedDay.toUpperCase(),
        fecha: formattedDate,
        productos: productosAEnviar
      };

      console.log('Enviando Sugerido:', payload);

      const response = await fetch(API_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload)
      });

      const result = await response.json();

      if (response.ok) {
        Alert.alert('Éxito', `Sugerido enviado correctamente.\n${result.message || ''}`);
        setQuantities({}); // Limpiar cantidades tras envío exitoso
      } else {
        // ✅ Manejar error de sugerido duplicado
        if (result.error === 'YA_EXISTE_SUGERIDO') {
          Alert.alert(
            'Sugerido Ya Existe',
            `Ya enviaste un sugerido para ${selectedDay} ${formattedDate}.\n\nNo puedes enviar otro sugerido para el mismo día.`,
            [{ text: 'Entendido', style: 'cancel' }]
          );
        } else {
          Alert.alert('Error', result.message || result.error || 'Error al enviar datos al CRM');
        }
      }

    } catch (error) {
      console.error('Error enviando sugerido:', error);
      Alert.alert('Error de Conexión', 'No se pudo conectar con el CRM. Verifica tu conexión a internet.');
    } finally {
      setLoading(false);
    }
  };

  const renderProduct = ({ item }) => (
    <Product
      product={item}
      onQuantityChange={handleQuantityChange}
      quantity={quantities[item.name] || ''}
    />
  );

  return (
    <View style={styles.container}>
      <FlatList
        data={productos}
        renderItem={renderProduct}
        keyExtractor={(item) => item.name}
        contentContainerStyle={styles.scrollContainer}
        initialNumToRender={10}
        maxToRenderPerBatch={10}
        windowSize={5}
        removeClippedSubviews={true}
        getItemLayout={(data, index) => ({
          length: 150, // altura aproximada de cada item
          offset: 150 * index,
          index,
        })}
      />

      {selectedDay && (
        <TouchableOpacity
          style={[styles.sendButton, loading && styles.disabledButton]}
          onPress={handleSendPress}
          disabled={loading}
        >
          {loading ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text style={styles.sendButtonText}>Enviar Sugerido</Text>
          )}
        </TouchableOpacity>
      )}

      {showDatePicker && (
        <DateTimePicker
          value={date}
          mode="date"
          display="default"
          onChange={handleDateChange}
        />
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    paddingBottom: 80, // Espacio para el botón flotante
  },
  scrollContainer: {
    padding: 10,
  },
  sendButton: {
    position: 'absolute',
    bottom: 20,
    left: 20,
    right: 20,
    backgroundColor: '#00ad53',
    padding: 15,
    borderRadius: 10,
    alignItems: 'center',
    elevation: 5,
  },
  disabledButton: {
    backgroundColor: '#a5d6a7',
  },
  sendButtonText: {
    color: '#fff',
    fontSize: 18,
    fontWeight: 'bold',
  },
});

export default ProductList;