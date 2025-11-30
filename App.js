import React, { useState, useEffect } from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { createStackNavigator } from '@react-navigation/stack';

import { ImageBackground, StyleSheet, View } from 'react-native';
import LoginScreen from './LoginScreen';
import MainScreen from './MainScreen';
import OptionsScreen from './components/OptionsScreen';
import Cargue from './components/Cargue';
import Vencidas from './components/Vencidas';
import VentasScreen from './components/Ventas/VentasScreen';
import InicioRutas from './components/rutas/InicioRutas';
import SeleccionarRuta from './components/rutas/SeleccionarRuta';
import SeleccionarDia from './components/rutas/SeleccionarDia';
import ListaClientes from './components/rutas/ListaClientes';
import 'react-native-gesture-handler';
import { inicializarProductos } from './services/ventasService';


const Stack = createStackNavigator();

const App = () => {
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [userId, setUserId] = useState(null);
  const [vendedorNombre, setVendedorNombre] = useState(null);

  useEffect(() => {
    // Sincronizar productos al iniciar la app
    inicializarProductos();
  }, []);

  const handleLogin = (loggedIn, username, nombre) => {
    setIsLoggedIn(loggedIn);
    setUserId(username);
    setVendedorNombre(nombre);
  };

  return (
    <NavigationContainer>
      {isLoggedIn ? (
        <Stack.Navigator screenOptions={{ headerShown: false }}>
          <Stack.Screen name="Options">
            {(props) => <OptionsScreen {...props} userId={userId} />}
          </Stack.Screen>
          <Stack.Screen name="Main">
            {(props) => <MainScreen {...props} userId={userId} />}
          </Stack.Screen>
          <Stack.Screen name="Ventas">
            {(props) => <VentasScreen {...props} userId={userId} vendedorNombre={vendedorNombre} />}
          </Stack.Screen>
          <Stack.Screen name="Cargue">
            {(props) => <Cargue {...props} userId={userId} />}
          </Stack.Screen>
          <Stack.Screen name="Vencidas">
            {(props) => <Vencidas {...props} userId={userId} />}
          </Stack.Screen>
          <Stack.Screen name="InicioRutas">
            {(props) => <InicioRutas {...props} userId={userId} />}
          </Stack.Screen>
          <Stack.Screen name="SeleccionarRuta">
            {(props) => <SeleccionarRuta {...props} userId={userId} />}
          </Stack.Screen>
          <Stack.Screen name="SeleccionarDia" component={SeleccionarDia} />
          <Stack.Screen name="ListaClientes" component={ListaClientes} />
        </Stack.Navigator>
      ) : (
        <View style={styles.container}>
          <ImageBackground source={require('./images/banner.png')} style={styles.background} resizeMode="cover">
            <LoginScreen onLogin={handleLogin} />
          </ImageBackground>
        </View>
      )}
    </NavigationContainer>
  );
};


const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  background: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    width: '100%',
    height: '100%',
  },
});

export default App;