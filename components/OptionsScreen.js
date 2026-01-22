import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet, StatusBar, ImageBackground, Alert, BackHandler } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage'; // 🆕

const OptionsScreen = ({ navigation, userId, onLogout }) => {
  // Eliminado carguePressed, ya no es necesario forzar la navegación a Cargue
  // Eliminado isPressed, ya no es necesario

  const handleOptionPress = (screen) => {
    // Navega directamente a la pantalla solicitada
    navigation.navigate(screen, { userId });
  };

  const confirmarSalida = () => {
    Alert.alert(
      "Cerrar Aplicación",
      "¿Seguro que quieres salir de la app?",
      [
        { text: "Cancelar", style: "cancel" },
        {
          text: "Salir",
          style: "destructive",
          onPress: () => BackHandler.exitApp() // 🚪 Cierra la App (Android)
        }
      ]
    );
  };

  // 🆕 Función para borrar datos locales
  const handleLimpiarDatos = () => {
    Alert.alert(
      '⚠️ Resetear App Móvil',
      'Esto borrará todas las ventas guardadas localmente, clientes en caché y configuraciones de ESTE dispositivo.\n\nÚsalo para corregir problemas de "ventas fantasma" o datos desactualizados.\n\n¿Estás seguro?',
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'BORRAR TODO',
          style: 'destructive',
          onPress: async () => {
            try {
              // Borrar todas las keys relevantes
              const keys = ['ventas', 'clientes', 'productos_cache', 'ventas_pendientes_sync', 'DEVICE_ID'];
              await AsyncStorage.multiRemove(keys);
              // Opcional: await AsyncStorage.clear(); // Demasiado agresivo si hay tokens de auth

              Alert.alert('✅ Reseteo Completado', 'Por favor cierra completamente la aplicación y vuelve a abrirla para recargar todo limpio.');
            } catch (e) {
              Alert.alert('Error', 'No se pudo limpiar el almacenamiento: ' + e.message);
            }
          }
        }
      ]
    );
  };


  return (
    <ImageBackground
      source={require('../assets/banner2.png')} // Cambia la ruta a tu imagen
      style={styles.container} // Utiliza el mismo estilo que tenías en tu contenedor
      resizeMode="cover" // Puedes ajustar esto a 'contain' si prefieres
    >
      <StatusBar hidden={true} />

      {/* 🆕 Botón de Salida (Flecha/Logout) */}
      <TouchableOpacity
        style={styles.logoutButton}
        onPress={confirmarSalida}
      >
        <Ionicons name="log-out-outline" size={32} color="white" />
        {/* <Text style={styles.logoutText}>Salir</Text> */}
      </TouchableOpacity>

      <TouchableOpacity style={styles.option} onPress={() => handleOptionPress('Main')}>
        <View style={styles.iconWithText}>
          <Ionicons name="cloud-upload-outline" size={24} color="white" style={styles.icon} />
          <Text style={styles.optionText}>Sugeridos</Text>
        </View>
      </TouchableOpacity>

      <TouchableOpacity style={styles.option} onPress={() => navigation.navigate('Cargue', { userId })}>
        <View style={[styles.iconWithText, { paddingRight: 14.5 }]}>
          <Ionicons name="cloud-download-outline" size={24} color="white" style={styles.icon} />
          <Text style={styles.optionText}>Cargue</Text>
        </View>
      </TouchableOpacity>

      <TouchableOpacity
        style={styles.option}
        onPress={() => navigation.navigate('Ventas', { userId })}
      >
        <View style={styles.iconWithText}>
          <Ionicons name="cart-outline" size={24} color="white" style={styles.icon} />
          <Text style={styles.optionText}>Ventas</Text>
        </View>
      </TouchableOpacity>

      <TouchableOpacity style={styles.option} onPress={() => handleOptionPress('Vencidas')}>
        <View style={styles.iconWithText}>
          <Ionicons name="newspaper-outline" size={24} color="white" style={styles.icon} />
          <Text style={styles.optionText}>Rendimiento</Text>
        </View>
      </TouchableOpacity>




    </ImageBackground>
  );
};
const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingBottom: 70, // ⬆️ Ajuste final fino
  },

  option: {
    backgroundColor: '#00ad53',
    padding: 20,
    marginVertical: 20,
    width: '80%',
    alignItems: 'center',
    borderRadius: 10,
  },
  optionText: {
    color: 'white',
    fontSize: 18,
    fontWeight: 'bold',
  },
  iconWithText: {
    flexDirection: 'row', // Alinea el ícono y el texto en fila
    alignItems: 'center', // Alinea el ícono y el texto verticalmente
  },
  icon: {
    marginRight: 10, // Espacio entre el ícono y el texto
  },
  logoutButton: {
    position: 'absolute',
    top: 40, // Bajamos un poco para evitar el notch/status bar
    right: 20,
    padding: 10,
    backgroundColor: 'rgba(0,0,0,0.3)', // Fondo semitransparente circular
    borderRadius: 30,
    zIndex: 10, // Asegura que esté por encima de todo
  },
  logoutText: {
    color: 'white',
    fontSize: 12,
    marginTop: -2
  }
});

export default OptionsScreen;
