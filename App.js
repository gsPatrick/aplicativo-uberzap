import 'react-native-gesture-handler';
import React from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { createStackNavigator } from '@react-navigation/stack';
import { getSession } from './src/utils/session';
import { ActivityIndicator, View } from 'react-native';
import * as Location from 'expo-location';
import * as TaskManager from 'expo-task-manager';
import Constants from 'expo-constants';
import AsyncStorage from '@react-native-async-storage/async-storage';
import api from './src/services/api';

const appVariant =
  Constants.expoConfig?.extra?.appVariant ||
  process.env.APP_VARIANT ||
  'passenger';

// Screens - Passageiro
import PassengerLoginScreen from './src/screens/passenger/LoginScreen';
import PassengerHomeScreen from './src/screens/passenger/HomeScreen';
import PrincipalScreen from './src/screens/passenger/PrincipalScreen';
import ChatScreen from './src/screens/passenger/ChatScreen';
import DriverProfileScreen from './src/screens/passenger/DriverProfileScreen';
import WalletScreen from './src/screens/passenger/WalletScreen';
import HistoryScreen from './src/screens/passenger/HistoryScreen';
import ProfileScreen from './src/screens/passenger/ProfileScreen';
import SupportScreen from './src/screens/passenger/SupportScreen';
import NotificationScreen from './src/screens/passenger/NotificationScreen';
import ForgotPasswordScreen from './src/screens/passenger/ForgotPasswordScreen';
import PassengerRegisterScreen from './src/screens/passenger/RegisterScreen';

// Screens - Motorista
import DriverHomeScreen from './src/screens/driver/HomeScreen';
import DriverLoginScreen from './src/screens/driver/DriverLoginScreen';
import DriverRegisterScreen from './src/screens/driver/DriverRegisterScreen';
import VehicleProfileScreen from './src/screens/driver/VehicleProfileScreen';
import DriverEarningsScreen from './src/screens/driver/DriverEarningsScreen';
import DriverWalletScreen from './src/screens/driver/DriverWalletScreen';
import DriverHistoryScreen from './src/screens/driver/DriverHistoryScreen';
import DriverSupportScreen from './src/screens/driver/DriverSupportScreen';
import DriverDocsScreen from './src/screens/driver/DriverDocsScreen';
import DriverAlertsScreen from './src/screens/driver/DriverAlertsScreen';
import TaximeterScreen from './src/screens/driver/TaximeterScreen';

const LOCATION_TRACKING_TASK = 'LOCATION_TRACKING_TASK';

// Tarefa de rastreamento em background (ignorada no Expo Go)
TaskManager.defineTask(LOCATION_TRACKING_TASK, async ({ data, error }) => {
  const isExpoGo = Constants?.appOwnership === 'expo';
  if (isExpoGo) {
    return;
  }
  if (error) {
    if (String(error?.code) === '0') return;
    console.error('[Background Task] Erro no rastreamento:', error);
    return;
  }
  if (data) {
    const { locations } = data;
    const location = locations[0];
    if (location) {
      try {
        const driverId = await AsyncStorage.getItem('driverId');
        if (driverId) {
          await api.driver.updateLocation(driverId, 2, location.coords.latitude, location.coords.longitude);
        }
      } catch (err) {
        console.log('[Background Task] Erro ao enviar posição:', err);
      }
    }
  }
});

const Stack = createStackNavigator();

export default function App() {
  const [initialRoute, setInitialRoute] = React.useState(null);

  React.useEffect(() => {
    setInitialRoute(appVariant === 'driver' ? 'DriverLogin' : 'PassengerLogin');
  }, []);

  if (!initialRoute) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#000' }}>
        <ActivityIndicator size="large" color="#FFC107" />
      </View>
    );
  }

  return (
    <NavigationContainer>
      <Stack.Navigator 
        initialRouteName={initialRoute}
        screenOptions={{ headerShown: false }}
      >
        {/* Fluxo Passageiro */}
        <Stack.Screen name="PassengerLogin" component={PassengerLoginScreen} />
        <Stack.Screen name="PassengerRegister" component={PassengerRegisterScreen} />
        <Stack.Screen name="ForgotPassword" component={ForgotPasswordScreen} />
        <Stack.Screen name="PassengerPrincipal" component={PrincipalScreen} />
        <Stack.Screen name="PassengerHome" component={PassengerHomeScreen} />
        <Stack.Screen name="ChatScreen" component={ChatScreen} />
        <Stack.Screen name="DriverProfileScreen" component={DriverProfileScreen} />
        <Stack.Screen name="WalletScreen" component={WalletScreen} />
        <Stack.Screen name="HistoryScreen" component={HistoryScreen} />
        <Stack.Screen name="ProfileScreen" component={ProfileScreen} />
        <Stack.Screen name="SupportScreen" component={SupportScreen} />
        <Stack.Screen name="NotificationScreen" component={NotificationScreen} />

        {/* Fluxo Motorista */}
        <Stack.Screen name="DriverLogin" component={DriverLoginScreen} />
        <Stack.Screen name="DriverHome" component={DriverHomeScreen} />
        <Stack.Screen name="DriverRegister" component={DriverRegisterScreen} />
        <Stack.Screen name="VehicleProfile" component={VehicleProfileScreen} />
        <Stack.Screen name="DriverEarnings" component={DriverEarningsScreen} />
        <Stack.Screen name="DriverWallet" component={DriverWalletScreen} />
        <Stack.Screen name="DriverHistory" component={DriverHistoryScreen} />
        <Stack.Screen name="DriverSupport" component={DriverSupportScreen} />
        <Stack.Screen name="DriverDocs" component={DriverDocsScreen} />
        <Stack.Screen name="DriverAlerts" component={DriverAlertsScreen} />
        <Stack.Screen name="Taximeter" component={TaximeterScreen} />
      </Stack.Navigator>
    </NavigationContainer>
  );
}
