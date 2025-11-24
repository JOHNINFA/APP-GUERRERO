import React, { useState } from 'react';
import { View, TextInput, Button, StyleSheet, Alert, ImageBackground, StatusBar } from 'react-native';

const LoginScreen = ({ onLogin }) => {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');

  // ⚠️ USUARIOS HARDCODEADOS PARA DESARROLLO - Mapeados a IDs del CRM
  // Estos IDs corresponden a CargueID1, CargueID2, etc. en el backend Django
  const users = {
    'ID1': '1234',      // Usuario ID1 del CRM
    'ID2': '1234',      // Usuario ID2 del CRM
    'ID3': '1234',      // Usuario ID3 del CRM
    'ID4': '1234',      // Usuario ID4 del CRM
    'ID5': '1234',      // Usuario ID5 del CRM
    'ID6': '1234',      // Usuario ID6 del CRM
    'admin': 'admin',   // Usuario administrador de prueba
  };

  // ⚠️ URL COMENTADA TEMPORALMENTE - NO TOCAR GOOGLE SHEETS DURANTE DESARROLLO
  const API_URL = null; // 'https://script.google.com/macros/s/AKfycbxwYn4Ea1FMWIHXgjBTRSvTf5CJZ-J6B5iyahxUnH0yTmIc2lNQ0NncUh_2pprMyjo/exec';

  const handleLogin = () => {
    // Verifica las credenciales ingresadas
    if (users[username] && users[username] === password) {
      onLogin(true, username); // Pasa el nombre de usuario para identificar al usuario
    } else {
      Alert.alert('Error', 'Nombre de usuario o contraseña incorrectos.');
    }
  };

  return (
    <ImageBackground source={require('./images/banner.png')} style={styles.background}>
      <StatusBar hidden={true} />
      <View style={styles.container}>
        <TextInput
          style={styles.input}
          placeholder="Nombre de usuario"
          value={username}
          onChangeText={setUsername}
        />
        <TextInput
          style={styles.input}
          placeholder="Contraseña"
          secureTextEntry
          value={password}
          onChangeText={setPassword}
        />
        <Button title="Iniciar sesión" onPress={handleLogin} />
      </View>
    </ImageBackground>
  );
};

const styles = StyleSheet.create({
  background: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    width: '100%',
    height: '100%',
  },
  container: {
    width: '80%',
    padding: 20,
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    marginTop: 130,
    borderRadius: 10,
  },
  input: {
    backgroundColor: 'white',
    borderRadius: 8,
    padding: 10,
    marginBottom: 15,
  },
});

export default LoginScreen;