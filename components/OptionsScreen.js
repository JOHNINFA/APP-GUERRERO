import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet, StatusBar, ImageBackground } from 'react-native';
import { Ionicons } from '@expo/vector-icons';



const OptionsScreen = ({ navigation, userId }) => {
  // Eliminado carguePressed, ya no es necesario forzar la navegación a Cargue
  // Eliminado isPressed, ya no es necesario

  const handleOptionPress = (screen) => {
    // Navega directamente a la pantalla solicitada
    navigation.navigate(screen, { userId });
  };


  return (
    <ImageBackground
      source={require('../assets/banner2.png')} // Cambia la ruta a tu imagen
      style={styles.container} // Utiliza el mismo estilo que tenías en tu contenedor
      resizeMode="cover" // Puedes ajustar esto a 'contain' si prefieres
    >
      <StatusBar hidden={true} />




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
});

export default OptionsScreen;
