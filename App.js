import React, { useState, useEffect, useRef } from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { createStackNavigator } from '@react-navigation/stack';

import { ImageBackground, StyleSheet, View } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import NetInfo from '@react-native-community/netinfo';
import LoginScreen from './LoginScreen';
import MainScreen from './MainScreen';
import OptionsScreen from './components/OptionsScreen';
import Cargue from './components/Cargue';
import Vencidas from './components/Vencidas';
import VentasScreen from './components/Ventas/VentasScreen';
import InicioRutas from './components/rutas/InicioRutas';
import SeleccionarDia from './components/rutas/SeleccionarDia';
import ListaClientes from './components/rutas/ListaClientes';
import 'react-native-gesture-handler';
import { inicializarProductos } from './services/ventasService';
import { precargarImagenes } from './components/Productos';
import { API_URL } from './config';


const Stack = createStackNavigator();
const DIAS_SEMANA = ['LUNES', 'MARTES', 'MIERCOLES', 'JUEVES', 'VIERNES', 'SABADO', 'DOMINGO'];

// 🆕 Función para precargar clientes de todos los vendedores
const precargarClientes = async (targetUserId = null) => {
  try {
    // Intentar obtener el último userId del AsyncStorage
    const lastUserId = targetUserId || await AsyncStorage.getItem('last_user_id');
    if (!lastUserId) return;

    console.log('🚀 Precargando clientes para', lastUserId);

    const response = await fetch(`${API_URL}/api/clientes-ruta/?vendedor_id=${lastUserId}`);
    if (response.ok) {
      const data = await response.json();
      const clientesFormateados = data.map(c => ({
        id: c.id.toString(),
        nombre: c.nombre_contacto || c.nombre_negocio,
        negocio: c.nombre_negocio,
        celular: c.telefono || '',
        direccion: c.direccion || '',
        dia_visita: c.dia_visita,
        esDeRuta: true
      }));

      const payloadTodos = JSON.stringify({
        clientes: clientesFormateados,
        timestamp: Date.now()
      });

      // Guardar en cache (legacy + nuevo)
      const operacionesCache = [
        AsyncStorage.setItem(`clientes_cache_${lastUserId}`, payloadTodos),
        AsyncStorage.setItem(`clientes_cache_todos_${lastUserId}`, payloadTodos)
      ];

      // Guardar también cache por día para mejorar funcionamiento offline
      DIAS_SEMANA.forEach((dia) => {
        const clientesDia = clientesFormateados.filter((c) =>
          c.dia_visita?.toUpperCase().includes(dia)
        );
        operacionesCache.push(
          AsyncStorage.setItem(
            `clientes_cache_dia_${lastUserId}_${dia}`,
            JSON.stringify({ clientes: clientesDia, timestamp: Date.now() })
          )
        );
      });

      await Promise.all(operacionesCache);

      console.log('✅ Clientes precargados:', clientesFormateados.length);
    }
  } catch (error) {
    console.log('⚠️ Error precargando clientes:', error.message);
  }
};

// 🆕 Precargar rutas para permitir crear cliente sin depender de internet en ese momento
const precargarRutas = async (targetUserId = null) => {
  try {
    const lastUserId = targetUserId || await AsyncStorage.getItem('last_user_id');
    if (!lastUserId) return;

    const response = await fetch(`${API_URL}/api/rutas/?vendedor=${lastUserId}`);
    if (!response.ok) return;

    const rutas = await response.json();
    await AsyncStorage.setItem(
      `rutas_cache_${lastUserId}`,
      JSON.stringify({ rutas, timestamp: Date.now() })
    );
    console.log('✅ Rutas precargadas:', rutas.length);
  } catch (error) {
    console.log('⚠️ Error precargando rutas:', error.message);
  }
};

const App = () => {
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [userId, setUserId] = useState(null);
  const [vendedorNombre, setVendedorNombre] = useState(null);
  const syncingRef = useRef(false);
  const onlineRef = useRef(null);

  useEffect(() => {
    // 🚀 Sincronizar productos, clientes e imágenes al iniciar la app (en paralelo)
    const precargarDatos = async () => {
      await Promise.all([
        inicializarProductos(),
        precargarClientes(),
        precargarRutas(),
        precargarImagenes()
      ]);
      
      // 🆕 Sincronizar pendientes en segundo plano
      sincronizarPendientesEnFondo();
    };
    precargarDatos();
  }, []);

  // 🆕 Sincronizar clientes y ventas pendientes
  const sincronizarPendientesEnFondo = async () => {
    if (syncingRef.current) return;
    syncingRef.current = true;
    try {
      const { sincronizarTodo } = await import('./services/syncService');
      const resultado = await sincronizarTodo();
      
      const totalSincronizados = (resultado.clientes?.sincronizados || 0) + (resultado.ventas?.sincronizados || 0);
      
      if (totalSincronizados > 0) {
        console.log(`✅ Sincronizados: ${totalSincronizados} registros`);
      }
    } catch (error) {
      console.log('⚠️ No se pudo sincronizar pendientes:', error.message);
    } finally {
      syncingRef.current = false;
    }
  };

  // 🆕 Al recuperar internet, sincronizar pendientes y refrescar caché offline
  useEffect(() => {
    const unsubscribe = NetInfo.addEventListener(async (state) => {
      const online = !!state.isConnected && state.isInternetReachable !== false;

      if (onlineRef.current === null) {
        onlineRef.current = online;
        return;
      }

      if (online && !onlineRef.current) {
        console.log('🌐 Internet recuperado: sincronizando pendientes y actualizando caché...');
        await sincronizarPendientesEnFondo();
        await Promise.allSettled([
          precargarClientes(userId),
          precargarRutas(userId)
        ]);
      }

      onlineRef.current = online;
    });

    return () => unsubscribe();
  }, [userId]);

  const handleLogin = (loggedIn, username, nombre, token = null) => {
    setIsLoggedIn(loggedIn);
    setUserId(username);
    setVendedorNombre(nombre);

    // 🆕 Guardar userId para precarga futura
    if (username) {
      AsyncStorage.setItem('last_user_id', username);
      if (token) {
        AsyncStorage.setItem('auth_token', token);
      }
      // Precargar datos offline inmediatamente después del login
      Promise.allSettled([
        precargarClientes(username),
        precargarRutas(username)
      ]);
      sincronizarPendientesEnFondo();
    }
  };

  return (
    <NavigationContainer>
      {isLoggedIn ? (
        <Stack.Navigator screenOptions={{ headerShown: false }}>
          <Stack.Screen name="Options">
            {(props) => <OptionsScreen {...props} userId={userId} onLogout={() => {
              AsyncStorage.removeItem('auth_token');
              setIsLoggedIn(false);
            }} />}
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
